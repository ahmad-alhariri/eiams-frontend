import { IconArrowRight, IconInfoCircle } from '@tabler/icons-react'

import { getAuditActionDisplay, toAuditEntryDisplay } from '@/modules/audit/types/audit-display'
import { useAuditLogQuery } from '@/modules/audit/hooks/use-audit-queries'
import type { AuditLog, AuditLogEntry } from '@/shared/types/generated/eiams-v1'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { formatDateTime, formatUuid } from '@/shared/utils/format'

/**
 * Immutable, read-only field diff for one audit operation. The server owns the
 * redaction projection; `toAuditEntryDisplay` already swaps old/new values for
 * the fixed placeholder when `redacted` is true, so this view never re-inspects
 * raw values for redacted entries (D-AUD-02).
 */
function AuditDiffList({ entries }: { entries: readonly AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        لا توجد حقول متغيّرة مسجّلة لعملية التدقيق هذه.
      </p>
    )
  }

  return (
    <dl className="grid gap-3">
      {entries.map((entry) => {
        const display = toAuditEntryDisplay(entry)
        return (
          <div
            key={display.entryId}
            className="grid grid-cols-1 gap-1 rounded-lg border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3"
          >
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">الحقل</dt>
              <dd className="truncate font-medium text-foreground" dir="ltr">
                {display.field.text}
              </dd>
            </div>
            <div aria-hidden className="hidden text-muted-foreground sm:block">
              ←
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">القيمة السابقة</dt>
                <dd
                  className="truncate text-foreground"
                  dir="ltr"
                  title={display.oldValue ?? undefined}
                >
                  {display.oldValue ?? '—'}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">القيمة الجديدة</dt>
                <dd
                  className="truncate text-foreground"
                  dir="ltr"
                  title={display.newValue ?? undefined}
                >
                  {display.newValue ?? '—'}
                </dd>
              </div>
            </div>
            {display.redacted ? (
              <div className="sm:col-span-3">
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <IconInfoCircle aria-hidden className="size-3.5 shrink-0" />
                  {display.redactionReasonAr ?? 'القيمة محجوبة وفق سياسة التدقيق.'}
                </p>
              </div>
            ) : null}
          </div>
        )
      })}
    </dl>
  )
}

function AuditDetailBody({ auditLog }: { auditLog: AuditLog }) {
  const action = getAuditActionDisplay(auditLog.action)
  return (
    <div className="grid gap-6">
      <ContentCard title="بيانات عملية التدقيق" description="سجل للقراءة فقط يرتبه الخادم.">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="الإجراء">
            {action.isKnown ? action.text : <code dir="ltr">{action.text}</code>}
          </DetailField>
          <DetailField label="السجل المتأثر">
            {auditLog.entityDisplay ?? <span dir="ltr">{formatUuid(auditLog.entityId)}</span>}
          </DetailField>
          <DetailField label="نوع السجل">
            <code dir="ltr" className="text-xs font-medium text-muted-foreground">
              {auditLog.entityType}
            </code>
          </DetailField>
          <div className="hidden sm:block" />
          <DetailField label="وقت الحدث">
            <span dir="ltr">{formatDateTime(auditLog.occurredAt)}</span>
          </DetailField>
          <DetailField label="بواسطة">{auditLog.occurredBy.displayName}</DetailField>
          {auditLog.summaryAr ? (
            <div className="sm:col-span-2">
              <DetailField label="الملخص">{auditLog.summaryAr}</DetailField>
            </div>
          ) : null}
          {auditLog.traceId ? (
            <div className="sm:col-span-2">
              <DetailField label="معرّف التتبّع">
                <span dir="ltr">{auditLog.traceId}</span>
              </DetailField>
            </div>
          ) : null}
        </div>
      </ContentCard>

      <ContentCard
        title="مقارنة الحقول"
        description="القيم قبل التغيير وبعده كما سجّلها الخادم. القيم المحجوبة تظهر كقيمة ثابتة دون كشف محتواها."
      >
        <AuditDiffList entries={auditLog.entries} />
      </ContentCard>
    </div>
  )
}

/**
 * Renders one immutable audit operation and its server-redacted field diff.
 * Reads the auditLogId passed by the explorer; the route itself stays on
 * `/audit` with a query param so the list and detail share one surface.
 */
export function AuditDetail({ auditLogId, onBack }: { auditLogId: string; onBack?: () => void }) {
  const auditLogQuery = useAuditLogQuery(auditLogId)

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="تفاصيل سجل التدقيق"
        subtitle="عملية تدقيق واحدة وفروق حقولها للقراءة فقط."
        toolbar={
          onBack ? (
            <Button type="button" variant="outline" onClick={onBack}>
              <IconArrowRight aria-hidden data-icon="inline-start" />
              العودة إلى السجل
            </Button>
          ) : null
        }
      />

      {auditLogQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : auditLogQuery.isError ? (
        <ErrorState
          title="تعذّر تحميل تفاصيل سجل التدقيق"
          description="تعذّر جلب عملية التدقيق من الخادم. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <Button type="button" variant="outline" onClick={() => void auditLogQuery.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : auditLogQuery.data === undefined ? (
        <ErrorState
          title="تعذّر تحميل تفاصيل سجل التدقيق"
          description="لا تتوفر بيانات لعملية التدقيق المحددة."
        />
      ) : (
        <AuditDetailBody auditLog={auditLogQuery.data} />
      )}
    </div>
  )
}

export default AuditDetail
