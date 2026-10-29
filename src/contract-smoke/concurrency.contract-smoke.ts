/**
 * Contract smoke — coverage item 6: the optimistic-concurrency round trip
 * through the frontend's REAL document service + error surface.
 *
 * Measured backend behaviour (paced live probes, R3): editing the paper
 * reference bumps `rowVersion` only when the value CHANGES, so the 409 is
 * produced by a STALE version with a NEW value:
 *
 * 1. keeper creates a draft Receiving document (`document.create` — 201).
 * 2. `updatePaperReference` with the CURRENT version -> 200.
 * 3. the same edit replayed with the STALE version -> exact 409
 *    `WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH` (in the error-copy table,
 *    `src/shared/api/error-copy-ar.ts:443`).
 * 4. a fresh read shows the FIRST edit's number and the advanced version.
 *
 * The frontend contract is asserted on the error OBJECT: `isConflictError`
 * and `isConcurrencyConflict` (`src/shared/services/mutation-safety.ts:66,106`)
 * must both recognize it, and `reportApiError` must surface an Arabic toast
 * through the real `toastManager` — never the English wire code.
 */
import axios from 'axios'
import type { ToastManagerAddOptions, ToastManagerEvent } from '@base-ui/react/toast'
import { describe, it } from 'vitest'
import { documentService } from '@/shared/documents/document-transport'
import { CONFLICT_GUIDANCE_AR, reportApiError } from '@/shared/services/api-error'
import { isConflictError, isConcurrencyConflict } from '@/shared/services/mutation-safety'
import { toastManager } from '@/shared/ui/toast-manager'
import { readWireCode, wireEvidence } from './contract-assert'
import { createFileSession } from './contract-session'
import './contract-api-base'

const WAREHOUSE_ID = '373ba70c-aa2c-466d-b9b5-a9df47abf8da'

const fileSession = createFileSession()

describe('contract-smoke: 409 optimistic concurrency + Arabic conflict toast', () => {
  it('stale paper-reference edit -> exact 409 ROW_VERSION_MISMATCH; fresh read keeps the first edit', async () => {
    await fileSession.login('keeper')
    const documentId = await documentService.createDocument({
      warehouseId: WAREHOUSE_ID,
      documentType: 'Receiving',
    })
    const draft = await documentService.getDocument(documentId)
    const baseVersion = draft.rowVersion
    await documentService.updatePaperReference(documentId, {
      expectedRowVersion: baseVersion,
      paperDocumentNumber: 'CT-69YR-A',
      paperDocumentYear: 2026,
    })
    const edited = await documentService.getDocument(documentId)
    if (edited.paperDocumentNumber !== 'CT-69YR-A') {
      throw new Error(
        `PAPER REFERENCE DIVERGENCE: first edit not applied — observed status=200 body=${JSON.stringify(edited.paperDocumentNumber).slice(0, 400)}`,
      )
    }
    let staleError: unknown
    try {
      await documentService.updatePaperReference(documentId, {
        expectedRowVersion: baseVersion,
        paperDocumentNumber: 'CT-69YR-B',
        paperDocumentYear: 2026,
      })
      throw new Error(
        'STALE EDIT DIVERGENCE: expected status=409 but the call SUCCEEDED — replayed edit was accepted',
      )
    } catch (error: unknown) {
      staleError = error
      if (
        !axios.isAxiosError(error) ||
        error.response?.status !== 409 ||
        readWireCode(error) !== 'WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH'
      ) {
        throw new Error(
          `stale paper-reference edit: expected status=409 code=WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH — ${wireEvidence(error)}`,
          { cause: error },
        )
      }
    }
    // The frontend's own recognition of the conflict (mutation-safety contract).
    if (!isConflictError(staleError) || !isConcurrencyConflict(staleError)) {
      throw new Error(
        'CONFLICT RECOGNITION DIVERGENCE: isConflictError/isConcurrencyConflict did not recognize the 409',
      )
    }
    // The frontend's own toast surface, through the real toast manager.
    const events: Array<{ action: string; type: string; title?: string; description?: string }> = []
    const unsubscribe = toastManager[' subscribe']((event: ToastManagerEvent) => {
      const options = event.options as ToastManagerAddOptions<object>
      events.push({
        action: event.action,
        type: options.type ?? 'UNKNOWN',
        ...(typeof options.title === 'string' ? { title: options.title } : {}),
        ...(typeof options.description === 'string' ? { description: options.description } : {}),
      })
    })
    reportApiError(staleError)
    unsubscribe()
    const toastEvent = events.at(-1)
    if (
      toastEvent === undefined ||
      toastEvent.type !== 'error' ||
      toastEvent.title === undefined ||
      toastEvent.title.length === 0 ||
      /[A-Za-z_]{6,}/u.test(toastEvent.title)
    ) {
      throw new Error(
        `CONFLICT TOAST DIVERGENCE: expected an Arabic error toast — observed events=${JSON.stringify(events).slice(0, 400)}`,
      )
    }
    if (toastEvent.description !== undefined && toastEvent.description !== CONFLICT_GUIDANCE_AR) {
      throw new Error(
        `CONFLICT TOAST GUIDANCE DIVERGENCE: description is not the shared Arabic guidance — observed description=${JSON.stringify(toastEvent.description).slice(0, 400)}`,
      )
    }
    // Fresh read: the first edit survives, the replay did not corrupt the row.
    const fresh = await documentService.getDocument(documentId)
    if (fresh.paperDocumentNumber !== 'CT-69YR-A' || fresh.rowVersion <= baseVersion) {
      throw new Error(
        `FRESHNESS DIVERGENCE: server state after the rejected edit — observed status=200 paper=${JSON.stringify(fresh.paperDocumentNumber)} rowVersion=${fresh.rowVersion} base=${baseVersion}`,
      )
    }
  })
})
