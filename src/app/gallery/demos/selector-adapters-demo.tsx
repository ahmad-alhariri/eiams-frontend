import { useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { useEmployeeSelector } from '@/shared/selectors/adapters/employee-selector'
import { useWarehouseSelector } from '@/shared/selectors/adapters/warehouse-selector'
import type { Employee, RecordStatus, Warehouse } from '@/shared/types/generated/eiams-v1'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'
import { Badge } from '@/shared/ui/badge'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function demoWarehouse(
  warehouseId: string,
  code: string,
  nameAr: string,
  locationAr: string,
  status: RecordStatus,
): Warehouse {
  return {
    warehouseId,
    code,
    nameAr,
    locationAr,
    site: {
      id: `site-${code}`,
      code: `S-${code}`,
      displayName: `فرع ${locationAr}`,
      status: 'Active',
    },
    status,
    rowVersion: 1,
  }
}

const demoWarehouses: Warehouse[] = [
  demoWarehouse(
    '11111111-1111-4111-8111-111111111111',
    'W-01',
    'مستودع دمشق الرئيسي',
    'دمشق',
    'Active',
  ),
  demoWarehouse('22222222-2222-4222-8222-222222222222', 'W-02', 'مستودع حلب', 'حلب', 'Active'),
  demoWarehouse('33333333-3333-4333-8333-333333333333', 'W-03', 'مستودع حمص', 'حمص', 'Inactive'),
  demoWarehouse(
    '44444444-4444-4444-8444-444444444444',
    'W-04',
    'مستودع اللاذقية',
    'اللاذقية',
    'Active',
  ),
  demoWarehouse(
    '55555555-5555-4555-8555-555555555555',
    'W-05',
    'مستودع الحسكة',
    'الحسكة',
    'Active',
  ),
]

async function loadDemoWarehouses(query: string): Promise<Warehouse[]> {
  await delay(400)
  const needle = query.trim().toLocaleLowerCase()
  return demoWarehouses.filter((warehouse) =>
    `${warehouse.nameAr} ${warehouse.code}`.toLocaleLowerCase().includes(needle),
  )
}

function demoEmployee(
  employeeId: string,
  employeeNumber: string,
  fullNameAr: string,
  jobTitleAr: string | null,
  orgUnitName: string,
  status: RecordStatus,
): Employee {
  return {
    employeeId,
    employeeNumber,
    fullNameAr,
    jobTitleAr,
    orgUnit: {
      id: `ou-${employeeNumber}`,
      code: employeeNumber,
      displayName: orgUnitName,
      status: 'Active',
    },
    site: { id: 'site-S-01', code: 'S-01', displayName: 'فرع دمشق', status: 'Active' },
    status,
    rowVersion: 1,
  }
}

const demoEmployees: Employee[] = [
  demoEmployee(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'EMP-001',
    'أحمد علي',
    'أمين مستودع',
    'قسم المستودعات',
    'Active',
  ),
  demoEmployee(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'EMP-002',
    'مريم خليل',
    'مسؤولة جرد',
    'قسم الجرد',
    'Active',
  ),
  demoEmployee(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'EMP-003',
    'خالد حسن',
    'مشرف توريدات',
    'قسم المشتريات',
    'Inactive',
  ),
  demoEmployee(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'EMP-004',
    'سامية يوسف',
    'أمينة عهد',
    'قسم الأصول',
    'Active',
  ),
]

async function loadDemoEmployees(query: string): Promise<Employee[]> {
  await delay(250)
  const needle = query.trim().toLocaleLowerCase()
  return demoEmployees.filter((employee) =>
    `${employee.fullNameAr} ${employee.employeeNumber}`.toLocaleLowerCase().includes(needle),
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: RecordStatus }) {
  return (
    <Badge variant={status === 'Active' ? 'success' : 'outline'}>
      {status === 'Active' ? 'نشط' : 'غير نشط'}
    </Badge>
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
      <DetailRow label="الموقع" value={warehouse.locationAr ?? '—'} />
      <DetailRow label="المبنى التابع" value={warehouse.site.displayName} />
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">الحالة</dt>
        <dd>
          <StatusBadge status={warehouse.status} />
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
      <DetailRow label="المسمى الوظيفي" value={employee.jobTitleAr ?? '—'} />
      <DetailRow label="الوحدة التنظيمية" value={employee.orgUnit.displayName} />
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">الحالة</dt>
        <dd>
          <StatusBadge status={employee.status} />
        </dd>
      </div>
    </dl>
  )
}

function SelectorAdaptersDemo() {
  const [warehouse, setWarehouse] = useState<AsyncSelectOption<Warehouse> | null>(null)
  const [employee, setEmployee] = useState<AsyncSelectOption<Employee> | null>(null)
  const warehouseSelector = useWarehouseSelector(loadDemoWarehouses)
  const employeeSelector = useEmployeeSelector(loadDemoEmployees)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        محوّل كيان جاهز يحوّل محمّل المستودعات (مهلة ٤٠٠ مللي ثانية) ومحمّل الموظفين (مهلة ٢٥٠ مللي
        ثانية) إلى خيارات AsyncSelect مع رمز تلميح وقاعدة تعطيل عند عدم النشاط، ويُعرض حمولة الخيار
        المختار تحت كل محدد.
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
                  {option.payload?.jobTitleAr ?? '—'}
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
