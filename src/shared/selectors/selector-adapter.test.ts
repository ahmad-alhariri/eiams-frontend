import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Material, NamedReference } from '@/modules/catalog/types/catalog.types'
import type {
  Employee,
  OrganizationalUnit,
  Site,
} from '@/modules/organization/types/organization.types'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.types'
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
import {
  createEmployee,
  createOrganizationalUnit,
  createSite,
  createWarehouse,
} from '@/test/msw/factories'

/**
 * Fixtures come from the shared MSW factories rather than hand-rolled literals
 * (txq4). The literals that used to live here described records the backend has
 * never sent — `warehouseId`, `nameAr`, a nested `site` — and every adapter
 * assertion below read those fields, so the suite validated the fiction against
 * itself: `warehouse.site.displayName` was `undefined` on both sides of the
 * comparison and could never fail.
 */
const siteRef: Site = createSite()

const activeWarehouse: Warehouse = createWarehouse({
  id: '22222222-2222-4222-8222-222222222222',
  code: 'W-01',
  name: 'مستودع دمشق الرئيسي',
  siteId: siteRef.id,
  status: 'Active',
})

const inactiveWarehouse: Warehouse = createWarehouse({
  id: '33333333-3333-4333-8333-333333333333',
  code: 'W-02',
  name: 'مستودع حلب',
  siteId: siteRef.id,
  status: 'Inactive',
})

const activeEmployee: Employee = createEmployee({
  id: '44444444-4444-4444-8444-444444444444',
  employeeNumber: 'EMP-001',
  fullName: 'أحمد علي',
  jobTitle: 'أمين مستودع',
  status: 'Active',
})

// Keeps the factory's default `id` (fixtureUuid(52)) so `createEmployee()`'s
// default `orgUnitId` resolves against it — the same join the employees screens
// perform against the real org-units list.
const activeOrgUnit: OrganizationalUnit = createOrganizationalUnit({
  name: 'قسم المستودعات',
  siteId: siteRef.id,
  unitType: 'Department',
  status: 'Active',
})

const activeSite: Site = createSite({
  id: '11111111-1111-4111-8111-111111111111',
  code: 'S-01',
  name: 'فرع دمشق',
  status: 'Active',
})

/**
 * Catalog has NOT been migrated onto the handwritten contracts, so this fixture
 * stays a literal against `catalog.api-types.Material` (nested
 * `materialFamily`/`materialCategory`/`materialDomain`/`unit`). The shared
 * `createMaterial()` factory mints the frozen generated `Material` — a
 * different type, with `baseUnit`/`category`/`domain`/`family` — so using it
 * here would test a record the adapter is not even typed against.
 */
const activeMaterial: Material = {
  materialId: 'mat-1',
  code: 'M-01',
  nameAr: 'ورق تصوير A4',
  descriptionAr: null,
  materialFamilyId: 'fam-1',
  materialFamily: { id: 'fam-1', displayName: 'ورق' },
  materialCategoryId: 'cat-1',
  materialCategory: { id: 'cat-1', displayName: 'قرطاسية' },
  materialDomainId: 'dom-1',
  materialDomain: { id: 'dom-1', displayName: 'مستهلكات' },
  unitId: 'uom-1',
  unit: { id: 'uom-1', displayName: 'رزمة' },
  nominalConversionFactor: 1,
  materialKind: 'Consumable',
  requiresAssetNumber: false,
  status: 'Active',
  rowVersion: 1,
}

describe('createEntitySelectorAdapter', () => {
  it('defaults toOptionLabel and searchLabel from the mapped option label', () => {
    const adapter = createEntitySelectorAdapter<Warehouse>({
      toOption: (warehouse) => ({
        value: warehouse.id,
        label: warehouse.name,
        payload: warehouse,
      }),
    })

    expect(adapter.toOption(activeWarehouse).label).toBe('مستودع دمشق الرئيسي')
    expect(adapter.toOptionLabel(activeWarehouse)).toBe('مستودع دمشق الرئيسي')
    expect(adapter.searchLabel(activeWarehouse)).toBe('مستودع دمشق الرئيسي')
  })

  it('honors explicit toOptionLabel and searchLabel', () => {
    const adapter = createEntitySelectorAdapter<Warehouse>({
      toOption: (warehouse) => ({ value: warehouse.id, label: warehouse.name }),
      toOptionLabel: (warehouse) => `${warehouse.name} (${warehouse.code})`,
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
    value: warehouse.id,
    label: warehouse.name,
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
        value: activeWarehouse.id,
        label: 'مستودع دمشق الرئيسي',
        disabled: false,
        payload: activeWarehouse,
      },
      {
        value: inactiveWarehouse.id,
        label: 'مستودع حلب',
        disabled: true,
        payload: inactiveWarehouse,
      },
    ])
  })

  it('normalizes results (dedupe, empty labels) and slices to maxResults', async () => {
    const duplicate: Warehouse = { ...inactiveWarehouse, id: activeWarehouse.id }
    const noLabel: Warehouse = { ...inactiveWarehouse, name: '   ' }
    const loader = vi.fn(async () => [activeWarehouse, duplicate, noLabel])
    const { result } = renderHook(() => useScopedEntityOptions(testWarehouseAdapter, loader, 2))

    let options: SelectorOption<Warehouse>[] = []
    await act(async () => {
      options = await result.current('مستودع')
    })

    expect(options).toHaveLength(1)
    expect(options[0]?.value).toBe(activeWarehouse.id)
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
      toOption: (warehouse) => ({ value: warehouse.id, label: warehouse.name }),
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
      toOption: (warehouse) => ({ value: warehouse.id, label: warehouse.name }),
    })

    expect(
      filterEntitiesBySearchLabel(adapter, [activeWarehouse, inactiveWarehouse], 'حلب'),
    ).toEqual([inactiveWarehouse])
  })
})

