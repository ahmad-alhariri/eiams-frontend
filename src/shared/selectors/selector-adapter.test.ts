import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useEmployeeSelector } from '@/shared/selectors/adapters/employee-selector'
import { useMaterialSelector } from '@/shared/selectors/adapters/material-selector'
import { useNamedReferenceSelector } from '@/shared/selectors/adapters/named-reference-selector'
import { useOrgUnitSelector } from '@/shared/selectors/adapters/org-unit-selector'
import { useSiteSelector } from '@/shared/selectors/adapters/site-selector'
import { useWarehouseSelector } from '@/shared/selectors/adapters/warehouse-selector'
import {
  createEntitySelectorAdapter,
  filterEntitiesBySearchLabel,
  filterOptionsByLabel,
  normalizeSelectorOptions,
  useScopedEntityOptions,
  type SelectorOption,
} from '@/shared/selectors/selector-adapter'
import type {
  Employee,
  Material,
  NamedReference,
  OrganizationalUnit,
  Site,
  Warehouse,
} from '@/shared/types/generated/eiams-v1'

const siteRef: NamedReference = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'S-01',
  displayName: 'فرع دمشق',
  status: 'Active',
}

const activeWarehouse: Warehouse = {
  warehouseId: '22222222-2222-4222-8222-222222222222',
  code: 'W-01',
  nameAr: 'مستودع دمشق الرئيسي',
  locationAr: 'دمشق',
  site: siteRef,
  status: 'Active',
  rowVersion: 1,
}

const inactiveWarehouse: Warehouse = {
  ...activeWarehouse,
  warehouseId: '33333333-3333-4333-8333-333333333333',
  code: 'W-02',
  nameAr: 'مستودع حلب',
  status: 'Inactive',
}

const activeEmployee: Employee = {
  employeeId: '44444444-4444-4444-8444-444444444444',
  employeeNumber: 'EMP-001',
  fullNameAr: 'أحمد علي',
  jobTitleAr: 'أمين مستودع',
  orgUnit: { id: 'ou-1', code: 'OU-01', displayName: 'قسم المستودعات', status: 'Active' },
  site: siteRef,
  status: 'Active',
  rowVersion: 1,
}

const activeOrgUnit: OrganizationalUnit = {
  orgUnitId: 'ou-1',
  code: 'OU-01',
  nameAr: 'قسم المستودعات',
  siteId: siteRef.id,
  status: 'Active',
  rowVersion: 1,
}

const activeSite: Site = {
  siteId: 'site-1',
  code: 'S-01',
  nameAr: 'فرع دمشق',
  status: 'Active',
  rowVersion: 1,
}

const activeMaterial: Material = {
  materialId: 'mat-1',
  code: 'M-01',
  nameAr: 'ورق تصوير A4',
  baseUnit: { id: 'uom-1', code: 'RL', displayName: 'رزمة', status: 'Active' },
  category: { id: 'cat-1', code: 'C-01', displayName: 'قرطاسية', status: 'Active' },
  domain: { id: 'dom-1', code: 'D-01', displayName: 'مستهلكات', status: 'Active' },
  family: { id: 'fam-1', code: 'F-01', displayName: 'ورق', status: 'Active' },
  materialKind: 'Consumable',
  requiresAssetNumber: false,
  trackingType: 'Quantity',
  status: 'Active',
  rowVersion: 1,
}

