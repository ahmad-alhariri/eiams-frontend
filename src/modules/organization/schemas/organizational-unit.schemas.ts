import { z } from 'zod'

import type {
  OrganizationalUnit,
  OrganizationalUnitCreateRequest,
  OrganizationalUnitUpdateRequest,
} from '@/modules/organization/types/organization.types'

const SITE_MESSAGE = 'الموقع مطلوب.'
const NAME_REQUIRED_MESSAGE = 'اسم الوحدة التنظيمية مطلوب.'
const NAME_TOO_LONG_MESSAGE = 'اسم الوحدة التنظيمية يجب ألّا يتجاوز 200 محرف.'
const TYPE_REQUIRED_MESSAGE = 'نوع الوحدة التنظيمية مطلوب.'
const TYPE_TOO_LONG_MESSAGE = 'نوع الوحدة التنظيمية يجب ألّا يتجاوز 100 محرفاً.'

/**
 * One form shape for both organizational-unit operations, with the create-only
 * fields required only in create mode: `POST /organizational-units` binds
 * `siteId` and `parentId`, `PUT /organizational-units/{id}` binds neither — so
 * re-siting and re-parenting a unit are not exposed by this contract, and the
 * edit dialog shows both as read-only.
 *
 * The wire names are the form names: `name` (not `nameAr`), `parentId` (not
 * `parentOrgUnitId`), and `unitType`. There is no `code` and no `rowVersion`
 * because the projection serves neither, and no `status` because neither write
 * body binds it.
 */
export function organizationalUnitFormSchema(isCreate: boolean) {
  return z.object({
    // Create-only: read-only on edit, never sent to the update body.
    siteId: isCreate ? z.uuid(SITE_MESSAGE) : z.string(),
    // Optional in create mode — a unit with no parent is a root.
    parentId: z.string().optional(),
    name: z.string().trim().min(1, NAME_REQUIRED_MESSAGE).max(200, NAME_TOO_LONG_MESSAGE),
    // Free-form on the wire (backend `string`, observed live as "Department"),
    // so it is validated for presence and length only — never narrowed to a
    // union here.
    unitType: z.string().trim().min(1, TYPE_REQUIRED_MESSAGE).max(100, TYPE_TOO_LONG_MESSAGE),
  })
}

export type OrganizationalUnitFormValues = z.infer<ReturnType<typeof organizationalUnitFormSchema>>

/** Fresh empty values for a create form (never a shared mutable object). */
export function emptyOrganizationalUnitFormValues(): OrganizationalUnitFormValues {
  return {
    siteId: '',
    parentId: '',
    name: '',
    unitType: '',
  }
}

/**
 * Seeds the form from an organizational-unit READ record, reading `name`,
 * `unitType`, `siteId` and `parentId` — the fields the backend serves. The
 * record has no `nameAr`, no `code`, no `parentOrgUnitId` and no `rowVersion`.
 */
export function toOrganizationalUnitFormValues(
  unit: OrganizationalUnit | null,
): OrganizationalUnitFormValues {
  if (unit === null) return emptyOrganizationalUnitFormValues()
  return {
    siteId: unit.siteId,
    parentId: unit.parentId ?? '',
    name: unit.name,
    unitType: unit.unitType,
  }
}

/**
 * Maps create values to `POST /organizational-units`: `siteId`, `parentId`,
 * `name`, `unitType` — and nothing else. An empty parent is sent as `null`
 * (root unit) rather than omitted, because the backend treats absent and null
 * the same and `null` states the intent on the record that is created.
 */
export function toCreateOrganizationalUnitRequest(
  values: OrganizationalUnitFormValues,
): OrganizationalUnitCreateRequest {
  return {
    siteId: values.siteId,
    parentId: values.parentId === undefined || values.parentId === '' ? null : values.parentId,
    name: values.name.trim(),
    unitType: values.unitType.trim(),
  }
}

/**
 * Maps edit values to `PUT /organizational-units/{id}`: `name` and `unitType`
 * only. The create-only `siteId` and `parentId` are dropped because the body
 * binds neither, and there is no concurrency token because the aggregate is not
 * versioned.
 */
export function toUpdateOrganizationalUnitRequest(
  values: OrganizationalUnitFormValues,
): OrganizationalUnitUpdateRequest {
  return {
    name: values.name.trim(),
    unitType: values.unitType.trim(),
  }
}

/**
 * The minimum a cycle check needs from a unit, declared against the REAL wire
 * field names (`id` / `parentId`) instead of the identifiers the frozen
 * generated snapshot used (`orgUnitId` / `parentOrgUnitId`).
 *
 * Why this matters: those two identifiers do not exist on a real
 * `OrganizationalUnit`, so the guard used to compare `undefined` against
 * `undefined`. Its answer had nothing to do with the hierarchy it was given:
 * the self check was decided by `undefined === undefined`, and the `childToParent`
 * walk was keyed on `undefined`, so it could never reach `unit.id`. The edit
 * dialog never called it at all — the parent picker only filtered
 * `candidate.orgUnitId !== selectedId`, which is `undefined !== undefined`, so
 * that filter removed nothing and every unit in the subtree (including the unit
 * being edited and its own descendants) was offered as a candidate parent. A
 * circular hierarchy could therefore be submitted.
 */
export interface OrganizationalUnitHierarchyNode {
  readonly id: string
  readonly parentId?: string | null
}

/**
 * Returns true when selecting `parent` as the parent of `unit` would create a
 * cycle. A unit cannot be its own parent, a unit cannot keep its own current
 * parent, and a descendant of `unit` cannot become its parent.
 *
 * `unit` is nullable so a CREATE form can reuse this: a unit that does not exist
 * yet cannot be part of a cycle.
 */
export function isInvalidOrganizationalUnitParent(
  unit: OrganizationalUnitHierarchyNode | null | undefined,
  parent: OrganizationalUnitHierarchyNode | null | undefined,
  allUnits: ReadonlyArray<OrganizationalUnitHierarchyNode>,
): boolean {
  if (unit === null || unit === undefined) return false
  if (parent === null || parent === undefined) return false
  if (parent.id === unit.id) return true
  if (unit.parentId !== null && unit.parentId !== undefined && parent.id === unit.parentId) {
    return true
  }

  // Walk up the parent chain from `parent` to detect a cycle.
  const childToParent = new Map<string, string | null>()
  for (const candidate of allUnits) {
    childToParent.set(candidate.id, candidate.parentId ?? null)
  }

  let current: string | null = parent.id
  const seen = new Set<string>()
  while (current !== null) {
    if (current === unit.id) return true
    if (seen.has(current)) return true // pre-existing cycle in the data
    seen.add(current)
    current = childToParent.get(current) ?? null
  }
  return false
}