describe('useNamedReferenceSelector', () => {
  it('labels with displayName, treats all v1 references as enabled', () => {
    const { result } = renderHook(() => useNamedReferenceSelector(vi.fn()))

    const reference: NamedReference = { id: 'ref-1', displayName: 'مستودع دمشق' }
    const option = result.current.options.toOption(reference)

    expect(option.value).toBe('ref-1')
    expect(option.label).toBe('مستودع دمشق')
    expect(option.disabled).toBe(false)
    expect(option.payload).toBe(reference)
  })
})

describe('useWarehouseSelector', () => {
  it('maps warehouses with name label, code hint and active-only rule', () => {
    const { result } = renderHook(() => useWarehouseSelector(vi.fn()))

    const active = result.current.options.toOption(activeWarehouse)
    expect(active.value).toBe(activeWarehouse.id)
    expect(active.label).toBe('مستودع دمشق الرئيسي')
    expect(active.disabled).toBe(false)
    expect(active.payload?.code).toBe('W-01')
    // `locationAr` is gone from the wire: the warehouse record carries no
    // address at all. Its site relationship is the FLAT `siteId`, which a
    // consumer must join against the sites list to turn into a label.
    expect(active.payload?.siteId).toBe(siteRef.id)

    expect(result.current.options.toOption(inactiveWarehouse).disabled).toBe(true)
  })
})

describe('useEmployeeSelector', () => {
  it('maps employees with full name label and job title hint', () => {
    const { result } = renderHook(() => useEmployeeSelector(vi.fn()))

    const option = result.current.options.toOption(activeEmployee)
    expect(option.value).toBe(activeEmployee.id)
    expect(option.label).toBe('أحمد علي')
    expect(option.disabled).toBe(false)
    expect(option.payload?.jobTitle).toBe('أمين مستودع')
    expect(option.payload?.employeeNumber).toBe('EMP-001')
    // The employee projection carries a flat `orgUnitId` and no nested unit.
    expect(option.payload?.orgUnitId).toBe(activeOrgUnit.id)

    expect(
      result.current.options.toOption({ ...activeEmployee, status: 'Inactive' }).disabled,
    ).toBe(true)
  })

  it('keeps a null job title in the payload as a missing hint', () => {
    const { result } = renderHook(() => useEmployeeSelector(vi.fn()))
    const withoutTitle: Employee = { ...activeEmployee, jobTitle: null }

    expect(result.current.options.toOption(withoutTitle).payload?.jobTitle).toBeNull()
  })
})

describe('useOrgUnitSelector', () => {
  it('maps org units with name label and unit-type hint', () => {
    const { result } = renderHook(() => useOrgUnitSelector(vi.fn()))

    const option = result.current.options.toOption(activeOrgUnit)
    expect(option.value).toBe(activeOrgUnit.id)
    expect(option.label).toBe('قسم المستودعات')
    expect(option.disabled).toBe(false)
    // This projection serves no `code`; `unitType` is the secondary line the
    // org-unit tree renders in its place.
    expect(option.payload?.unitType).toBe('Department')

    expect(result.current.options.toOption({ ...activeOrgUnit, status: 'Inactive' }).disabled).toBe(
      true,
    )
  })
})

describe('useSiteSelector', () => {
  it('maps sites with name label and code hint', () => {
    const { result } = renderHook(() => useSiteSelector(vi.fn()))

    const option = result.current.options.toOption(activeSite)
    expect(option.value).toBe(activeSite.id)
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
