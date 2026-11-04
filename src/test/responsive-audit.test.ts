import { describe, expect, it } from 'vitest'

import {
  allowMarkersIn,
  applicationSourceFiles,
  assertAllowlistIsSmall,
  assertScannedFilesMatchGit,
  gitApplicationSourceFiles,
  readSource,
  relativeToRepo,
} from './support/source-scan'

/**
 * The responsive workflow audit (eiams-frontend-e25-t04).
 *
 * Five rules, each with a synthetic negative control so the fence can be seen
 * to FAIL on a deliberate violation rather than merely asserted to pass.
 *
 *  R1  No fixed PIXEL width outside the sidebar's own 260px column. A pixel
 *      width does not scale with the viewport, so one is a hard floor the
 *      layout cannot go below; the rem-based minimum table widths are allowed
 *      because they are deliberate scroll floors inside their own container.
 *  R2  Every horizontal scroll container must be allowed to SHRINK (`min-w-0`).
 *      A scroll container without it keeps its content's min-content width as
 *      its automatic minimum size, so inside a flex or grid parent it pushes
 *      the parent wide instead of scrolling.
 *  R3  No hover-ONLY affordance: an interactive element that changes on hover
 *      must carry the equivalent keyboard state (`focus-visible:`) in the same
 *      class expression.
 *  R4  The shared touch primitives reach the 40px mobile floor.
 *  R5  RTL logical properties only: no `ml-/mr-/pl-/pr-/left-/right-/text-left/
 *      text-right` utility may reach a class expression.
 *
 * The gallery is excluded: it is a demo surface, not a workflow.
 */
const SCANNED = applicationSourceFiles().filter(
  (file) => !relativeToRepo(file).startsWith('src/app/gallery/'),
)
const GIT_SCANNED = gitApplicationSourceFiles().filter(
  (file) => !file.startsWith('src/app/gallery/'),
)

const BUTTON_FILE = 'src/shared/ui/button.tsx'

/** The one fixed pixel width the design allows: the sidebar's own column. */
const SIDEBAR_PIXEL_WIDTH = '260'
const SIDEBAR_FILE = 'src/shared/layout/sidebar/sidebar.tsx'

/**
 * A quoted literal is a CLASS EXPRESSION only if it looks like one: ASCII
 * only, no JSX braces or angle brackets, and at least one dash (every Tailwind
 * utility has one). Without this filter a stray apostrophe in a comment pairs
 * with the next quote in the file and manufactures a 3,000-character "class
 * list".
 */
function looksLikeClassExpression(literal: string): boolean {
  if (literal.length === 0 || literal.length > 1200) return false
  if (/[{}<;]/u.test(literal)) return false
  if (/[^\x20-\x7E]/u.test(literal)) return false
  return literal.includes('-')
}

/** Every class expression in the file. */
function classExpressionsIn(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/'[^'\n]*'|"[^"\n]*"/gu)) {
    const literal = match[0].slice(1, -1)
    if (looksLikeClassExpression(literal)) found.push(literal)
  }
  return found
}

/**
 * The opening tag of a JSX element, brace-aware: a `>` inside a prop
 * expression (an `onClick={() => open()}`, an arrow function in a `className`
 * callback) must not end the tag early.
 */
function openingTagOf(source: string, start: number): string {
  let depth = 0
  let quote: string | null = null
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote !== null) {
      if (character === quote && source[index - 1] !== '\\') {
        quote = null
      }
      continue
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character
      continue
    }
    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
    } else if (character === '>' && depth === 0) {
      // `=>` is an arrow function, not the end of the tag.
      if (source[index - 1] === '=') continue
      return source.slice(start, index + 1)
    }
  }
  return source.slice(start)
}

/**
 * R1 — a fixed pixel width is a floor the layout cannot shrink below, so the
 * only one allowed is the sidebar's own column (ui-design.md 4.3).
 */
const PIXEL_WIDTH_TOKEN = /^(?:[-a-z]+:)*(?:min-|max-)?[wh]-\[(\d+)px\]$/u

function fixedPixelWidthOffenders(repoPath: string, source: string): string[] {
  const found: string[] = []
  for (const literal of classExpressionsIn(source)) {
    for (const token of literal.split(/\s+/u)) {
      const match = PIXEL_WIDTH_TOKEN.exec(token)
      if (match === null) continue
      if (repoPath === SIDEBAR_FILE && match[1] === SIDEBAR_PIXEL_WIDTH) continue
      found.push(token)
    }
  }
  return found
}

