import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useMemo } from 'react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import { useScopedMaterialSelector } from '@/modules/catalog/hooks/use-scoped-material-selector'
import {
  useWarehouseCapabilityValidation,
  type CapabilityValidation,
} from '@/modules/warehouse/hooks/use-warehouse-capability-validation'
import {
  createEmptyAssetInput,
  createEmptyAssetLine,
  isAssetMaterial,
  type AssetLineDocumentType,
  type AssetLinesContainer,
  type AssetLineValues,
} from '@/shared/documents/schemas/document-lines.schemas'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/shared/forms/form'
import type { OptionLoader } from '@/shared/selectors/selector-adapter'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import type { CapabilityOperation, Material } from '@/shared/types/generated/eiams-v1'

// The editor is a component file by contract; its schema and draft mapper live
// in ../schemas/document-lines.schemas.ts (e12-t05).

/**
 * Form shape the editor reads: the `lines` group a dedicated asset-capture
 * page carries, plus the `assetLines` group mixed-document pages compose so
 * quantity and asset editors coexist in one form.
 */
type AssetLineFieldValues = AssetLinesContainer & { assetLines: AssetLineValues[] }
type AssetLineFieldName = keyof AssetLineFieldValues & string

export interface AssetLineEditorProps {
  /** Only document types that register new asset records (Receiving | Opening). */
  documentType: AssetLineDocumentType
  warehouseId: string | undefined
  disabled?: boolean
  /**
   * Form-group name the editor's FieldArray reads. Pages that compose the
   * quantity and asset editors side by side pass a distinct group (e.g.
   * `assetLines`) so the two `lines`-shaped containers coexist in one form.
   */
  namePrefix?: AssetLineFieldName
}

/** Inbound opening balances share the Receiving capability operation. */
function capabilityOperationFor(documentType: AssetLineDocumentType): CapabilityOperation {
  return documentType === 'Opening' ? 'Receiving' : documentType
}

interface MaterialSelectorControlProps {
  disabled: boolean
  loadOptions: OptionLoader<Material>
  onValueChange: (value: string | null, option: AsyncSelectOption<Material> | undefined) => void
  scopeReady: boolean
  value: string
}

/**
 * AsyncSelect wiring the shared FormItem owns: the combobox inputs a raw id
 * and aria attributes itself, so the control wires them from `useFormField()`
 * instead of going through FormControl's cloneElement.
 */
function MaterialSelectorControl({
  disabled,
  loadOptions,
  onValueChange,
  scopeReady,
  value,
}: MaterialSelectorControlProps) {
  const { error, formDescriptionId, formItemId, formMessageId, required } = useFormField()
  return (
    <AsyncSelect<Material>
      value={value === '' ? null : value}
      loadOptions={loadOptions}
      onValueChange={onValueChange}
      disabled={disabled || !scopeReady}
      inputProps={{
        id: formItemId,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        'aria-describedby':
          [formDescriptionId, error ? formMessageId : ''].filter(Boolean).join(' ') || undefined,
      }}
      placeholder={scopeReady ? 'ابحث عن مادة أصل...' : 'بانتظار اختيار النطاق...'}
      emptyMessage="لا توجد مواد أصول نشطة مطابقة ضمن نطاقك."
      errorMessage="تعذر البحث عن مواد الأصول ضمن نطاقك."
    />
  )
}

interface AssetUnitCardProps {
  disabled: boolean
  lineIndex: number
  namePrefix: AssetLineFieldName
  unitIndex: number
  onRemove: () => void
}

/**
 * One per-unit sub-card inside an asset line: the four optional `AssetInput`
 * identifiers (asset number — server-allocated when empty at posting —
 * manufacturer serial, acquisition date, warranty expiry) plus the
 * remove-unit action. Every control is a FormField with Arabic labels and
 * inline errors; ltr text inputs for the identifiers.
 */
