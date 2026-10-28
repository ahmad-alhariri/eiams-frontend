import { IconPlus, IconTrash } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import {
  useMaterialUnitConversionsQuery,
  useUnitsOfMeasureQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import { MATERIAL_KIND_LABELS } from '@/modules/catalog/constants/catalog-labels'
import { isMaterialKind, policyDescription } from '@/modules/catalog/constants/material-kind-policy'
import { useScopedMaterialSelector } from '@/modules/catalog/hooks/use-scoped-material-selector'
import {
  useWarehouseCapabilityValidation,
  type CapabilityValidation,
} from '@/modules/warehouse/hooks/use-warehouse-capability-validation'
import {
  balanceHintAr,
  deriveBaseQuantity,
  OPENING_TYPE_LABELS,
  overBalance,
  QUANTITY_LINE_FEATURES_BY_TYPE,
  createEmptyQuantityLine,
  type DocumentLinesContainer,
  type QuantityLineFeatures,
  type QuantityLineValues,
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
import { DatePicker } from '@/shared/ui/date-picker'
import { cn } from '@/shared/utils/class-names'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { CapabilityOperation } from '@/modules/warehouse/types/warehouse.types'
import type { DocumentType } from '@/shared/documents/types/document-wire.types'
import type { Material, MaterialUnitConversion } from '@/modules/catalog/types/catalog.types'

// The editor is a component file by contract; its schema and draft mapper live
// in ../schemas/document-lines.schemas.ts (e12-t04).

export interface QuantityLineEditorProps {
  documentType: Exclude<DocumentType, 'Adjustment'>
  warehouseId: string | undefined
  disabled?: boolean
  features?: QuantityLineFeatures
  /**
   * Optional aggregate of selected-line capability checks. Pages that must
   * block persistence can consume this without reimplementing the warehouse
   * capability lookup or the Opening → Receiving operation mapping.
   */
  onCapabilityGateChange?: (gate: QuantityLineCapabilityGate) => void
  /**
   * Optional live-balance lookup for outbound documents (e16-t04). Given a
   * line index return the current available quantity for that line's material
   * in the source warehouse — `undefined` while unknown/loading, `null` when
   * the server holds no balance row. The editor stays transport-agnostic:
   * pages own the balance queries (module boundary), the shared layer only
   * renders the per-line hint and exposes the values for gate evaluation.
   */
  balanceForLine?: (index: number) => number | null | undefined
  /**
   * Optional per-line extra content slot rendered under the line fields
   * (e16-t05). Lets a page inject document-specific line UI — e.g. the Issue
   * existing-asset multi-select — without the shared editor learning about
   * that document type. Return `null` to render nothing for a line.
   */
  assetSlotForLine?: (index: number) => ReactNode
  /**
   * False by DEFAULT: Asset-kind materials stay excluded because
   * Receiving/Opening capture asset lines in their own asset-capture editor
   * (e12-t05). A caller that MOVES existing assets through quantity lines —
   * the Return page (FIX-R2) — sets this to make Asset-kind materials
   * searchable, then pairs it with an `assetSlotForLine` picker.
   */
  includeAssetMaterials?: boolean
  /**
   * Optional narrowing of the material options. `undefined` (the default)
   * keeps every active material offerable — the shared editor stays generic.
   * A document module that may only carry SOME of the catalog's materials
   * (the Return form: only what the selected original Issue can return) passes
   * its own rule here; the editor never learns that rule.
   */
  materialFilter?: ((material: Material) => boolean) | undefined
}

/** Aggregate capability state for the currently selected quantity-line materials. */
export type QuantityLineCapabilityGate =
  | { status: 'ready' }
  | { status: 'blocked'; messageAr: string; reason?: string }
  | { status: 'unverified'; messageAr: string; reason?: string }

const BASE_UNIT_VALUE = 'base'

/**
 * The unit selector's own read state, spelled out for the user.
 *
 * The conversions read is a SECONDARY read: the base unit is already known
 * from the material payload, so a failed read used to leave the selector
 * showing one option and no explanation — indistinguishable from "this
 * material has no alternative units". That silence is what let a keeper save
 * a document whose unit was never checked. A failed secondary read must stay
 * DISTINGUISHABLE from an empty one (feature-service-composition-standard,
 * scan 2), so the three states get three different presentations:
 *
 * - loading: a muted hint, the selector disabled (the list is not known yet);
 * - failed: an Arabic error, the selector disabled (a partial list is not a
 *   list, and picking from it would be a guess);
 * - loaded: the options, no message at all — an EMPTY list is a legitimate
 *   answer and needs no apology.
 */
const UNIT_CONVERSIONS_LOADING_AR = 'جارٍ تحميل الوحدات البديلة للمادة...'
const UNIT_CONVERSIONS_FAILED_AR =
  'تعذّر جلب الوحدات البديلة لهذه المادة. أعد المحاولة قبل اختيار الوحدة.'

/** Inbound opening balances share the Receiving capability operation. */
function capabilityOperationFor(
  documentType: Exclude<DocumentType, 'Adjustment'>,
): CapabilityOperation {
  return documentType === 'Opening' ? 'Receiving' : documentType
}

function capabilityGateForLines(
  lines: readonly Partial<QuantityLineValues>[],
  operation: CapabilityOperation,
  validates: (domainId: string | undefined, operation: CapabilityOperation) => CapabilityValidation,
): QuantityLineCapabilityGate {
  let hasUnverifiedLine = false

  for (const line of lines) {
    if ((line.materialId ?? '') === '') {
      continue
    }
    const capability = validates(line.materialDomainId, operation)
    if (capability.status === 'blocked') {
      return capability
    }
    if (capability.status === 'unknown') {
      hasUnverifiedLine = true
    }
  }

  return hasUnverifiedLine
    ? {
        status: 'unverified',
        messageAr: 'يتعذر حفظ المسودة قبل التحقق من قدرة المستودع لكل مادة مختارة.',
      }
    : { status: 'ready' }
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
      placeholder={scopeReady ? 'ابحث عن مادة...' : 'بانتظار اختيار النطاق...'}
      emptyMessage="لا توجد مواد نشطة مطابقة ضمن نطاقك."
      errorMessage="تعذر البحث عن المواد ضمن نطاقك."
    />
  )
}

function UnitSelector({
  baseUnitNameAr,
  conversions,
  index,
  isError,
  isLoading,
  label,
  onValueChange,
  unitLabel,
  value,
}: {
  baseUnitNameAr: string
  conversions: readonly MaterialUnitConversion[]
  index: number
  /** The conversions read FAILED: no option may be picked from a partial list. */
  isError: boolean
  /** The conversions read is still in flight: the option list is not known yet. */
  isLoading: boolean
  label: ReactNode
  onValueChange: (value: string | null) => void
  /** Label for a conversion's flat `fromUnitId`, resolved from the units list. */
  unitLabel: (unitId: string) => string
  value: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange} disabled={isLoading || isError}>
        <SelectTrigger aria-label={`وحدة البند ${index + 1}`}>
          <SelectValue>{value === BASE_UNIT_VALUE ? baseUnitNameAr : undefined}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BASE_UNIT_VALUE}>{baseUnitNameAr}</SelectItem>
          {conversions.map((conversion) => (
            <SelectItem key={conversion.id} value={conversion.id}>
              <span className="flex items-center justify-between gap-2">
                {unitLabel(conversion.fromUnitId)}
                <span className="text-muted-foreground" dir="ltr">
                  × {conversion.factor}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {UNIT_CONVERSIONS_LOADING_AR}
        </p>
      ) : null}
      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {UNIT_CONVERSIONS_FAILED_AR}
        </p>
      ) : null}
    </div>
  )
}

