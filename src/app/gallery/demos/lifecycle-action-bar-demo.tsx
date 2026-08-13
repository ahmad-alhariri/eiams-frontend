import { useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { LifecycleActionBar } from '@/shared/documents/lifecycle-action-bar'
import { StatusBadge } from '@/shared/feedback/status-badge'
import type {
  ActionAvailability,
  DocumentActionType,
  DocumentPolicy,
  DocumentStatus,
  OperationalAdvisory,
  PolicyBlocker,
} from '@/shared/types/generated/eiams-v1'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const DEMO_ACTION_LABELS: Record<string, string> = {
  Submit: 'إرسال للترحيل',
  Post: 'ترحيل',
  Reject: 'رفض',
  Revise: 'مراجعة',
  Cancel: 'إلغاء',
  Reverse: 'عكس',
}

function enabledAction(action: DocumentActionType, reasonRequired: boolean): ActionAvailability {
  return {
    action,
    allowed: true,
    confirmationRequired: true,
    presentation: 'Enabled',
    reasonAr: null,
    reasonCode: null,
    reasonRequired,
  }
}

function disabledAction(
  action: DocumentActionType,
  reasonAr: string,
  reasonCode: string,
): ActionAvailability {
  return {
    action,
    allowed: false,
    confirmationRequired: true,
    presentation: 'Disabled',
    reasonAr,
    reasonCode,
    reasonRequired: false,
  }
}

function buildDemoPolicy(
  status: DocumentStatus,
  signedOriginalSatisfied: boolean,
  balanceSufficient: boolean,
): DocumentPolicy {
  const actions: ActionAvailability[] = []
  const blockers: PolicyBlocker[] = []
  const advisories: OperationalAdvisory[] = []

  if (status === 'Draft') {
    actions.push(
      enabledAction('Submit', false),
      disabledAction('Post', 'لا يمكن الترحيل قبل إرسال المستند للترحيل', 'state_not_submitted'),
      {
        ...disabledAction('Reverse', 'لا يمكن عكس مستند غير مرحّل', 'state_not_posted'),
        presentation: 'Hidden',
      },
    )
    if (!signedOriginalSatisfied) {
      blockers.push({
        code: 'signed_original_missing',
        messageAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الإرسال',
        field: null,
      })
    }
  } else if (status === 'Submitted') {
    if (!signedOriginalSatisfied) {
      blockers.push({
        code: 'signed_original_missing',
        messageAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الترحيل',
        field: null,
      })
    }
    if (!balanceSufficient) {
      blockers.push({
        code: 'insufficient_balance',
        messageAr: 'الرصيد غير كافٍ لتغطية بنود الصرف',
        field: null,
      })
    }
    advisories.push({
      code: 'ActiveSoftFreeze',
      severity: 'Warning',
      messageAr: 'يوجد جرد نشط على هذا المستودع وقد تتجمد الحركة مؤقتاً',
      scopeSummaryAr: 'مستودع دمشق المركزي',
      countReference: 'JC-2026-0114',
      overlapState: 'Provisional',
      countId: 'count-1',
      warehouseId: 'wh-1',
    })
    const postBlocked = blockers.length > 0
    actions.push(
      postBlocked
        ? disabledAction(
            'Post',
            !signedOriginalSatisfied
              ? 'يجب إرفاق النسخة الموقعة من المستند قبل الترحيل'
              : 'الرصيد غير كافٍ لتغطية بنود الصرف',
            !signedOriginalSatisfied ? 'signed_original_missing' : 'insufficient_balance',
          )
        : enabledAction('Post', false),
      enabledAction('Reject', true),
      enabledAction('Cancel', true),
    )
  } else if (status === 'Posted') {
    actions.push(enabledAction('Reverse', true))
  } else if (status === 'Rejected') {
    actions.push(enabledAction('Revise', false), enabledAction('Cancel', true))
  }

  return {
    documentId: 'demo-document-001',
    documentStatus: status,
    evaluatedAt: new Date().toISOString(),
    policyKind: 'Generic',
    rowVersion: 1,
    signedOriginalSatisfied,
    actions,
    advisories,
    blockers,
  }
}

function LifecycleActionBarDemo() {
  const [status, setStatus] = useState<DocumentStatus>('Draft')
  const [signedOriginalSatisfied, setSignedOriginalSatisfied] = useState(false)
  const [balanceSufficient, setBalanceSufficient] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [lastExecution, setLastExecution] = useState<string | null>(null)

  const policy = buildDemoPolicy(status, signedOriginalSatisfied, balanceSufficient)

  const handleExecute = async (action: DocumentActionType, reason?: string) => {
    setBusyAction(action)
    await sleep(800)
    if (action === 'Submit') setStatus('Submitted')
    else if (action === 'Reject') setStatus('Rejected')
    else if (action === 'Revise') setStatus('Draft')
    else if (action === 'Post') setStatus('Posted')
    else if (action === 'Reverse') setStatus('Reversed')
    else if (action === 'Cancel') setStatus('Cancelled')
    setBusyAction(null)
    const label = DEMO_ACTION_LABELS[action] ?? action
    setLastExecution(reason ? `${label} — السبب: «${reason}»` : label)
  }

  const handleReset = () => {
    setStatus('Draft')
    setBusyAction(null)
    setLastExecution(null)
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">حالة المستند:</span>
          <StatusBadge entity="document" status={status} />
        </div>
        {lastExecution ? (
          <p className="text-sm text-muted-foreground">آخر إجراء: {lastExecution}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-5 text-sm text-foreground">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={signedOriginalSatisfied}
            onCheckedChange={(checked) => setSignedOriginalSatisfied(checked)}
          />
          النسخة الموقعة مرفقة (SignedOriginal)
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={balanceSufficient}
            onCheckedChange={(checked) => setBalanceSufficient(checked)}
          />
          الرصيد كافٍ للصرف
        </label>
      </div>

      <LifecycleActionBar policy={policy} busyAction={busyAction} onExecute={handleExecute} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-sm text-muted-foreground">
          الدورة: مسودة ← إرسال ← ترحيل ← عكس (أو رفض ← مراجعة ← مسودة). جرّب إلغاء تفعيل «النسخة
          الموقعة» أو «الرصيد» لرؤية المعرقلات على زر الترحيل.
        </p>
        <Button type="button" variant="outline" onClick={handleReset}>
          إعادة الضبط
        </Button>
      </div>
    </div>
  )
}

export const lifecycleActionBarGallerySections: GallerySection[] = [
  {
    id: 'lifecycle-action-bar',
    titleAr: 'شريط إجراءات دورة حياة المستند (LifecycleActionBar)',
    descriptionAr:
      'أزرار إجراءات تُبنى حصرياً من سياسة المستند الصادرة من الخادم: إخفاء/تعطيل/تفعيل، معرقلات وتنبيهات بالعربية، تأكيد مع سبب إلزامي، ومانع تكرار أثناء التنفيذ.',
    render: () => <LifecycleActionBarDemo />,
  },
]