describe('createEntitySelectorAdapter', () => {
  it('defaults toOptionLabel and searchLabel from the mapped option label', () => {
    const adapter = createEntitySelectorAdapter<Warehouse>({
      toOption: (warehouse) => ({
        value: warehouse.warehouseId,
        label: warehouse.nameAr,
        payload: warehouse,
      }),
    })

    expect(adapter.toOption(activeWarehouse).label).toBe('مستودع دمشق الرئيسي')
    expect(adapter.toOptionLabel(activeWarehouse)).toBe('مستودع دمشق الرئيسي')
    expect(adapter.searchLabel(activeWarehouse)).toBe('مستودع دمشق الرئيسي')
  })

  it('honors explicit toOptionLabel and searchLabel', () => {
    const adapter = createEntitySelectorAdapter<Warehouse>({
      toOption: (warehouse) => ({ value: warehouse.warehouseId, label: warehouse.nameAr }),
      toOptionLabel: (warehouse) => `${warehouse.nameAr} (${warehouse.code})`,
      searchLabel: (warehouse) => warehouse.code,
    })

    expect(adapter.toOptionLabel(activeWarehouse)).toBe('مستودع دمشق الرئيسي (W-01)')
    expect(adapter.searchLabel(activeWarehouse)).toBe('W-01')
  })
})

describe('normalizeSelectorOptions', () => {
  it('dedupes by option value keeping the first occurrence', () => {
    const options: SelectorOption<Warehouse>[] = [
      { value: 'a', label: 'الأول' },
      { value: 'a', label: 'مكرر' },
      { value: 'b', label: 'الثاني' },
    ]

    expect(normalizeSelectorOptions(options, 10)).toEqual([
      { value: 'a', label: 'الأول' },
      { value: 'b', label: 'الثاني' },
    ])
  })

  it('skips options with empty or whitespace-only labels', () => {
    const options: SelectorOption<Warehouse>[] = [
      { value: 'a', label: 'الأول' },
      { value: 'b', label: '' },
      { value: 'c', label: '   ' },
      { value: 'd', label: 'الرابع' },
    ]

    expect(normalizeSelectorOptions(options, 10)).toEqual([
      { value: 'a', label: 'الأول' },
      { value: 'd', label: 'الرابع' },
    ])
  })

  it('slices to maxResults', () => {
    const options: SelectorOption<Warehouse>[] = [1, 2, 3, 4, 5].map((n) => ({
      value: `v-${n}`,
      label: `خيار ${n}`,
    }))

    expect(normalizeSelectorOptions(options, 3)).toHaveLength(3)
    expect(normalizeSelectorOptions(options, 3)[0]?.value).toBe('v-1')
  })

  it('returns an empty array when maxResults is zero or negative', () => {
    const options: SelectorOption<Warehouse>[] = [{ value: 'a', label: 'الأول' }]

    expect(normalizeSelectorOptions(options, 0)).toEqual([])
    expect(normalizeSelectorOptions(options, -1)).toEqual([])
  })
})

const testWarehouseAdapter = createEntitySelectorAdapter<Warehouse>({
  toOption: (warehouse) => ({
    value: warehouse.warehouseId,
    label: warehouse.nameAr,
    disabled: warehouse.status !== 'Active',
    payload: warehouse,
  }),
})

describe('useScopedEntityOptions', () => {
  it('maps loaded entities through the adapter and returns AsyncSelect options', async () => {
    const loader = vi.fn(async () => [activeWarehouse, inactiveWarehouse])
    const { result } = renderHook(() => useScopedEntityOptions(testWarehouseAdapter, loader))

    let options: SelectorOption<Warehouse>[] = []
    await act(async () => {
      options = await result.current('مستودع')
    })

    expect(loader).toHaveBeenCalledExactlyOnceWith('مستودع')
    expect(options).toEqual([
      {
        value: activeWarehouse.warehouseId,
        label: 'مستودع دمشق الرئيسي',
        disabled: false,
        payload: activeWarehouse,
      },
      {
        value: inactiveWarehouse.warehouseId,
        label: 'مستودع حلب',
        disabled: true,
        payload: inactiveWarehouse,
      },
    ])
  })

  it('normalizes results (dedupe, empty labels) and slices to maxResults', async () => {
    const duplicate: Warehouse = { ...inactiveWarehouse, warehouseId: activeWarehouse.warehouseId }
    const noLabel: Warehouse = { ...inactiveWarehouse, nameAr: '   ' }
    const loader = vi.fn(async () => [activeWarehouse, duplicate, noLabel])
    const { result } = renderHook(() => useScopedEntityOptions(testWarehouseAdapter, loader, 2))

    let options: SelectorOption<Warehouse>[] = []
    await act(async () => {
      options = await result.current('مستودع')
    })

    expect(options).toHaveLength(1)
    expect(options[0]?.value).toBe(activeWarehouse.warehouseId)
  })

  it('propagates loader failures', async () => {
    const error = new Error('تعذر تحميل المستودعات')
    const loader = vi.fn(async () => {
      throw error
    })
    const { result } = renderHook(() => useScopedEntityOptions(testWarehouseAdapter, loader))

    await expect(act(async () => result.current('مستودع'))).rejects.toBe(error)
  })

  it('stays referentially stable while the injected loader is stable', () => {
    const loader = vi.fn()
    const { result, rerender } = renderHook(() =>
      useScopedEntityOptions(testWarehouseAdapter, loader),
    )

    const first = result.current
    rerender()

    expect(result.current).toBe(first)
  })

  it('creates a new loader when the injected loader changes', () => {
    const { result, rerender } = renderHook(
      ({ loader }) => useScopedEntityOptions(testWarehouseAdapter, loader),
      { initialProps: { loader: vi.fn() } },
    )

    const first = result.current
    rerender({ loader: vi.fn() })

    expect(result.current).not.toBe(first)
  })
})