/**
 * R2 — a horizontal scroll container must be allowed to shrink. Without
 * `min-w-0` its automatic minimum size is its content's min-content width, so
 * inside a flex or grid parent it widens the parent instead of scrolling.
 */
const SCROLL_TOKEN = /^(?:[-a-z]+:)*overflow-x-(auto|scroll)$/u
const MIN_W_TOKEN = /^(?:[-a-z]+:)*min-w-0$/u

function scrollContainmentOffenders(source: string): string[] {
  const found: string[] = []
  for (const literal of classExpressionsIn(source)) {
    const tokens = literal.split(/\s+/u)
    if (!tokens.some((token) => SCROLL_TOKEN.test(token))) continue
    if (tokens.some((token) => MIN_W_TOKEN.test(token))) continue
    found.push(tokens.join(' '))
  }
  return found
}

/**
 * R3 — a hover affordance must have its keyboard equivalent.
 *
 * The rule reads the class EXPRESSION of an interactive element, not the file:
 * the expression is the set of class tokens the element ends up with, so a
 * `focus-visible:` supplied by a sibling expression still counts.
 *
 * `buttonVariants(` is the shared Button's own base class, which carries the
 * focus ring for every variant; a class expression that composes it is
 * therefore exempt from the pairing requirement.
 */
const INTERACTIVE_ELEMENT = /<(button|a|input|select|textarea|Link|NavLink)\b/gu
const HOVER_AFFORDANCE = /^(?:[-a-z]+:)*hover:(bg|text|border|underline|opacity|shadow)-/u
const FOCUS_AFFORDANCE = /^(?:[-a-z]+:)*focus-visible:/u

function hoverOnlyOffenders(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(INTERACTIVE_ELEMENT)) {
    const start = match.index ?? 0
    const tag = openingTagOf(source, start)
    if (tag.includes('buttonVariants(')) continue
    const tokens = new Set<string>()
    for (const literal of classExpressionsIn(tag)) {
      for (const token of literal.split(/\s+/u)) {
        if (token.length > 0) tokens.add(token)
      }
    }
    const hovered = [...tokens].filter((token) => HOVER_AFFORDANCE.test(token))
    if (hovered.length === 0) continue
    if ([...tokens].some((token) => FOCUS_AFFORDANCE.test(token))) continue
    found.push(`${match[1]}: ${hovered.join(' ')}`)
  }
  return found
}

/**
 * R4 — the shared primitives must reach the 40px (2.5rem) mobile floor.
 *
 * The Tailwind spacing scale is 0.25rem per step, so `h-10`/`size-10` is
 * 40px. A size that only reaches the floor from a breakpoint up is a DESKTOP
 * size, so the floor must hold at the narrowest supported width (360px).
 */
const MOBILE_HEIGHT_TOKEN = /^(?:h|size)-(\d+)$/u
const MAX_SM_HEIGHT_TOKEN = /^max-sm:(?:h|size)-(\d+)$/u
const MOBILE_FLOOR_STEPS = 10

/** The size map of the shared Button, with each entry's line range. */
function buttonSizeEntries(source: string): { name: string; from: number; to: number }[] {
  const map = /(\n\s{6}size:\s*\{)([\s\S]*?)(\n\s{6}\},)/u.exec(source)
  if (map === null || map.index === undefined) return []
  const bodyStart = map.index + (map[1]?.length ?? 0)
  const body = map[2] ?? ''
  const entries: { name: string; from: number; to: number }[] = []
  // A part starts at every key line and at every comment line, so a comment
  // that documents the NEXT key belongs to that key (the house `standard-allow`
  // marker is exactly such a comment).
  const parts = body.split(/\n(?=\s{8}(?:\/\/|'?[a-z][\w-]*'?\s*:))/u)
  let offset = 0
  for (const part of parts) {
    const lines = part.split(/\r?\n/u)
    const keyLine = lines.findIndex((line) => /^\s*'?([a-z][\w-]*)'?\s*:/u.test(line))
    if (keyLine >= 0) {
      const name = /^\s*'?([a-z][\w-]*)'?\s*:/u.exec(lines[keyLine] ?? '')?.[1] ?? 'unknown'
      const partStart = source.slice(0, bodyStart + offset).split(/\r?\n/u).length - 1
      entries.push({ name, from: partStart + keyLine, to: partStart + lines.length - 1 })
    }
    offset += part.length + 1
  }
  return entries
}

