import { useEffect } from 'react'

import { normalizeApiError } from '@/shared/services/api-error'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import type { ScopeContext } from '@/shared/types/generated/eiams-v1'
import { toast } from '@/shared/ui/toast-manager'

const scopeTypeLabels: Readonly<Record<ScopeContext['scopeType'], string>> = {
  Enterprise: 'المؤسسة',
  Site: 'الموقع',
  Warehouse: 'المستودع',
}

function scopeValue(scope: ScopeContext): string {
  return `${scope.scopeType}:${scope.scopeId ?? 'enterprise'}`
}

function sameScope(first: ScopeContext, second: ScopeContext): boolean {
  return first.scopeType === second.scopeType && first.scopeId === second.scopeId
}

/**
 * Displays the server-selected work scope and submits only a server-provided
 * scope choice. The session query remains the sole source of truth; selecting
 * another option delegates cache isolation and session replacement to
 * useActiveScopeContext.
 */
function ActiveScopeSwitcher() {
  const {
    activeScope,
    data: session,
    isLoading,
    isSwitchingScope,
    switchError,
    switchScope,
  } = useActiveScopeContext()

  useEffect(() => {
    if (switchError === null) {
      return
    }

    const apiError = normalizeApiError(switchError)
    toast.error({
      title: apiError.titleAr,
      ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
    })
  }, [switchError])

  if (isLoading) {
    return (
      <div
        data-slot="active-scope-switcher"
        aria-busy="true"
        aria-label="جارٍ تحميل نطاق العمل"
        className="hidden items-center gap-2 md:flex"
      >
        <Skeleton className="h-8 w-36 bg-forest-light before:via-sidebar-border/30" />
      </div>
    )
  }

  if (activeScope === undefined || session === undefined) {
    return null
  }

  const availableScopes = session.availableScopes
  const canSwitch = availableScopes.length > 1
  if (!canSwitch) {
    return (
      <div
        data-slot="active-scope-switcher"
        aria-label="نطاق العمل الحالي"
        className="hidden min-w-0 items-center gap-2 text-sidebar-border md:flex"
      >
        <span className="text-xs font-medium whitespace-nowrap">نطاق العمل</span>
        <span className="max-w-48 truncate text-sm font-semibold text-white">
          {activeScope.displayName}
        </span>
      </div>
    )
  }

  const selectedValue = scopeValue(activeScope)

  return (
    <div data-slot="active-scope-switcher" className="hidden min-w-0 md:block">
      <Select<string>
        value={selectedValue}
        items={availableScopes.map((scope) => ({
          value: scopeValue(scope),
          label: scope.displayName,
        }))}
        disabled={isSwitchingScope}
        onValueChange={(value) => {
          if (value === null) {
            return
          }

          const nextScope = availableScopes.find((scope) => scopeValue(scope) === value)
          if (nextScope === undefined || sameScope(nextScope, activeScope)) {
            return
          }

          void switchScope({ scopeType: nextScope.scopeType, scopeId: nextScope.scopeId }).catch(
            () => undefined,
          )
        }}
      >
        <SelectTrigger
          aria-label="تبديل نطاق العمل"
          aria-invalid={switchError !== null || undefined}
          className="h-9 min-w-44 max-w-64 border-sidebar-border bg-forest-light text-white hover:bg-forest-light data-placeholder:text-sidebar-border [&_svg]:text-sidebar-border"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="min-w-64">
          <SelectGroup>
            <SelectLabel>نطاق العمل</SelectLabel>
            {availableScopes.map((scope) => (
              <SelectItem key={scopeValue(scope)} value={scopeValue(scope)}>
                <span className="min-w-0 truncate">{scope.displayName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {scopeTypeLabels[scope.scopeType]}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

export { ActiveScopeSwitcher }