function AssetUnitCard({
  disabled,
  lineIndex,
  namePrefix,
  unitIndex,
  onRemove,
}: AssetUnitCardProps) {
  const { control } = useFormContext<AssetLineFieldValues>()
  const basePath = `${namePrefix}.${lineIndex}.assetInputs.${unitIndex}` as const
  return (
    <fieldset
      data-slot="asset-unit-card"
      disabled={disabled}
      className="grid gap-3 rounded-lg border border-dashed border-border p-3"
    >
      <legend className="px-1 text-sm font-medium text-foreground">الوحدة {unitIndex + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={control}
          name={`${basePath}.assetNumber`}
          render={({ field: assetNumberField, fieldState }) => (
            <FormItem>
              <FormLabel>رقم الأصل (اختياري)</FormLabel>
              <FormControl>
                <Input
                  dir="ltr"
                  className="text-start"
                  placeholder="رقم الأصل الداخلي (اختياري — يُمنح آلياً عند الترحيل)"
                  aria-invalid={fieldState.invalid || undefined}
                  value={assetNumberField.value ?? ''}
                  onChange={assetNumberField.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`${basePath}.serialNumber`}
          render={({ field: serialField, fieldState }) => (
            <FormItem>
              <FormLabel>الرقم التسلسلي (اختياري)</FormLabel>
              <FormControl>
                <Input
                  dir="ltr"
                  className="text-start"
                  placeholder="الرقم التسلسلي للجهة المصنعة"
                  aria-invalid={fieldState.invalid || undefined}
                  value={serialField.value ?? ''}
                  onChange={serialField.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`${basePath}.acquisitionDate`}
          render={({ field: dateField, fieldState }) => (
            <FormItem>
              <FormLabel>تاريخ الحصول (اختياري)</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  aria-invalid={fieldState.invalid || undefined}
                  value={dateField.value ?? ''}
                  onChange={dateField.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`${basePath}.warrantyExpiry`}
          render={({ field: dateField, fieldState }) => (
            <FormItem>
              <FormLabel>تاريخ انتهاء الضمان (اختياري)</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  aria-invalid={fieldState.invalid || undefined}
                  value={dateField.value ?? ''}
                  onChange={dateField.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="justify-self-start text-destructive hover:text-destructive"
        aria-label={`حذف الوحدة ${unitIndex + 1} من البند ${lineIndex + 1}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <IconTrash aria-hidden />
      </Button>
    </fieldset>
  )
}

interface AssetLineRowProps {
  disabled: boolean
  index: number
  loadMaterials: OptionLoader<Material>
  namePrefix: AssetLineFieldName
  onRemove: () => void
  operation: CapabilityOperation
  scopeReady: boolean
  validates: (domainId: string | undefined, operation: CapabilityOperation) => CapabilityValidation
}

/**
 * One editable asset line card. Material selection snapshots the display
 * fields, seeds one empty unit, and rejects any non-Asset material selection
 * with an inline Arabic error (defensive: the loader already filters to
 * `materialKind === 'Asset'`, mirroring the complement of the quantity
 * editor). Adding/removing units derives the line quantity — the read-only
 * count the contract maps to `quantity` + one `AssetInput` per unit.
 */
function AssetLineRow({
  disabled,
  index,
  loadMaterials,
  namePrefix,
  onRemove,
  operation,
  scopeReady,
  validates,
}: AssetLineRowProps) {
  const { control, getValues, setValue, setError, clearErrors } =
    useFormContext<AssetLineFieldValues>()
  const line = (useWatch({ control, name: `${namePrefix}.${index}` }) ??
    {}) as Partial<AssetLineValues>
  const linePath = `${namePrefix}.${index}` as const

  const assetInputs = line.assetInputs ?? []
  const quantity = line.quantity ?? assetInputs.length
  const capability = validates(line.materialDomainId, operation)

  const handleMaterialChange = (
    nextValue: string | null,
    option: AsyncSelectOption<Material> | undefined,
    onMaterialIdChange: (value: string) => void,
  ) => {
    const payload = option?.payload
    if (
      option !== undefined &&
      option !== null &&
      payload !== undefined &&
      !isAssetMaterial(payload)
    ) {
      onMaterialIdChange('')
      setError(`${linePath}.materialId`, {
        type: 'manual',
        message: 'يجب اختيار مادة من نوع أصل لهذا البند.',
      })
      return
    }
    clearErrors(`${linePath}.materialId`)
    onMaterialIdChange(nextValue ?? '')
    setValue(`${linePath}.materialNameAr`, payload?.nameAr ?? '')
    setValue(`${linePath}.materialDomainId`, payload?.domain.id ?? '')
    setValue(`${linePath}.baseUnitId`, payload?.baseUnit.id ?? '')
    setValue(`${linePath}.baseUnitNameAr`, payload?.baseUnit.displayName ?? '')
    if (payload !== undefined) {
      setValue(`${linePath}.assetInputs`, [createEmptyAssetInput()])
      setValue(`${linePath}.quantity`, 1)
    }
  }

  const addUnit = () => {
    const current = getValues(`${linePath}.assetInputs`) ?? []
    setValue(`${linePath}.assetInputs`, [...current, createEmptyAssetInput()])
    setValue(`${linePath}.quantity`, current.length + 1)
  }

  const removeUnit = (unitIndex: number) => {
    const current = getValues(`${linePath}.assetInputs`) ?? []
    const remaining = current.filter((_unit, itemIndex) => itemIndex !== unitIndex)
    setValue(`${linePath}.assetInputs`, remaining)
    setValue(`${linePath}.quantity`, remaining.length)
  }

  return (
    <fieldset
      data-slot="asset-line-row"
      disabled={disabled}
      className="grid gap-3 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-medium text-foreground">بند الأصول {index + 1}</legend>
      <FormField
        control={control}
        name={`${linePath}.materialId`}
        render={({ field: materialField }) => (
          <FormItem>
            <FormLabel>المادة (أصل)</FormLabel>
            <MaterialSelectorControl
              value={materialField.value}
              onValueChange={(nextValue, option) =>
                handleMaterialChange(nextValue, option, materialField.onChange)
              }
              loadOptions={loadMaterials}
              scopeReady={scopeReady}
              disabled={disabled}
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <div
        data-slot="asset-line-quantity"
        className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
      >
        <span className="text-muted-foreground">الكمية (تُحتسب بعدد وحدات الأصل)</span>
        <span data-slot="asset-line-quantity-value" className="font-medium text-foreground">
          {quantity}{' '}
          {line.baseUnitNameAr !== undefined && line.baseUnitNameAr !== ''
            ? line.baseUnitNameAr
            : 'وحدة'}
        </span>
      </div>
      {assetInputs.length > 0 ? (
        <div className="grid gap-2">
          {assetInputs.map((_unit, unitIndex) => (
            <AssetUnitCard
              key={`${unitIndex}-${line.lineId ?? 'new'}`}
              lineIndex={index}
              namePrefix={namePrefix}
              unitIndex={unitIndex}
              disabled={disabled}
              onRemove={() => removeUnit(unitIndex)}
            />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          aria-label={`إضافة وحدة/أصل إلى البند ${index + 1}`}
          disabled={disabled}
          onClick={addUnit}
        >
          <IconPlus aria-hidden data-icon="inline-start" />
          إضافة وحدة/أصل
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          aria-label={`حذف البند ${index + 1}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <IconTrash aria-hidden data-icon="inline-start" />
          إزالة البند
        </Button>
      </div>
      {capability.status === 'blocked' ? (
        <p role="alert" className="text-sm text-destructive">
          {capability.messageAr}
        </p>
      ) : capability.status === 'unknown' && (line.materialDomainId ?? '') !== '' ? (
        <p className="text-sm text-muted-foreground">
          التحقق من قدرة المستودع يتطلب اختيار المستودع ضمن قسم رأس السند.
        </p>
      ) : null}
    </fieldset>
  )
}

/**
 * The shared asset-line capture editor (e12-t05): the page-owned `lines`
 * FieldArray of Asset-kind material rows, where each line is one per-unit
 * `AssetInput` capture (D-MAT-01 fixed assets). The material search includes
 * Asset materials (via the `useScopedMaterialSelector(true)` opt-in) and the
 * loaders filter to `materialKind === 'Asset'`, complementing the quantity
 * editor; non-asset selections are rejected defensively with an inline Arabic
 * error. Adding/removing unit cards derives the line quantity displayed
 * read-only — asset lines are base-unit counted and never offer unit
 * conversion (`unitId`/`conversionId` stay absent).
 *
 * RHF contract: the editor reads the page's form context through the
 * `namePrefix` group (default `lines`), mirroring {@link AssetLinesContainer};
 * pages compose `assetLinesSchema` into their resolver, pass `documentType`
 * and the header `warehouseId` for capability hints, and flatten the lines
 * through `toAssetLineInputs` into `buildDraftRequest`. Mixed-document pages
 * (quantity + asset lines in one form) pass `namePrefix="assetLines"` so the
 * two `lines`-shaped containers coexist. The server allocates a missing
 * institutional asset number at POST, so drafts accept rows with empty asset
 * numbers.
 */
export function AssetLineEditor({
  documentType,
  warehouseId,
  disabled = false,
  namePrefix = 'lines',
}: AssetLineEditorProps) {
  const { control, formState } = useFormContext<AssetLineFieldValues>()
  const { fields, append, remove } = useFieldArray<AssetLineFieldValues, AssetLineFieldName>({
    control,
    name: namePrefix,
  })
  const materialSelector = useScopedMaterialSelector(true)
  const { loadOptions: loadAllOptions, scopeReady } = materialSelector
  const capabilityValidation = useWarehouseCapabilityValidation(warehouseId)
  const operation = capabilityOperationFor(documentType)
  const linesErrorMessage = (
    formState.errors as Record<
      string,
      { root?: { message?: string }; message?: string } | undefined
    >
  )[namePrefix]
  const linesError = linesErrorMessage?.root?.message ?? linesErrorMessage?.message

  const loadAssetMaterials = useMemo<OptionLoader<Material>>(
    () => async (query) => {
      const options = await loadAllOptions(query)
      return options.filter(
        (option) => option.payload !== undefined && isAssetMaterial(option.payload),
      )
    },
    [loadAllOptions],
  )

  return (
    <div data-slot="asset-line-editor" className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لم تُضف بنود أصول بعد. اختر مادة من نوع أصل وسجّل وحدة لكل بند ليُتاح حفظ المسودة.
        </p>
      ) : (
        fields.map((field, index) => (
          <AssetLineRow
            key={field.id}
            index={index}
            disabled={disabled}
            loadMaterials={loadAssetMaterials}
            namePrefix={namePrefix}
            onRemove={() => remove(index)}
            operation={operation}
            scopeReady={scopeReady}
            validates={capabilityValidation.validates}
          />
        ))
      )}
      {linesError !== undefined ? (
        <p role="alert" className="text-sm text-destructive">
          {linesError}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={disabled || !scopeReady}
        onClick={() => append(createEmptyAssetLine())}
      >
        <IconPlus aria-hidden data-icon="inline-start" />
        إضافة بند أصل
      </Button>
    </div>
  )
}