interface QuantityLineRowProps {
  disabled: boolean
  features: QuantityLineFeatures
  index: number
  loadMaterials: OptionLoader<Material>
  onRemove: () => void
  operation: CapabilityOperation
  scopeReady: boolean
  unitLabel: (unitId: string) => string
  validates: (domainId: string | undefined, operation: CapabilityOperation) => CapabilityValidation
  /** Known balance for this line's material; undefined while loading/unknown. */
  balance?: number | null | undefined
  /** Page-supplied extra content for this line (D-IAR-01 asset selector slot). */
  assetSlot?: ReactNode
}

/**
 * One editable line card. Material selection resets the unit to the base unit
 * (per D-UOM-01 the factor is material-scoped and server-derived, so a changed
 * material always invalidates a previously picked conversion). The capability
 * hint surfaces source-warehouse capability for the material's domain while
 * the keeper types, mirroring the preflight the manager enforces on post.
 */
function QuantityLineRow({
  disabled,
  features,
  index,
  loadMaterials,
  onRemove,
  operation,
  scopeReady,
  unitLabel,
  validates,
  balance,
  assetSlot,
}: QuantityLineRowProps) {
  const { control, getValues, setValue } = useFormContext<DocumentLinesContainer>()
  const line = (useWatch({ control, name: `lines.${index}` }) ?? {}) as Partial<QuantityLineValues>

  const activeMaterialId = line.materialId ?? ''
  const conversionsQuery = useMaterialUnitConversionsQuery(
    activeMaterialId === '' ? undefined : activeMaterialId,
  )
  const capability = validates(line.materialDomainId, operation)
  const materialKind = isMaterialKind(line.materialKind) ? line.materialKind : null

  return (
    <fieldset
      data-slot="quantity-line-row"
      disabled={disabled}
      className="grid gap-3 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-medium text-foreground">البند {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField
          control={control}
          name={`lines.${index}.materialId`}
          render={({ field: materialField }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>المادة</FormLabel>
              <MaterialSelectorControl
                value={materialField.value}
                onValueChange={(nextValue, option) => {
                  const payload = option?.payload
                  materialField.onChange(nextValue ?? '')
                  // Everything below is DERIVED from the payload. The optional
                  // chain above stops at `payload`, so a material option carrying
                  // no domain/unit reference used to THROW here and abort the rest
                  // of the handler — which silently skipped the unit reset and left
                  // the line posting quantity 0 against no base unit.
                  if (payload === undefined) {
                    setValue(`lines.${index}.materialNameAr`, '')
                    setValue(`lines.${index}.materialDomainId`, '')
                    setValue(`lines.${index}.materialKind`, undefined)
                    setValue(`lines.${index}.baseUnitNameAr`, '')
                    setValue(`lines.${index}.assetIds`, [])
                    setValue(`lines.${index}.unitId`, undefined)
                    setValue(`lines.${index}.conversionId`, null)
                    setValue(`lines.${index}.baseQuantity`, undefined)
                    return
                  }
                  setValue(`lines.${index}.materialNameAr`, payload.nameAr)
                  // Flat pairs on the material record: the derived
                  // `materialDomainId`/`materialDomainName` and the material's
                  // own `baseUnitId`/`baseUnitSymbol`. The retired nested
                  // `materialDomain` / `unit` references are not on this
                  // projection.
                  setValue(`lines.${index}.materialDomainId`, payload.materialDomainId)
                  setValue(`lines.${index}.materialKind`, payload.materialKind)
                  setValue(`lines.${index}.baseUnitNameAr`, payload.baseUnitSymbol)
                  // D-IAR-01: a material change invalidates a previously
                  // selected asset set (they belong to the old material).
                  setValue(`lines.${index}.assetIds`, [])
                  setValue(`lines.${index}.unitId`, undefined)
                  setValue(`lines.${index}.conversionId`, null)
                  setValue(`lines.${index}.baseQuantity`, undefined)
                }}
                loadOptions={loadMaterials}
                scopeReady={scopeReady}
                disabled={disabled}
              />
              {materialKind === null ? null : (
                <p className="text-sm text-muted-foreground">
                  نوع المادة: {MATERIAL_KIND_LABELS[materialKind]}
                  {materialKind === 'Consumable' ? null : ` — ${policyDescription(materialKind)}`}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`lines.${index}.quantity`}
          render={({ field: quantityField, fieldState }) => (
            <FormItem>
              <FormLabel>الكمية</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0"
                  aria-invalid={fieldState.invalid || undefined}
                  value={typeof quantityField.value === 'number' ? quantityField.value : ''}
                  onChange={(event) => {
                    const next = event.target.value
                    quantityField.onChange(next === '' ? '' : Number(next))
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <UnitSelector
          label="وحدة القياس"
          index={index}
          baseUnitNameAr={line.baseUnitNameAr || 'الوحدة الأساسية'}
          conversions={conversionsQuery.data?.items ?? []}
          isError={conversionsQuery.isError}
          isLoading={conversionsQuery.isLoading}
          value={line.conversionId ?? BASE_UNIT_VALUE}
          unitLabel={unitLabel}
          onValueChange={(nextValue) => {
            if (nextValue === null) {
              setValue(`lines.${index}.unitId`, undefined)
              setValue(`lines.${index}.conversionId`, null)
              setValue(`lines.${index}.baseQuantity`, undefined)
              return
            }
            const conversion = (conversionsQuery.data?.items ?? []).find(
              (item: MaterialUnitConversion) => item.id === nextValue,
            )
            if (conversion === undefined) {
              setValue(`lines.${index}.unitId`, undefined)
              setValue(`lines.${index}.conversionId`, null)
              setValue(`lines.${index}.baseQuantity`, undefined)
              return
            }
            const quantity = Number(getValues(`lines.${index}.quantity`))
            setValue(`lines.${index}.unitId`, conversion.fromUnitId)
            setValue(`lines.${index}.conversionId`, conversion.id)
            setValue(
              `lines.${index}.baseQuantity`,
              Number.isFinite(quantity) && quantity > 0
                ? deriveBaseQuantity(quantity, conversion.factor)
                : undefined,
            )
          }}
        />
        {features.unitPrice ? (
          <FormField
            control={control}
            name={`lines.${index}.unitPrice`}
            render={({ field: priceField, fieldState }) => (
              <FormItem>
                <FormLabel>سعر الوحدة (اختياري)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="0"
                    aria-invalid={fieldState.invalid || undefined}
                    value={typeof priceField.value === 'number' ? priceField.value : ''}
                    onChange={(event) => priceField.onChange(event.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {features.batchNumber ? (
          <FormField
            control={control}
            name={`lines.${index}.batchNumber`}
            render={({ field: batchField, fieldState }) => (
              <FormItem>
                <FormLabel>رقم الدفعة (اختياري)</FormLabel>
                <FormControl>
                  <Input
                    aria-invalid={fieldState.invalid || undefined}
                    value={batchField.value ?? ''}
                    onChange={batchField.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {features.expiryDate ? (
          <FormField
            control={control}
            name={`lines.${index}.expiryDate`}
            render={({ field: expiryField }) => (
              <FormItem>
                <FormLabel>تاريخ الانتهاء (اختياري)</FormLabel>
                <FormControl>
                  <DatePicker
                    ariaLabel={`تاريخ انتهاء البند ${index + 1}`}
                    {...(expiryField.value ? { value: dayjs(expiryField.value).toDate() } : {})}
                    onChange={(date) =>
                      expiryField.onChange(
                        date === undefined ? '' : dayjs(date).format('YYYY-MM-DD'),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {features.openingType ? (
          <FormField
            control={control}
            name={`lines.${index}.openingType`}
            render={({ field: openingField }) => (
              <FormItem>
                <FormLabel>نوع الافتتاحية</FormLabel>
                <Select value={openingField.value ?? ''} onValueChange={openingField.onChange}>
                  <SelectTrigger aria-label={`نوع الافتتاحية للبند ${index + 1}`}>
                    <SelectValue placeholder="اختر النوع">
                      {openingField.value === undefined
                        ? 'اختر النوع'
                        : OPENING_TYPE_LABELS[openingField.value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(OPENING_TYPE_LABELS) as ('Correction' | 'Initial')[]).map(
                      (openingType) => (
                        <SelectItem key={openingType} value={openingType}>
                          {OPENING_TYPE_LABELS[openingType]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
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
      {balanceHintAr(balance, line.quantity) !== null ? (
        <p
          className={cn(
            'text-sm',
            overBalance(balance, line.quantity) ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {balanceHintAr(balance, line.quantity)}
        </p>
      ) : null}
      {assetSlot ?? null}
      <Button
        type="button"
        variant="ghost"
        className="justify-self-start text-destructive hover:text-destructive"
        aria-label={`حذف البند ${index + 1}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <IconTrash aria-hidden data-icon="inline-start" />
        إزالة البند
      </Button>
    </fieldset>
  )
}

/**
 * The shared quantity line editor (e12-t04): the page-owned `lines` FieldArray
 * of material + quantity + unit rows, with optional price/batch/expiry
 * per document type, opening-type selection, material search scoped to the
 * active session scope, source-warehouse capability hints, and D-UOM-01 unit
 * conversion selection (base unit + active material conversions only).
 *
 * RHF contract: the editor reads the page's form context through the `lines`
 * name prefix, mirroring {@link DocumentLinesContainer}; pages compose
 * `documentLinesSchema` into their resolver and flatten the lines through
 * `toDocumentLineInputs` into `buildDraftRequest`.
 *
 * Asset-kind materials are excluded by DEFAULT (the asset-line capture editor
 * of e12-t05 owns those rows in Receiving/Opening); a caller opts in with
 * `includeAssetMaterials`, and the Return page does — a Return moves EXISTING
 * assets, so its Asset-kind lines pick them from `/returns/eligible-items`
 * through the `assetSlotForLine` seam. The optional fields follow the per-type
 * presets of {@link QUANTITY_LINE_FEATURES_BY_TYPE}, and every value maps 1:1
 * to the `DocumentLineInput` contract.
 */
export function QuantityLineEditor({
  documentType,
  warehouseId,
  disabled = false,
  features = QUANTITY_LINE_FEATURES_BY_TYPE[documentType],
  onCapabilityGateChange,
  balanceForLine,
  assetSlotForLine,
  includeAssetMaterials = false,
  materialFilter,
}: QuantityLineEditorProps) {
  const { control, formState } = useFormContext<DocumentLinesContainer>()
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const materialSelector = useScopedMaterialSelector(includeAssetMaterials)
  const filteredLoadOptions = useCallback(
    async (query: string) => {
      const results = await materialSelector.loadOptions(query)
      if (materialFilter === undefined) {
        return results
      }
      // The rule belongs to the calling document module; the editor only
      // applies it. An option without a material payload cannot be judged, so
      // it is not offered.
      return results.filter(
        (option) => option.payload !== undefined && materialFilter(option.payload),
      )
    },
    [materialSelector, materialFilter],
  )
  const capabilityValidation = useWarehouseCapabilityValidation(warehouseId)
  const operation = capabilityOperationFor(documentType)
  const lines = useWatch({ control, name: 'lines' })
  const capabilityGate = useMemo(
    () => capabilityGateForLines(lines ?? [], operation, capabilityValidation.validates),
    [lines, operation, capabilityValidation.validates],
  )

  /**
   * A conversion carries a flat `fromUnitId` and no nested unit reference, so
   * the alternative-unit label is resolved from the units-of-measure list — the
   * same idiom `material-unit-conversions.tsx` uses. The query is gated on a
   * material actually being picked: before that there is no conversion to label,
   * and an unconditional request would fire on every document form that opens.
   */
  const hasSelectedMaterial = (lines ?? []).some((line) => (line?.materialId ?? '') !== '')
  const unitsQuery = useUnitsOfMeasureQuery({}, { enabled: hasSelectedMaterial })
  const unitsById = useMemo(
    () => new Map((unitsQuery.data?.items ?? []).map((unit) => [unit.id, unit])),
    [unitsQuery.data],
  )
  const unitLabel = useCallback(
    // An unknown id falls back to the raw value rather than rendering a blank
    // row (a conversion whose unit the list has not loaded yet).
    (unitId: string) => unitsById.get(unitId)?.name ?? unitId,
    [unitsById],
  )

  useEffect(() => {
    onCapabilityGateChange?.(capabilityGate)
  }, [capabilityGate, onCapabilityGateChange])

  return (
    <div data-slot="quantity-line-editor" className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لم تُضف بنود بعد. أضف مادة وكمية لكل بند ليُتاح حفظ المسودة.
        </p>
      ) : (
        fields.map((field, index) => (
          <QuantityLineRow
            key={field.id}
            index={index}
            disabled={disabled}
            features={features}
            loadMaterials={filteredLoadOptions}
            onRemove={() => remove(index)}
            operation={operation}
            scopeReady={materialSelector.scopeReady}
            unitLabel={unitLabel}
            validates={capabilityValidation.validates}
            {...(balanceForLine === undefined ? {} : { balance: balanceForLine(index) })}
            {...(assetSlotForLine === undefined ? {} : { assetSlot: assetSlotForLine(index) })}
          />
        ))
      )}
      {(formState.errors.lines?.root?.message ?? formState.errors.lines?.message) ? (
        <p role="alert" className="text-sm text-destructive">
          {formState.errors.lines?.root?.message ?? formState.errors.lines?.message}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={disabled || !materialSelector.scopeReady}
        onClick={() => append(createEmptyQuantityLine())}
      >
        <IconPlus aria-hidden data-icon="inline-start" />
        إضافة بند
      </Button>
    </div>
  )
}
