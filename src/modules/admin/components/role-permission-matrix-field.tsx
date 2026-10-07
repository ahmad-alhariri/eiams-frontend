import type { Control } from 'react-hook-form'

import type {
  PermissionMatrixRow,
  RolePermissionsFormValues,
} from '@/modules/admin/schemas/role-permissions.schemas'
import { FormField, FormItem, FormMessage } from '@/shared/forms/form'
import { Checkbox } from '@/shared/ui/checkbox'

export interface RolePermissionMatrixFieldProps {
  control: Control<RolePermissionsFormValues>
  disabled: boolean
  idPrefix: string
  rows: readonly PermissionMatrixRow[]
}

/** Renders a permission's allowed scope types as an Arabic phrase. */
function scopeTypesLabel(row: PermissionMatrixRow): string {
  return row.allowedScopeTypes.join('، ')
}

/** Shared editable matrix seam used by both role-permission surfaces. */
export function RolePermissionMatrixField({
  control,
  disabled,
  idPrefix,
  rows,
}: RolePermissionMatrixFieldProps) {
  return (
    <FormField
      control={control}
      name="permissionCodes"
      render={({ field, fieldState }) => (
        <FormItem>
          <fieldset
            aria-invalid={fieldState.invalid || undefined}
            className="overflow-hidden rounded-md border border-border"
          >
            <legend className="sr-only">الصلاحيات المسندة إلى الدور</legend>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-muted-foreground">
              <span>الصلاحية</span>
              <span>مُسندة</span>
            </div>
            {rows.map((permission) => {
              const inputId = `${idPrefix}-${permission.code}`
              const checked = field.value.includes(permission.code)
              // A permission that cannot take effect at any scope this role may be
              // assigned at is left selectable if it is already granted, so the
              // administrator can see and remove a pre-existing grant rather than
              // being unable to touch the row at all.
              const rowDisabled = disabled || (!permission.grantable && !checked)
              const notGrantableReason =
                permission.grantable || checked
                  ? null
                  : `لا يمكن إسنادها لهذا الدور لأن صلاحيتها محدودة بنطاق ${scopeTypesLabel(permission)}.`
              return (
                <div
                  key={permission.code}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="grid gap-1">
                    <label
                      htmlFor={inputId}
                      className="cursor-pointer font-semibold text-foreground"
                    >
                      {permission.nameAr}
                    </label>
                    <code dir="ltr" className="w-fit text-xs text-muted-foreground">
                      {permission.code}
                    </code>
                    {permission.descriptionAr ? (
                      <span className="text-sm text-muted-foreground">
                        {permission.descriptionAr}
                      </span>
                    ) : null}
                    {notGrantableReason ? (
                      <span id={`${inputId}-reason`} className="text-sm text-muted-foreground">
                        {notGrantableReason}
                      </span>
                    ) : null}
                  </div>
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    disabled={rowDisabled}
                    aria-describedby={notGrantableReason ? `${inputId}-reason` : undefined}
                    onCheckedChange={(nextChecked) => {
                      field.onChange(
                        nextChecked
                          ? [...field.value, permission.code]
                          : field.value.filter((code) => code !== permission.code),
                      )
                    }}
                  />
                </div>
              )
            })}
          </fieldset>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
