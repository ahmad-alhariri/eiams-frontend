import { describe, expect, it } from 'vitest'

import {
  applicationSourceFiles,
  assertScannedFiles,
  readSource,
  relativeToRepo,
} from './support/source-scan'

/**
 * The accessibility audit (eiams-frontend-e25-t01).
 *
 * No accessibility tooling is available to this repository - axe-core,
 * jest-axe and pa11y are absent from both node_modules and the lockfile -
 * so the audit is built from the house idiom: a source scan over the pinned
 * production file set, one detector per WCAG rule, and a synthetic negative
 * control per detector so a rule that can never fire is caught.
 *
 * Every rule below is grounded in the house accessibility spec
 * (docs/design-tokens.md):
 *   - "Interactive focus uses the Mountain Teal ring with a visible 2px
 *     treatment" and "ring | mountain-teal | Keyboard focus indicator"
 *     -> the focus-indicator rule and the reduced-motion rule.
 *   - "Respect prefers-reduced-motion whenever a new motion primitive is
 *     introduced" -> the reduced-motion rule.
 *   - "Normal text requires at least 4.5:1 contrast" is not statically
 *     decidable and is not asserted here; it needs a rendered audit.
 */
const SCANNED = applicationSourceFiles()

/** The pinned production file count. A narrowed glob must fail loudly. */
const EXPECTED_SCANNED_FILES = 407

/** An INFINITE (looping) animation. The one-shot enter/exit transitions use
 * a different mechanism (motion-reduce:data-open:animate-none), so they are
 * deliberately not part of this rule. */
const INFINITE_ANIMATION = /\banimate-(?:spin|pulse|shimmer|bounce|ping)\b/u

function offendingLines(source: string, isOffender: (line: string) => boolean): string[] {
  const found: string[] = []
  source.split(/\r?\n/u).forEach((line, index) => {
    if (isOffender(line)) {
      found.push((index + 1).toString() + ': ' + line.trim())
    }
  })
  return found
}

/** WCAG 2.4.3 - a positive tabIndex overrides the natural focus order. */
function positiveTabIndexOffenders(source: string): string[] {
  const found: string[] = []
  const pattern = /[^\n]*\btabIndex\s*=\s*\{?\s*[^0-9-]*(-?\d+)[^\n]*/gu
  for (const match of source.matchAll(pattern)) {
    if (Number(match[1]) > 0) {
      found.push(match[0].trim())
    }
  }
  return found
}

/** WCAG 1.1.1 - every image needs an alternative. */
function missingAltOffenders(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/<img\b[^>]*>/gsu)) {
    if (!/\balt\s*=/u.test(match[0])) {
      found.push(match[0].replace(/\s+/gu, ' '))
    }
  }
  return found
}

/** WCAG 3.2.2 - focus must not move without the user asking. */
function autoFocusOffenders(source: string): string[] {
  return offendingLines(source, (line) => /\bautoFocus\b/u.test(line))
}

/**
 * WCAG 2.3.3 / the house "respect prefers-reduced-motion" rule - an infinite
 * animation must be cancellable by prefers-reduced-motion.
 */
function unguardedAnimationOffenders(source: string): string[] {
  const found: string[] = []
  const pattern = new RegExp(`[^\\n]*${INFINITE_ANIMATION.source}[^\\n]*`, 'gu')
  for (const match of source.matchAll(pattern)) {
    if (!match[0].includes('motion-reduce:')) {
      found.push(match[0].trim())
    }
  }
  return found
}

/**
 * WCAG 2.4.7 - removing the outline on focus is only allowed when a visible
 * focus-visible replacement (the Mountain Teal ring) replaces it.
 */
function focusIndicatorOffenders(source: string): string[] {
  const found: string[] = []
  const pattern = /[^\n]*\bfocus:outline-none\b[^\n]*/gu
  for (const match of source.matchAll(pattern)) {
    if (!match[0].includes('focus-visible:')) {
      found.push(match[0].trim())
    }
  }
  return found
}

function scanRule(detector: (source: string) => string[]): string[] {
  const found: string[] = []
  for (const file of SCANNED) {
    for (const offender of detector(readSource(file))) {
      found.push(relativeToRepo(file) + ': ' + offender)
    }
  }
  return found
}

describe('accessibility audit (eiams-frontend-e25-t01)', () => {
  it('scans the pinned set of production files', () => {
    assertScannedFiles(SCANNED, EXPECTED_SCANNED_FILES)
  })

  it('keeps the focus order natural', () => {
    expect(scanRule(positiveTabIndexOffenders)).toEqual([])
  })

  it('gives every image an alternative', () => {
    expect(scanRule(missingAltOffenders)).toEqual([])
  })

  it('never moves focus without the user asking', () => {
    expect(scanRule(autoFocusOffenders)).toEqual([])
  })

  it('respects prefers-reduced-motion for every infinite animation', () => {
    expect(scanRule(unguardedAnimationOffenders)).toEqual([])
  })

  it('keeps a visible keyboard focus indicator', () => {
    expect(scanRule(focusIndicatorOffenders)).toEqual([])
  })
})

describe('accessibility audit detectors can fail', () => {
  it('detects a positive tabIndex but not a negative or zero one', () => {
    expect(positiveTabIndexOffenders('<div tabIndex={1} />')).toHaveLength(1)
    expect(positiveTabIndexOffenders('<div tabIndex={-1} />')).toHaveLength(0)
    expect(positiveTabIndexOffenders('<div tabIndex={0} />')).toHaveLength(0)
  })

  it('detects an image without an alternative', () => {
    expect(missingAltOffenders('<img src="x" />')).toHaveLength(1)
    expect(missingAltOffenders('<img src="x" alt="a photo" />')).toHaveLength(0)
    expect(
      missingAltOffenders('<img' + '\n' + '  src="x"' + '\n' + '  alt="a photo"' + '\n' + '/>'),
    ).toHaveLength(0)
  })

  it('detects autoFocus', () => {
    expect(autoFocusOffenders('<input autoFocus />')).toHaveLength(1)
    expect(autoFocusOffenders('<input />')).toHaveLength(0)
  })

  it('detects an infinite animation with no reduced-motion guard', () => {
    expect(unguardedAnimationOffenders('className="animate-spin"')).toHaveLength(1)
    expect(
      unguardedAnimationOffenders('className="animate-spin motion-reduce:animate-none"'),
    ).toHaveLength(0)
    expect(
      unguardedAnimationOffenders('className="animate-shimmer motion-reduce:before:animate-none"'),
    ).toHaveLength(0)
    expect(unguardedAnimationOffenders('className="animate-in"')).toHaveLength(0)
  })

  it('detects a removed focus outline with no focus-visible replacement', () => {
    expect(focusIndicatorOffenders('className="focus:outline-none"')).toHaveLength(1)
    expect(
      focusIndicatorOffenders(
        'className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"',
      ),
    ).toHaveLength(0)
    expect(
      focusIndicatorOffenders('className="focus-visible:outline-none focus-visible:ring-2"'),
    ).toHaveLength(0)
  })
})
