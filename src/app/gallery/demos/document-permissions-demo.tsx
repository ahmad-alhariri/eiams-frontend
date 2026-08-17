import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useDocumentLifecyclePermissions } from '@/shared/documents/use-document-permissions'
import { LifecycleActionBar } from '@/shared/documents/lifecycle-action-bar'
import type {
  ActionAvailability,
  DocumentActionType,
  DocumentPolicy,
  SessionResponse,
} from '@/shared/types/generated/eiams-v1'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/utils/class-names'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const DEMO_USER_ID = '10000000-0000-4000-8000-000000000001'
const DEMO_ROLE_ID = '20000000-0000-4000-8000-000000000002'
const DEMO_SCOPE_ID = '30000000-0000-4000-8000-000000000003'

const DOCUMENT_PERMISSION_CODES: readonly PermissionCode[] = [
  'document.view',
  'document.create',
  'document.update',
  'document.submit',
  'document.post',
  'document.reject',
  'document.revise',
  'document.cancel',
  'document.reverse',
]

/** Reference session presets, aligned with the D-RBAC-01 seed roles. */
const ROLE_PRESETS = {
  keeper: {
    labelAr: 'أمين المستودع (WH_KEEPER)',
    permissionCodes: [
      'document.view',
      'document.create',
      'document.update',
      'document.submit',
      'document.revise',
      'document.cancel',
    ],
  },
  manager: {
    labelAr: 'مدير المستودع (WH_MGR)',
    permissionCodes: DOCUMENT_PERMISSION_CODES,
  },
  admin: {
    labelAr: 'مدير النظام (SYSTEM_ADMIN)',
    permissionCodes: PERMISSION_CODES,
  },
  auditor: {
    labelAr: 'مدقق قراءة فقط (AUDITOR)',
    permissionCodes: ['document.view'],
  },
} as const

const ACTION_LABELS_AR: Readonly<Record<DocumentActionType, string>> = {
  Edit: 'تعديل',
  Submit: 'إرسال للترحيل',
  Post: 'ترحيل',
  Reject: 'رفض',
  Revise: 'مراجعة',
  Cancel: 'إلغاء',
  Reverse: 'عكس',
  UploadAttachment: 'رفع مرفق',
  DeleteAttachment: 'حذف المرفق',
}

function buildDemoSession(
  permissionCodes: readonly PermissionCode[],
  roleLabelAr: string,
): SessionResponse {
  return {
    user: {
      userId: DEMO_USER_ID,
      username: 'demo.role',
      displayName: `مستخدم تجريبي — ${roleLabelAr}`,
      status: 'Active',
      rowVersion: 1,
    },
    activeRoles: [{ roleId: DEMO_ROLE_ID, code: 'demo-role', nameAr: roleLabelAr }],
    availableScopes: [
      { scopeId: DEMO_SCOPE_ID, scopeType: 'Enterprise', displayName: 'نطاق التطوير' },
    ],
    activeScope: { scopeId: DEMO_SCOPE_ID, scopeType: 'Enterprise', displayName: 'نطاق التطوير' },
    scopeState: 'Selected',
    permissionCodes: [...permissionCodes],
  }
}

function availability(
  action: DocumentActionType,
  overrides: Partial<ActionAvailability> = {},
): ActionAvailability {
  return {
    action,
    allowed: true,
    confirmationRequired: true,
    presentation: 'Enabled',
    reasonAr: null,
    reasonCode: null,
    reasonRequired: false,
    ...overrides,
  }
}

function buildDraftPolicy(): DocumentPolicy {
  return {
    documentId: 'demo-permissions-draft',
    documentStatus: 'Draft',
    evaluatedAt: new Date().toISOString(),
    policyKind: 'Generic',
    rowVersion: 1,
    signedOriginalSatisfied: true,
    actions: [
      availability('Edit'),
      availability('UploadAttachment'),
      availability('DeleteAttachment'),
      availability('Submit', { confirmationRequired: false }),
      availability('Post', {
        allowed: false,
        presentation: 'Disabled',
        reasonAr: 'لا يمكن الترحيل قبل إرسال المستند للترحيل',
        reasonCode: 'state_not_submitted',
      }),
      availability('Reverse', {
        allowed: false,
        presentation: 'Hidden',
        reasonAr: 'لا يمكن عكس مستند غير مرحّل',
        reasonCode: 'state_not_posted',
      }),
    ],
    advisories: [],
    blockers: [],
  }
}

function buildSubmittedPolicy(): DocumentPolicy {
  return {
    documentId: 'demo-permissions-submitted',
    documentStatus: 'Submitted',
    evaluatedAt: new Date().toISOString(),
    policyKind: 'Generic',
    rowVersion: 1,
    signedOriginalSatisfied: true,
    actions: [
      availability('Post'),
      availability('Reject', { reasonRequired: true }),
      availability('Cancel', { reasonRequired: true }),
    ],
    advisories: [],
    blockers: [],
  }
}