function buttonSizeOffenders(repoPath: string, source: string): string[] {
  if (repoPath !== BUTTON_FILE) return []
  const excused = allowMarkersIn(source)
    .filter((marker) => marker.rule === 'touch-target-floor')
    .map((marker) => ({ from: marker.line, to: marker.line + 3 }))
  const found: string[] = []
  for (const entry of buttonSizeEntries(source)) {
    if (excused.some((window) => entry.from >= window.from && entry.from <= window.to)) continue
    const entrySource = source
      .split(/\r?\n/u)
      .slice(entry.from, entry.to + 1)
      .join('\n')
    const tokens = classExpressionsIn(entrySource).flatMap((literal) => literal.split(/\s+/u))
    const heights = [
      ...tokens
        .map((token) => MOBILE_HEIGHT_TOKEN.exec(token)?.[1])
        .map((value) => (value === undefined ? undefined : Number(value))),
      ...tokens
        .map((token) => MAX_SM_HEIGHT_TOKEN.exec(token)?.[1])
        .map((value) => (value === undefined ? undefined : Number(value))),
    ].filter((value): value is number => value !== undefined)
    const mobile = heights.length > 0 ? Math.min(...heights) : 0
    if (mobile < MOBILE_FLOOR_STEPS) {
      found.push(`size "${entry.name}" reaches ${mobile * 4}px on mobile`)
    }
  }
  return found
}

/**
 * R4 — the shared touch primitives reach the 40px mobile floor, ASSERTED ON
 * THE ELEMENT and not on the file.
 *
 * A file-level check is satisfied by an unrelated `size-10` anywhere in the
 * file, so every rule below names ONE element (by an anchor that appears in
 * its opening tag) and the class tokens THAT element carries.
 */
type ElementRule = {
  /** What the rule is about, for the failure message. */
  readonly label: string
  /** The production file the element lives in. */
  readonly path: string
  /** A substring of the element's opening tag that identifies it. */
  readonly anchor: string
  /** Class tokens the element MUST carry. */
  readonly required: readonly RegExp[]
  /** Class tokens the element must NOT carry. */
  readonly forbidden?: readonly RegExp[]
  /** The class tokens that satisfy the rule — the negative control's "good" case. */
  readonly sample: string
}