describe('filterOptionsByLabel', () => {
  it('filters options by Arabic substring on the label', () => {
    const options: SelectorOption<Warehouse>[] = [
      { value: 'a', label: 'مستودع دمشق الرئيسي' },
      { value: 'b', label: 'مستودع حلب' },
      { value: 'c', label: 'مستودع حمص' },
    ]

    expect(filterOptionsByLabel(options, 'حل')).toEqual([options[1]])
  })

  it('matches case-insensitively for Latin text', () => {
    const options: SelectorOption<Material>[] = [
      { value: 'a', label: 'ورق A4' },
      { value: 'b', label: 'طابعة Hp' },
    ]

    expect(filterOptionsByLabel(options, 'a4')).toEqual([options[0]])
    expect(filterOptionsByLabel(options, 'HP')).toEqual([options[1]])
  })

  it('returns all options for an empty or whitespace query', () => {
    const options: SelectorOption<Warehouse>[] = [
      { value: 'a', label: 'مستودع دمشق' },
      { value: 'b', label: 'مستودع حلب' },
    ]

    expect(filterOptionsByLabel(options, '')).toEqual(options)
    expect(filterOptionsByLabel(options, '   ')).toEqual(options)
  })

  it('returns an empty array when nothing matches', () => {
    const options: SelectorOption<Warehouse>[] = [{ value: 'a', label: 'مستودع دمشق' }]

    expect(filterOptionsByLabel(options, 'حمص')).toEqual([])
  })
})

describe('filterEntitiesBySearchLabel', () => {
  it('filters raw entities by a custom searchLabel (code search)', () => {
    const adapter = createEntitySelectorAdapter<Warehouse>({
      toOption: (warehouse) => ({ value: warehouse.warehouseId, label: warehouse.nameAr }),
      searchLabel: (warehouse) => warehouse.code,
    })

    expect(
      filterEntitiesBySearchLabel(adapter, [activeWarehouse, inactiveWarehouse], 'W-02'),
    ).toEqual([inactiveWarehouse])
    expect(filterEntitiesBySearchLabel(adapter, [activeWarehouse, inactiveWarehouse], '')).toEqual([
      activeWarehouse,
      inactiveWarehouse,
    ])
  })

  it('matches Arabic search labels by default', () => {
    const adapter = createEntitySelectorAdapter<Warehouse>({
      toOption: (warehouse) => ({ value: warehouse.warehouseId, label: warehouse.nameAr }),
    })

    expect(
      filterEntitiesBySearchLabel(adapter, [activeWarehouse, inactiveWarehouse], 'حلب'),
    ).toEqual([inactiveWarehouse])
  })
})