function PermissionPanels({ policy }: { policy: DocumentPolicy }) {
  const { isActionPermitted } = useDocumentLifecyclePermissions()

  const policyHidden = useMemo(
    () => policy.actions.filter((item) => item.presentation === 'Hidden'),
    [policy],
  )
  const permissionHidden = useMemo(
    () =>
      policy.actions.filter(
        (item) => item.presentation !== 'Hidden' && !isActionPermitted(item.action),
      ),
    [isActionPermitted, policy],
  )
  const shown = useMemo(
    () =>
      policy.actions.filter(
        (item) => item.presentation !== 'Hidden' && isActionPermitted(item.action),
      ),
    [isActionPermitted, policy],
  )

  return (
    <div className="flex flex-col gap-3">
      <LifecycleActionBar
        policy={policy}
        busyAction={null}
        onExecute={() => undefined}
        isActionPermitted={isActionPermitted}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-2 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">معروض ({shown.length}):</span>
          {shown.map((item) => (
            <Badge key={item.action} variant="success">
              {ACTION_LABELS_AR[item.action]}
            </Badge>
          ))}
        </div>
        {policyHidden.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">مخفي حسب سياسة الخادم:</span>
            {policyHidden.map((item) => (
              <Badge key={item.action} variant="outline">
                {ACTION_LABELS_AR[item.action]}
              </Badge>
            ))}
          </div>
        ) : null}
        {permissionHidden.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">مخفي لغياب الصلاحية:</span>
            {permissionHidden.map((item) => (
              <Badge key={item.action} variant="destructive">
                {ACTION_LABELS_AR[item.action]}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

type DemoRoleKey = keyof typeof ROLE_PRESETS

function DocumentPermissionsDemo() {
  const [roleKey, setRoleKey] = useState<DemoRoleKey>('manager')
  const queryClient = useQueryClient()

  useEffect(() => {
    const previous = queryClient.getQueryData<SessionResponse>(authSessionQueryKey)
    return () => {
      if (previous === undefined) {
        queryClient.removeQueries({ queryKey: authSessionQueryKey })
      } else {
        queryClient.setQueryData(authSessionQueryKey, previous)
      }
    }
  }, [queryClient])

  useEffect(() => {
    queryClient.setQueryData(
      authSessionQueryKey,
      buildDemoSession(ROLE_PRESETS[roleKey].permissionCodes, ROLE_PRESETS[roleKey].labelAr),
    )
  }, [queryClient, roleKey])

  const draftPolicy = useMemo(() => buildDraftPolicy(), [])
  const submittedPolicy = useMemo(() => buildSubmittedPolicy(), [])

  return (
    <div className="flex flex-col gap-6">
      <div
        role="radiogroup"
        aria-label="الجلسة التجريبية"
        className="flex flex-wrap items-center gap-2"
      >
        {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
          <Button
            key={key}
            type="button"
            role="radio"
            aria-checked={roleKey === key}
            variant={roleKey === key ? 'default' : 'outline'}
            className={cn(roleKey !== key && 'text-muted-foreground')}
            onClick={() => setRoleKey(key as DemoRoleKey)}
          >
            {preset.labelAr}
          </Button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        الجلسة التجريبية فعّالة في النطاق «نطاق التطوير» (Enterprise). تبديل النطاق يبدّل
        `permissionCodes` الصادرة من الخادم (D-AUTH-01) فتعيد هذه الطبقة تقييم كل الإجراءات.
        الصلاحيات الفعّالة الآن:
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {ROLE_PRESETS[roleKey].permissionCodes
          .filter((code) => code.startsWith('document.'))
          .map((code) => (
            <Badge key={code} variant="secondary">
              {code}
            </Badge>
          ))}
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-card lg:grid-cols-2">
        <section aria-label="مسودة">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            مستند مسودة — التعديل والمرفقات والإرسال
          </h3>
          <PermissionPanels policy={draftPolicy} />
        </section>
        <section aria-label="بانتظار الترحيل">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            مستند بانتظار الترحيل — الترحيل والرفض والإلغاء
          </h3>
          <PermissionPanels policy={submittedPolicy} />
        </section>
      </div>

      <p className="text-sm text-muted-foreground">
        قاعدة العمل: سياسة الخادم (Hidden/Disabled/Enabled) هي المصدر التقديمي الأول، وطبقة
        الصلاحيات لا ترسم إجراءً لا تملكه الجلسة — نفس عقد الرؤية الذي يطبّقه الخادم بالـ Hidden.
        جرّب «أمين المستودع»: يختفي الترحيل والرفض والعكس؛ و«المدقق»: تختفي كل الإجراءات لأن قراءة
        المستند فقط ممنوحة. «العكس» في المسودة مخفي حسب السياسة نفسها فلا يظهر لأي دور.
      </p>
    </div>
  )
}

export const documentPermissionsGallerySections: GallerySection[] = [
  {
    id: 'document-permissions',
    titleAr: 'التحكم بصلاحيات دورة الحياة (useDocumentLifecyclePermissions)',
    descriptionAr:
      'طبقة الدفاع الثانية فوق LifecycleActionBar: كل إجراء يُقابل رمز صلاحية document.* من الجلسة الفعّالة، فيُخفى الزر عند غياب الصلاحية ويبقى عند توفرها، مع بقاء سياسة الخادم مسؤولة عن Hidden/Disabled/Enabled.',
    render: () => <DocumentPermissionsDemo />,
  },
]