const ELEMENT_RULES: readonly ElementRule[] = [
  {
    label: 'the shared text input',
    path: 'src/shared/ui/input.tsx',
    anchor: 'data-slot="input"',
    required: [/^h-10$/u],
    sample: 'h-10',
  },
  {
    label: 'the shared textarea',
    path: 'src/shared/ui/textarea.tsx',
    anchor: 'data-slot="textarea"',
    required: [/^min-h-(1[0-9]|[2-9][0-9])$/u],
    sample: 'min-h-16',
  },
  {
    label: 'the shared select trigger',
    path: 'src/shared/ui/select.tsx',
    anchor: 'data-slot="select-trigger"',
    required: [/^data-\[size=default\]:h-10$/u, /^data-\[size=sm\]:h-10$/u],
    sample: 'data-[size=default]:h-10 data-[size=sm]:h-10',
  },
  {
    label: 'a shared select option',
    path: 'src/shared/ui/select.tsx',
    anchor: 'data-slot="select-item"',
    required: [/^min-h-10$/u],
    sample: 'min-h-10',
  },
  {
    label: 'a shared dropdown-menu option',
    path: 'src/shared/ui/dropdown-menu.tsx',
    anchor: 'data-slot="dropdown-menu-item"',
    required: [/^min-h-10$/u],
    sample: 'min-h-10',
  },
  {
    label: 'the shared date-picker trigger',
    path: 'src/shared/ui/date-picker.tsx',
    anchor: 'data-slot="date-picker-trigger"',
    required: [/^h-10$/u],
    sample: 'h-10',
  },
  {
    // The clear button must not fall back to the 24px square it used to be.
    label: "the date-picker's clear control",
    path: 'src/shared/ui/date-picker.tsx',
    anchor: 'aria-label="مسح التاريخ"',
    required: [/^h-10$/u],
    forbidden: [/^size-6$/u],
    sample: 'h-10',
  },
  {
    // The checkbox keeps its 16px drawn box; the invisible `after` pseudo is
    // what a finger hits. `-inset-3` is the 12px spacing token: the pseudo is
    // sized against the PADDING box, so the hit area measures 38.67px — the
    // documented truth, not a round 40px.
    label: 'the shared checkbox hit area',
    path: 'src/shared/ui/checkbox.tsx',
    anchor: 'data-slot="checkbox"',
    required: [/^after:-inset-3$/u],
    forbidden: [/^after:-inset-y-2$/u],
    sample: 'after:-inset-3',
  },
  {
    label: 'the shared table column sort control',
    path: 'src/shared/ui/data-table.tsx',
    anchor: 'hover:bg-white/10',
    required: [/^min-h-10$/u],
    sample: 'min-h-10',
  },
  {
    // A table-cell link is an inline box (20px). On a phone it becomes a
    // 40px-tall flex box; the rule targets the LINK only.
    label: 'a table-cell link in the shared table',
    path: 'src/shared/ui/data-table.tsx',
    anchor: 'caption-bottom text-sm',
    required: [/^max-sm:\[&_a\]:min-h-10$/u, /^max-sm:\[&_a\]:inline-flex$/u],
    sample: 'max-sm:[&_a]:min-h-10 max-sm:[&_a]:inline-flex',
  },
  {
    label: 'a table-cell link in the document lines table',
    path: 'src/shared/documents/pages/document-detail-page.tsx',
    anchor: 'data-slot="document-lines-table"',
    required: [/^max-sm:\[&_a\]:min-h-10$/u, /^max-sm:\[&_a\]:inline-flex$/u],
    sample: 'max-sm:[&_a]:min-h-10 max-sm:[&_a]:inline-flex',
  },
  {
    label: "the file dropzone's remove control",
    path: 'src/shared/feedback/file-dropzone.tsx',
    anchor: 'aria-label="إزالة الملف"',
    required: [/^size-10$/u],
    sample: 'size-10',
  },
  {
    label: "the toast's close control",
    path: 'src/shared/ui/toast.tsx',
    anchor: 'aria-label="إغلاق الإشعار"',
    required: [/^size-10$/u],
    sample: 'size-10',
  },
  {
    label: "the header's navigation toggle",
    path: 'src/shared/layout/header/app-header.tsx',
    anchor: 'aria-label="فتح قائمة التنقل"',
    required: [/^size-10$/u],
    sample: 'size-10',
  },
  {
    label: "the header's sidebar toggle",
    path: 'src/shared/layout/header/app-header.tsx',
    anchor: 'hidden size-10',
    required: [/^size-10$/u],
    sample: 'size-10',
  },
  {
    label: "the header's notification bell",
    path: 'src/shared/layout/header/app-header.tsx',
    anchor: 'aria-label="الإشعارات"',
    required: [/^size-10$/u],
    sample: 'size-10',
  },
  {
    label: "the header's brand link",
    path: 'src/shared/layout/header/app-header.tsx',
    anchor: 'aria-label="الرئيسية"',
    required: [/^min-h-10$/u],
    sample: 'min-h-10',
  },
  {
    label: 'the print trigger',
    path: 'src/shared/ui/print-button.tsx',
    anchor: 'size="icon"',
    required: [/^min-h-10$/u, /^min-w-10$/u],
    sample: 'min-h-10 min-w-10',
  },
  {
    label: 'a reports tab',
    path: 'src/modules/reports/components/reports-tabs.tsx',
    anchor: 'aria-controls',
    required: [/^min-h-10$/u],
    sample: 'min-h-10',
  },
]

/**
 * The opening tag that contains `anchor`, with its class tokens.
 *
 * The anchor is a substring of an attribute of the element (its `aria-label`,
 * its `data-slot`, …), so the tag starts at the nearest `<` before it.
 */
function elementClassTokens(source: string, anchor: string): string[] | null {
  const index = source.indexOf(anchor)
  if (index < 0) return null
  let start = index
  while (start > 0 && source[start] !== '<') start -= 1
  const tag = openingTagOf(source, start)
  const tokens = new Set<string>()
  for (const literal of classExpressionsIn(tag)) {
    for (const token of literal.split(/\s+/u)) {
      if (token.length > 0) tokens.add(token)
    }
  }
  return [...tokens]
}