describe('useNamedReferenceSelector', () => {
  it('labels with displayName, hints with code, disables only explicitly inactive references', () => {
    const { result } = renderHook(() => useNamedReferenceSelector(vi.fn()))

    const reference: NamedReference = { id: 'ref-1', code: 'W-01', displayName: 'مستودع دمشق' }
    const option = result.current.options.toOption(reference)

    expect(option.value).toBe('ref-1')
    expect(option.label).toBe('مستودع دمشق')
    expect(option.disabled).toBe(false)
    expect(option.payload?.code).toBe('W-01')
    expect(option.payload).toBe(reference)

    expect(result.current.options.toOption({ ...reference, status: 'Inactive' }).disabled).toBe(
      true,
    )
  })
})

describe('useWarehouseSelector', () => {
  it('maps warehouses with name label, code hint and active-only rule', () => {
    const { result } = renderHook(() => useWarehouseSelector(vi.fn()))

    const active = result.current.options.toOption(activeWarehouse)
    expect(active.value).toBe(activeWarehouse.warehouseId)
    expect(active.label).toBe('مستودع دمشق الرئيسي')
    expect(active.disabled).toBe(false)
    expect(active.payload?.code).toBe('W-01')
    expect(active.payload?.locationAr).toBe('دمشق')

    expect(result.current.options.toOption(inactiveWarehouse).disabled).toBe(true)
  })
})

describe('useEmployeeSelector', () => {
  it('maps employees with full name label and job title hint', () => {
    const { result } = renderHook(() => useEmployeeSelector(vi.fn()))

    const option = result.current.options.toOption(activeEmployee)
    expect(option.value).toBe(activeEmployee.employeeId)
    expect(option.label).toBe('أحمد علي')
    expect(option.disabled).toBe(false)
    expect(option.payload?.jobTitleAr).toBe('أمين مستودع')
    expect(option.payload?.employeeNumber).toBe('EMP-001')

    expect(
      result.current.options.toOption({ ...activeEmployee, status: 'Inactive' }).disabled,
    ).toBe(true)
  })

  it('keeps a null job title in the payload as a missing hint', () => {
    const { result } = renderHook(() => useEmployeeSelector(vi.fn()))
    const withoutTitle: Employee = { ...activeEmployee, jobTitleAr: null }

    expect(result.current.options.toOption(withoutTitle).payload?.jobTitleAr).toBeNull()
  })
})

describe('useOrgUnitSelector', () => {
  it('maps org units with name label and code hint', () => {
    const { result } = renderHook(() => useOrgUnitSelector(vi.fn()))

    const option = result.current.options.toOption(activeOrgUnit)
    expect(option.value).toBe(activeOrgUnit.orgUnitId)
    expect(option.label).toBe('قسم المستودعات')
    expect(option.disabled).toBe(false)
    expect(option.payload?.code).toBe('OU-01')

    expect(result.current.options.toOption({ ...activeOrgUnit, status: 'Inactive' }).disabled).toBe(
      true,
    )
  })
})

describe('useSiteSelector', () => {
  it('maps sites with name label and code hint', () => {
    const { result } = renderHook(() => useSiteSelector(vi.fn()))

    const option = result.current.options.toOption(activeSite)
    expect(option.value).toBe(activeSite.siteId)
    expect(option.label).toBe('فرع دمشق')
    expect(option.disabled).toBe(false)
    expect(option.payload?.code).toBe('S-01')

    expect(result.current.options.toOption({ ...activeSite, status: 'Inactive' }).disabled).toBe(
      true,
    )
  })
})

describe('useMaterialSelector', () => {
  it('maps materials with name label and code hint', () => {
    const { result } = renderHook(() => useMaterialSelector(vi.fn()))

    const option = result.current.options.toOption(activeMaterial)
    expect(option.value).toBe(activeMaterial.materialId)
    expect(option.label).toBe('ورق تصوير A4')
    expect(option.disabled).toBe(false)
    expect(option.payload?.code).toBe('M-01')

    expect(
      result.current.options.toOption({ ...activeMaterial, status: 'Inactive' }).disabled,
    ).toBe(true)
  })
})
