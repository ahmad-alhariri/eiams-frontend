import type {
  InventoryCount,
  InventoryCountLine,
  UpdateCountLinesRequest,
} from '@/shared/types/generated/eiams-v1'
type MutableLine = {
  -readonly [K in keyof InventoryCountLine]: InventoryCountLine[K]
}

type MutableCount = {
  -readonly [K in keyof InventoryCount]: InventoryCount[K]
}

/**
 * Inventory-count mock state (e20-t01). The browser mock keeps an in-memory
 * session list rebuilt from the seed on each module load; lifecycle
 * transitions mutate the rows in place so a single SPA session sees the full
 * Planned → InProgress → Completed → Closed journey.
 */
let counts: MutableCount[] = []
let lines: MutableLine[] = []
let nextId = 1

function nextCountId(): string {
  const id = `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`
  nextId += 1
  return id
}

/** Seeds two sessions: one Planned (no lines yet), one InProgress with snapshot lines. */
export function seedInventoryCounts(centralWarehouseId: string): void {
  const plannedId = nextCountId()
  const inProgressId = nextCountId()

  counts = [
    {
      countId: plannedId,
      countType: 'Full',
      createdAt: '2026-08-20T08:00:00.000Z',
      createdBy: { id: fixtureUserId(), displayName: 'مروان السيد' },
      freezePolicy: 'SoftFreeze',
      referenceNumber: 'EIAMS-CNT-2026-0002',
      rowVersion: 1,
      scope: { scopeIds: [], scopeType: 'AllMaterials', summaryAr: 'كل مواد المستودع المركزي' },
      status: 'Planned',
      warehouse: centralWarehouseRef(centralWarehouseId),
    },
    {
      countId: inProgressId,
      countType: 'Partial',
      createdAt: '2026-08-18T08:00:00.000Z',
      createdBy: { id: fixtureUserId(), displayName: 'مروان السيد' },
      freezePolicy: 'SoftFreeze',
      lineCount: 3,
      referenceNumber: 'EIAMS-CNT-2026-0001',
      rowVersion: 1,
      scope: {
        scopeIds: [],
        scopeType: 'ByCategory',
        summaryAr: 'أجهزة الحاسوب والطابعات',
      },
      startedAt: '2026-08-18T09:00:00.000Z',
      status: 'InProgress',
      varianceCount: 0,
      warehouse: centralWarehouseRef(centralWarehouseId),
    },
  ]

  const snapshotBase = Date.parse('2026-08-18T09:00:00.000Z')
  lines = [
    countLine(1, inProgressId, 'حاسوب مكتبي', 25, null),
    countLine(2, inProgressId, 'طابعة ليزر', 2, null),
    countLine(3, inProgressId, 'ورق تصوير A4', 12, null),
  ]

  function countLine(
    index: number,
    countId: string,
    materialNameAr: string,
    snapshotQuantity: number,
    actualQuantity: number | null,
  ): InventoryCountLine {
    return {
      countLineId: `${countId}-line-${index}`,
      difference: (actualQuantity ?? snapshotQuantity) - snapshotQuantity,
      material: { id: `${countId}-mat-${index}`, displayName: materialNameAr },
      rowVersion: 1,
      snapshotQuantity,
      ...(actualQuantity === null ? {} : { actualQuantity }),
    }
  }

  // Silence unused-variable lint for the timestamp base kept for future seeds.
  void snapshotBase
}

function centralWarehouseRef(warehouseId: string) {
  return { id: warehouseId, displayName: 'المستودع المركزي' }
}

function fixtureUserId(): string {
  return '00000000-0000-4000-8000-0000000000f1'
}

export function getInventoryCounts(): readonly InventoryCount[] {
  return counts
}

export function findInventoryCount(countId: string): MutableCount | undefined {
  return counts.find((count) => count.countId === countId)
}

export function getInventoryCountLines(countId: string): readonly MutableLine[] {
  return lines.filter((line) => line.countLineId.startsWith(countId))
}

/**
 * Applies a batched actual-quantity update (`count.enter`). Recomputes each
 * touched line's difference and bumps the session's rowVersion.
 */
export function applyCountLineUpdates(countId: string, request: UpdateCountLinesRequest): boolean {
  const count = findInventoryCount(countId)
  if (count === undefined || count.status !== 'InProgress') {
    return false
  }
  for (const input of request.lines) {
    const line = lines.find(
      (candidate) =>
        candidate.countLineId === input.countLineId && candidate.countLineId.startsWith(countId),
    )
    if (line === undefined) continue
    line.actualQuantity = input.actualQuantity
    line.difference = input.actualQuantity - line.snapshotQuantity
    if (input.reason !== undefined && input.reason !== null) {
      line.reason = input.reason
    }
  }
  count.rowVersion += 1
  return true
}

/** Advances the session state machine; returns false on an illegal transition. */
export function transitionInventoryCount(
  countId: string,
  action: 'start' | 'complete' | 'close',
): boolean {
  const count = findInventoryCount(countId)
  if (count === undefined) return false
  const now = new Date().toISOString()
  if (action === 'start' && count.status === 'Planned') {
    count.status = 'InProgress'
    count.startedAt = now
    count.rowVersion += 1
    return true
  }
  if (action === 'complete' && count.status === 'InProgress') {
    count.status = 'Completed'
    count.completedAt = now
    count.varianceCount = getInventoryCountLines(countId).filter(
      (line) => line.difference !== 0,
    ).length
    count.lineCount = getInventoryCountLines(countId).length
    count.rowVersion += 1
    return true
  }
  if (action === 'close' && count.status === 'Completed') {
    count.status = 'Closed'
    count.closedAt = now
    count.rowVersion += 1
    return true
  }
  return false
}

/** Plans a new Full/Partial/etc. session from the planning form payload. */
export function planInventoryCount(request: {
  warehouseId: string
  countType: InventoryCount['countType']
  scope: InventoryCount['scope']
  freezePolicy: InventoryCount['freezePolicy']
  notes?: string | null
}): InventoryCount {
  const countId = nextCountId()
  const count: InventoryCount = {
    countId,
    countType: request.countType,
    createdAt: new Date().toISOString(),
    createdBy: { id: fixtureUserId(), displayName: 'مروان السيد' },
    freezePolicy: request.freezePolicy,
    notes: request.notes ?? null,
    referenceNumber: `EIAMS-CNT-2026-${String(100 + nextId).padStart(4, '0')}`,
    rowVersion: 1,
    scope: request.scope,
    status: 'Planned',
    warehouse: centralWarehouseRef(request.warehouseId),
  }
  counts.push(count)
  return count
}
