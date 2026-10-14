import { useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { LifecycleActionBar } from '@/shared/documents/lifecycle-action-bar'
import { StatusBadge } from '@/shared/feedback/status-badge'
import type { DocumentActionType } from '@/shared/documents/types/document-action.types'
import type {
  DocumentActionAvailability,
  DocumentPolicy,
  DocumentPolicyAdvisory,
  DocumentPolicyBlocker,
  DocumentStatus,
} from '@/shared/documents/types/document-wire.types'
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

function enabledAction(
  action: DocumentActionType,
  reasonRequired: boolean,
): DocumentActionAvailability {
  return {
    action,
    allowed: true,
    confirmationRequired: true,
    presentation: 'Enabled',
    reason: null,
    reasonCode: null,
    reasonRequired,
  }
}

/**
 * The live backend states a disabled action's reason by CODE plus an English
 * sentence; the bar resolves its Arabic tooltip from the code through the
 * governed `error-copy-ar.ts` table, so the demo uses the real codes rather than
 * inventing its own (an invented code would render no tooltip at all).
 */
function disabledAction(
  action: DocumentActionType,
  reasonCode: string,
): DocumentActionAvailability {
  return {
    action,
    allowed: false,
    confirmationRequired: true,
    presentation: 'Disabled',
    reason: null,
    reasonCode,
    reasonRequired: false,
  }
}

function buildDemoPolicy(
  status: DocumentStatus,
  signedOriginalSatisfied: boolean,
  balanceSufficient: boolean,
): DocumentPolicy {
  const actions: DocumentActionAvailability[] = []
  const blockers: DocumentPolicyBlocker[] = []
  const warnings: DocumentPolicyAdvisory[] = []

  if (status === 'Draft') {
    actions.push(
      enabledAction('Submit', false),
      disabledAction('Post', 'STATE_OR_PERMISSION_NOT_ALLOWED'),
      {
        ...disabledAction('Reverse', 'STATE_OR_PERMISSION_NOT_ALLOWED'),
        presentation: 'Hidden',
      },
    )
    if (!signedOriginalSatisfied) {
      blockers.push({
        action: 'Submit',
        code: 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED',
        message: 'The signed copy of the document is required before posting.',
      })
    }
  } else if (status === 'Submitted') {
    if (!signedOriginalSatisfied) {
      blockers.push({
        action: 'Post',
        code: 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED',
        message: 'The signed copy of the document is required before posting.',
      })
    }
    if (!balanceSufficient) {
      blockers.push({
        action: 'Post',
        code: 'INVENTORY_BALANCES_NOT_FOUND',
        message: 'The available balance cannot cover the requested quantities.',
      })
    }
    warnings.push({
      code: 'ActiveSoftFreeze',
      message: 'An inventory count is running on this warehouse.',
      countId: 'count-1',
      warehouseId: 'wh-1',
    })
    const postBlocked = blockers.length > 0
    actions.push(
      postBlocked
        ? disabledAction(
            'Post',
            !signedOriginalSatisfied
              ? 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED'
              : 'INVENTORY_BALANCES_NOT_FOUND',
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
    status,
    evaluatedAtUtc: new Date().toISOString(),
    rowVersion: 1,
    signedOriginalSatisfied,
    actions,
    warnings,
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
