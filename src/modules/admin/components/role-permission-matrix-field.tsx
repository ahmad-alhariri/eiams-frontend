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
                  </div>
                  <Checkbox
                    id={inputId}
                    checked={field.value.includes(permission.code)}
                    disabled={disabled}
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