function elementRuleOffenders(repoPath: string, source: string): string[] {
  const found: string[] = []
  for (const rule of ELEMENT_RULES) {
    if (rule.path !== repoPath) continue
    const tokens = elementClassTokens(source, rule.anchor)
    if (tokens === null) {
      found.push(`${repoPath}: ${rule.label} not found (anchor ${rule.anchor})`)
      continue
    }
    for (const required of rule.required) {
      if (!tokens.some((token) => required.test(token))) {
        found.push(`${repoPath}: ${rule.label} is missing ${required.source}`)
      }
    }
    for (const forbidden of rule.forbidden ?? []) {
      if (tokens.some((token) => forbidden.test(token))) {
        found.push(`${repoPath}: ${rule.label} carries ${forbidden.source}`)
      }
    }
  }
  return found
}

/**
 * R5 — RTL logical properties only. A physical `ml-2`/`right-0` utility is
 * wrong the moment the document direction is not the one it was written for.
 */
const PHYSICAL_UTILITY = /^(?:[-a-z]+:)*(?:ml|mr|pl|pr|left|right)-(?:\d+|px|auto|\[.*\])$/u
const PHYSICAL_TEXT = /^(?:[-a-z]+:)*text-(?:left|right)$/u

function physicalDirectionOffenders(source: string): string[] {
  const found: string[] = []
  for (const literal of classExpressionsIn(source)) {
    for (const token of literal.split(/\s+/u)) {
      if (PHYSICAL_UTILITY.test(token) || PHYSICAL_TEXT.test(token)) {
        found.push(token)
      }
    }
  }
  return found
}

function scanRule(detector: (repoPath: string, source: string) => string[]): string[] {
  const found: string[] = []
  for (const file of SCANNED) {
    const repoPath = relativeToRepo(file)
    for (const offender of detector(repoPath, readSource(file))) {
      found.push(`${repoPath}: ${offender}`)
    }
  }
  return found
}

