import { useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import type { Employee } from '@/modules/organization/types/organization.types'
import { useEmployeeSelector } from '@/shared/selectors/adapters/employee-selector'
import { useWarehouseSelector } from '@/shared/selectors/adapters/warehouse-selector'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.types'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'
import type { WarehouseLoader } from '@/shared/selectors/adapters/warehouse-selector'
import { Badge } from '@/shared/ui/badge'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Demo records are typed against the REAL wire contracts: a warehouse carries
 * `name` (not `nameAr`), `warehouseType`, `canHoldStock` and a flat `siteId`
 * with no nested site label.
 */
function demoWarehouse(
  id: string,
  code: string,
  name: string,
  siteId: string,
  warehouseType: string,
  canHoldStock: boolean,
  status: 'Active' | 'Inactive',
): Warehouse {
  return {
    id,
    siteId,
    organizationalUnitId: `ou-${code}`,
    name,
    code,
    warehouseType,
    canHoldStock,
    status,
    rowVersion: 1,
  }
}

const demoWarehouses: Warehouse[] = [
  demoWarehouse(
    '11111111-1111-4111-8111-111111111111',
    'W-01',
    'مستودع دمشق الرئيسي',
    'site-S-01',
    'Storage',
    true,
    'Active',
  ),
  demoWarehouse(
    '22222222-2222-4222-8222-222222222222',
    'W-02',
    'مستودع حلب',
    'site-S-02',
    'Storage',
    true,
    'Active',
  ),
  demoWarehouse(
    '33333333-3333-4333-8333-333333333333',
    'W-03',
    'مستودع حمص',
    'site-S-03',
    'Transhipment',
    true,
    'Inactive',
  ),
  demoWarehouse(
    '44444444-4444-4444-8444-444444444444',
    'W-04',
    'مستودع اللاذقية',
    'site-S-04',
    'Storage',
    true,
    'Active',
  ),
  demoWarehouse(
    '55555555-5555-4555-8555-555555555555',
    'W-05',
    'مستودع الحسكة',
    'site-S-05',
    'Storage',
    false,
    'Active',
  ),
]

async function loadDemoWarehouses(query: string): Promise<Warehouse[]> {
  await delay(400)
  const needle = query.trim().toLocaleLowerCase()
  return demoWarehouses.filter((warehouse) =>
    `${warehouse.name} ${warehouse.code}`.toLocaleLowerCase().includes(needle),
  )
}

/** The wire serves `fullName`, `jobTitle` and a flat `orgUnitId` with no label. */
function demoEmployee(
  id: string,
  employeeNumber: string,
  fullName: string,
  jobTitle: string | null,
  orgUnitId: string,
  status: 'Active' | 'Inactive',
): Employee {
  return {
    id,
    orgUnitId,
    employeeNumber,
    fullName,
    ...(jobTitle === null ? {} : { jobTitle }),
    status,
  }
}

const demoEmployees: Employee[] = [
  demoEmployee(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'EMP-001',
    'أحمد علي الأحريري',
    'مهندس برمجيات',
    'ou-EMP-001',
    'Active',
  ),
]

async function loadDemoEmployees(query: string): Promise<Employee[]> {
  await delay(250)
  const needle = query.trim().toLocaleLowerCase()
  return demoEmployees.filter((employee) =>
    `${employee.fullName} ${employee.employeeNumber}`.toLocaleLowerCase().includes(needle),
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-left">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  )
}

function WarehouseDetails({ option }: { option: AsyncSelectOption<Warehouse> | null }) {
  if (option === null || option.payload === undefined) {
    return <p className="text-xs text-muted-foreground">لم يتم اختيار مستودع بعد.</p>
  }
  const warehouse = option.payload
  return (
    <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <DetailRow label="الكود" value={warehouse.code} />
      <DetailRow label="نوع المستودع" value={warehouse.warehouseType} />
      <DetailRow label="السماح بالتخزين" value={warehouse.canHoldStock ? 'نعم' : 'لا'} />
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">الحالة</dt>
        <dd>
          <Badge variant={warehouse.status === 'Active' ? 'default' : 'secondary'}>
            {warehouse.status === 'Active' ? 'نشط' : 'غير نشط'}
          </Badge>
        </dd>
      </div>
    </dl>
  )
}

function EmployeeDetails({ option }: { option: AsyncSelectOption<Employee> | null }) {
  if (option === null || option.payload === undefined) {
    return <p className="text-xs text-muted-foreground">لم يتم اختيار موظف بعد.</p>
  }
  const employee = option.payload
  return (
    <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <DetailRow label="رقم الموظف" value={employee.employeeNumber} />
      <DetailRow label="المسمى الوظيفي" value={employee.jobTitle ?? '—'} />
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">الحالة</dt>
        <dd>
          <Badge variant={employee.status === 'Active' ? 'default' : 'secondary'}>
            {employee.status === 'Active' ? 'نشط' : 'غير نشط'}
          </Badge>
        </dd>
      </div>
    </dl>
  )
}

function SelectorAdaptersDemo() {
  const [warehouse, setWarehouse] = useState<AsyncSelectOption<Warehouse> | null>(null)
  const [employee, setEmployee] = useState<AsyncSelectOption<Employee> | null>(null)
  const warehouseSelector = useWarehouseSelector(loadDemoWarehouses as unknown as WarehouseLoader)
  const employeeSelector = useEmployeeSelector(loadDemoEmployees)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        محوّل كيان جاهز يحوّل محمّل المستودعات (مهلة ٤٠٠ مللي ثانية) ومحمّل الموظفين (مهلة ٢٥٠ مللي
        ثانية) إلى خيارات AsyncSelect موحّدة: تسمية عربية، رمز تلميح، وتعطيل الكيانات غير النشطة، مع
        عرض حمولة الخيار المختار.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">محدد المستودع</h3>
          <AsyncSelect<Warehouse>
            value={warehouse?.value ?? null}
            onValueChange={(_value, option) => setWarehouse(option ?? null)}
            loadOptions={warehouseSelector.loadOptions}
            placeholder="اكتب اسم المستودع للبحث..."
            renderOption={(option) => (
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{option.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {option.payload?.code ?? '—'}
                </span>
              </span>
            )}
            className="max-w-md"
          />
          <WarehouseDetails option={warehouse} />
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">محدد الموظف</h3>
          <AsyncSelect<Employee>
            value={employee?.value ?? null}
            onValueChange={(_value, option) => setEmployee(option ?? null)}
            loadOptions={employeeSelector.loadOptions}
            placeholder="اكتب اسم الموظف للبحث..."
            renderOption={(option) => (
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{option.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {option.payload?.jobTitle ?? '—'}
                </span>
              </span>
            )}
            className="max-w-md"
          />
          <EmployeeDetails option={employee} />
        </div>
      </div>
    </div>
  )
}

export const selectorAdaptersGallerySections: GallerySection[] = [
  {
    id: 'selector-adapters',
    titleAr: 'محددات الكيانات الجاهزة (Entity Selector Adapters)',
    descriptionAr:
      'طبقة محوّلات جاهزة تحوّل أي محمّل كيانات (يُحقن لاحقاً من خارج المكون) إلى خيارات AsyncSelect موحّدة: تسمية عربية، رمز تلميح، وتعطيل الكيانات غير النشطة، مع عرض حمولة الخيار المختار.',
    render: () => <SelectorAdaptersDemo />,
  },
]
