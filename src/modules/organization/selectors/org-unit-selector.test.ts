import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useOrgUnitSelector } from './org-unit-selector'
import { createOrganizationalUnit, fixtureUuid } from '@/test/msw/factories'

/**
 * An organizational unit is a valid assignment target only while it is Active.
 * The adapter marks every other status as disabled; AsyncSelect cannot select a
 * disabled option, so no inactive unit can become a form value. This is a UI
 * guard only — the backend remains authoritative and no server guard is added.
 */
describe('useOrgUnitSelector — inactive units are never valid assignment targets', () => {
  const active = createOrganizationalUnit({
    id: fixtureUuid(70),
    name: 'وحدة نشطة',
    code: 'OU-A',
  })
  const inactive = createOrganizationalUnit({
    id: fixtureUuid(71),
    name: 'وحدة معطلة',
    code: 'OU-I',
    status: 'Inactive',
  })

  it('disables an inactive unit in the direct entity-to-option mapping', () => {
    const loader = vi.fn().mockResolvedValue([active, inactive])
    const { result } = renderHook(() => useOrgUnitSelector(loader))

    expect(result.current.options.toOption(active)).toMatchObject({
      value: active.id,
      label: active.name,
      disabled: false,
      payload: active,
    })
    expect(result.current.options.toOption(inactive)).toMatchObject({
      value: inactive.id,
      label: inactive.name,
      disabled: true,
      payload: inactive,
    })
  })

  it('keeps the disabled flag through the asynchronous option loader', async () => {
    const loader = vi.fn().mockResolvedValue([active, inactive])
    const { result } = renderHook(() => useOrgUnitSelector(loader))

    const options = await result.current.loadOptions('')

    expect(options.find((option) => option.value === active.id)?.disabled).toBe(false)
    expect(options.find((option) => option.value === inactive.id)?.disabled).toBe(true)
  })
})