describe('responsive workflow audit (eiams-frontend-e25-t04)', () => {
  it('scans the pinned set of production files', () => {
    assertScannedFilesMatchGit(
      SCANNED,
      GIT_SCANNED,
      'responsive workflow audit (eiams-frontend-e25-t04)',
    )
  })

  it('keeps fixed pixel widths out of the layout', () => {
    expect(scanRule(fixedPixelWidthOffenders)).toEqual([])
  })

  it('lets every horizontal scroll container shrink', () => {
    expect(scanRule((_path, source) => scrollContainmentOffenders(source))).toEqual([])
  })

  it('gives every hover affordance a keyboard equivalent', () => {
    expect(scanRule((_path, source) => hoverOnlyOffenders(source))).toEqual([])
  })

  it('gives the shared Button sizes a 40px mobile floor', () => {
    expect(scanRule(buttonSizeOffenders)).toEqual([])
  })

  it('gives the shared touch primitives a 40px mobile floor', () => {
    expect(scanRule(elementRuleOffenders)).toEqual([])
  })

  it('keeps the touch-target exception set small', () => {
    const markers = allowMarkersIn(
      readSource(SCANNED.find((file) => relativeToRepo(file) === BUTTON_FILE) ?? ''),
    )
    assertAllowlistIsSmall(markers, 1)
  })

  it('uses RTL logical properties only', () => {
    expect(scanRule((_path, source) => physicalDirectionOffenders(source))).toEqual([])
  })

  it('detects a fixed pixel width', () => {
    expect(fixedPixelWidthOffenders('src/shared/ui/input.tsx', 'className="w-[420px]"')).toEqual([
      'w-[420px]',
    ])
    expect(
      fixedPixelWidthOffenders('src/shared/ui/input.tsx', 'className="min-w-[600px]"'),
    ).toEqual(['min-w-[600px]'])
    // The sidebar's own column is the one allowed pixel width.
    expect(
      fixedPixelWidthOffenders(SIDEBAR_FILE, 'className="w-[260px] md:w-16 lg:w-[260px]"'),
    ).toEqual([])
    // A rem-based minimum table width is a deliberate scroll floor, not a
    // fixed pixel width.
    expect(
      fixedPixelWidthOffenders('src/shared/ui/data-table.tsx', 'className="w-full min-w-[34rem]"'),
    ).toEqual([])
  })

  it('detects a scroll container that cannot shrink', () => {
    expect(scrollContainmentOffenders('<div className="overflow-x-auto">')).toHaveLength(1)
    expect(scrollContainmentOffenders('<div className="min-w-0 overflow-x-auto">')).toHaveLength(0)
    expect(
      scrollContainmentOffenders('<div className="w-full min-w-0 max-w-full overflow-x-auto">'),
    ).toHaveLength(0)
    // A container that only hides the overflow does not scroll, so it is not
    // a scroll container at all.
    expect(scrollContainmentOffenders('<div className="overflow-x-hidden">')).toHaveLength(0)
  })

  it('detects a hover-only affordance', () => {
    const hoverOnly =
      '<button type="button" className="text-muted-foreground hover:text-destructive">'
    const withFocus =
      '<button type="button" className="text-muted-foreground hover:text-destructive focus-visible:text-destructive">'
    expect(hoverOnlyOffenders(hoverOnly)).toHaveLength(1)
    expect(hoverOnlyOffenders(withFocus)).toHaveLength(0)
    // The focus state may come from a sibling expression of the same element.
    const composed =
      '<button className={cn("rounded-md hover:bg-muted", "focus-visible:ring-2 focus-visible:ring-ring")}>'
    expect(hoverOnlyOffenders(composed)).toHaveLength(0)
    // A decorative row is not an interactive element.
    expect(hoverOnlyOffenders('<tr className="border-b hover:bg-ivory">')).toHaveLength(0)
    // The shared Button's base class supplies the focus ring for every variant.
    expect(
      hoverOnlyOffenders(
        '<button className={cn(buttonVariants({ variant: "ghost" }), "hover:bg-white/10")}>',
      ),
    ).toHaveLength(0)
  })

  it('detects a touch primitive below the 40px floor', () => {
    // Shaped exactly like the shared Button's own size map, so the detector
    // reads it the way it reads the production file.
    const compact = [
      "const buttonVariants = cva('x', {",
      '      variants: {',
      '      size: {',
      '        default:',
      "          'h-10 gap-2 px-4',",
      "        sm: 'h-8 gap-1.5 px-3',",
      '      },',
      '    })',
    ].join('\n')
    expect(buttonSizeOffenders(BUTTON_FILE, compact)).toEqual(['size "sm" reaches 32px on mobile'])
    const floored = compact.replace("'h-8 gap-1.5 px-3'", "'h-10 gap-1.5 px-3 sm:h-8'")
    expect(buttonSizeOffenders(BUTTON_FILE, floored)).toEqual([])
  })

  it('detects a primitive whose element lost its 40px class', () => {
    // One synthetic negative control PER element rule: the element keeps its
    // anchor but loses the class the rule requires. The other rules of the
    // same file stay satisfied, so the failure is attributable to this rule.
    for (const rule of ELEMENT_RULES) {
      const siblings = ELEMENT_RULES.filter((other) => other.path === rule.path && other !== rule)
      const siblingMarkup = siblings
        .map((other) => `<div ${other.anchor} className="${other.sample}"></div>`)
        .join('\n')
      const good = `${siblingMarkup}\n<div ${rule.anchor} className="${rule.sample}"></div>`
      const bad = `${siblingMarkup}\n<div ${rule.anchor} className="flex items-center"></div>`
      expect(elementRuleOffenders(rule.path, good)).toEqual([])
      expect(elementRuleOffenders(rule.path, bad).length).toBeGreaterThan(0)
    }
    // The forbidden class is caught as well: the checkbox's old 8px vertical
    // inset is a 40x32 hit area, not the 38.67px the 12px token reaches.
    const oldCheckbox =
      '<div data-slot="checkbox" className="size-4 after:-inset-x-3 after:-inset-y-2"></div>'
    expect(elementRuleOffenders('src/shared/ui/checkbox.tsx', oldCheckbox).length).toBeGreaterThan(
      0,
    )
    // A rule whose element is missing entirely is an offender, not a pass.
    expect(
      elementRuleOffenders('src/shared/ui/input.tsx', '<div className="h-10"></div>').length,
    ).toBeGreaterThan(0)
  })

  it('detects a physical direction utility', () => {
    expect(physicalDirectionOffenders('<div className="ml-2 flex">')).toEqual(['ml-2'])
    expect(physicalDirectionOffenders('<div className="right-0 top-0">')).toEqual(['right-0'])
    expect(physicalDirectionOffenders('<p className="text-left">')).toEqual(['text-left'])
    // Logical utilities are the house spelling.
    expect(physicalDirectionOffenders('<div className="ms-2 flex end-0">')).toEqual([])
    expect(physicalDirectionOffenders('<p className="text-start">')).toEqual([])
  })
})
