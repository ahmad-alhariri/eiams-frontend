import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import {
  allowMarkersIn,
  applicationSourceFiles,
  assertScannedFiles,
  excusedLines,
  relativeToRepo,
} from './support/source-scan'

/**
 * The RTL copy fence for the Arabic UI.
 *
 * The rules come from docs/rtl-copy-audit.md. The gallery is excluded: it is a
 * demo surface, not a workflow, and the responsive audit that owns the physical
 * direction rule excludes it too - the fence asserts that owner still pins the
 * same file count.
 */
const SCANNED = applicationSourceFiles().filter(
  (file) => !relativeToRepo(file).startsWith('src/app/gallery/'),
)
// Committed count of this scan's own file set (applicationSourceFiles minus src/app/gallery); must be re-pinned when application files are added or removed.
const EXPECTED_SCANNED_FILES = 395

/** Attribute names whose value a user reads on screen. */
const USER_VISIBLE_ATTRIBUTES = [
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-valuetext',
  'cancelText',
  'confirmText',
  'description',
  'emptyMessage',
  'errorMessage',
  'header',
  'helperText',
  'label',
  'placeholder',
  'title',
  'tooltip',
] as const

/**
 * A Latin token that is a technical example rather than untranslated copy.
 *
 * Every Latin token in a user-visible attribute has to be one of these; a value
 * that mixes an Arabic label with one Latin word ("TYP: EXT-001") passes only
 * because that word is a code.
 */
const TECHNICAL_EXAMPLE_PATTERNS: readonly RegExp[] = [
  /@/u, // email
  /^[a-z]+(?:\.[a-z]+)+$/iu, // dotted login
  /^[A-Z0-9][A-Z0-9\-_/]*$/u, // uppercase code or acronym
  /^[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*$/u, // CamelCase identifier
  /^\d{4}-\d{2}-\d{2}$/u, // ISO date
  /^[{[][\s\S]*[}\]]$/u, // JSON object
]

function isTechnicalExample(token: string): boolean {
  const bare = token.replace(/^[([{<]+/u, '').replace(/[.,;:!?)\]}>]+$/u, '')
  return TECHNICAL_EXAMPLE_PATTERNS.some((pattern) => pattern.test(bare))
}

function latinTokens(value: string): string[] {
  return value
    .split(/\s+/u)
    .filter((token) => /[A-Za-z]/u.test(token))
    .map((token) => token.replace(/^[([{<]+/u, '').replace(/[.,;:!?)\]}>]+$/u, ''))
}

function untranslatedTokens(value: string): string[] {
  return latinTokens(value).filter((token) => !isTechnicalExample(token))
}

/** The attribute name of a JSX attribute, whether plain or namespaced. */
function attributeName(attribute: ts.JsxAttribute): string {
  return ts.isIdentifier(attribute.name) ? attribute.name.text : attribute.name.name.text
}
function isLeftToRightContext(node: ts.Node): boolean {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (
      (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) &&
      elementHasLtr(current)
    ) {
      return true
    }
  }
  return false
}

function rawNumberOffenders(file: string, source: string): string[] {
  const excused = excusedLines(source, 'raw-number-interpolation')
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const offenders: string[] = []
  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node) && /\d/u.test(node.text) && !isLeftToRightContext(node)) {
      const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1
      if (!excused.has(line - 1)) {
        offenders.push(`${relativeToRepo(file)}:${line} ${node.text.trim()}`)
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(parsed)
  return offenders
}
function latinAttributeOffenders(file: string, source: string): string[] {
  const excused = excusedLines(source, 'latin-attribute-example')
  const pattern = new RegExp(`\\b(${USER_VISIBLE_ATTRIBUTES.join('|')})\\s*=\\s*"([^"]*)"`, 'gu')
  const offenders: string[] = []
  for (const match of source.matchAll(pattern)) {
    const line = source.slice(0, match.index).split(/\r?\n/u).length
    if (excused.has(line - 1)) continue
    const untranslated = untranslatedTokens(match[2] ?? '')
    if (untranslated.length > 0) {
      offenders.push(`${relativeToRepo(file)}:${line} ${match[1]}="${match[2]}"`)
    }
  }
  return offenders
}

/**
 * The numeric detector needs the STATIC type of an interpolated expression.
 *
 * A source scan alone cannot tell `{quantity}` (a number) from `{quantity.name}`
 * (a string), so the scan builds the real TypeScript program from
 * `tsconfig.app.json` and asks the checker for the type of every JSX child
 * expression.
 */
let cachedProgram: { program: ts.Program; checker: ts.TypeChecker } | undefined

/** The program is built once per test file and shared by both detectors. */
function appProgram(): { program: ts.Program; checker: ts.TypeChecker } {
  if (cachedProgram !== undefined) return cachedProgram
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.app.json')
  if (configPath === undefined) throw new Error('tsconfig.app.json not found')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error !== undefined) throw new Error('tsconfig.app.json not readable')
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath))
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
  cachedProgram = { program, checker: program.getTypeChecker() }
  return cachedProgram
}
/** Whether a JSX element opts out of the Arabic direction for its own content. */
function elementHasLtr(element: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const properties = ts.isJsxElement(element)
    ? element.openingElement.attributes.properties
    : element.attributes.properties
  return properties.some((attribute) => {
    if (!ts.isJsxAttribute(attribute)) return false
    const name = attributeName(attribute)
    if (name === 'ltr') {
      if (attribute.initializer === undefined) return true
      if (ts.isJsxExpression(attribute.initializer)) {
        return attribute.initializer.expression?.getText() !== 'false'
      }
      return true
    }
    if (name !== 'dir') return false
    return (
      attribute.initializer !== undefined &&
      ts.isStringLiteral(attribute.initializer) &&
      attribute.initializer.text === 'ltr'
    )
  })
}

function numberInterpolationOffenders(files: readonly string[] = SCANNED): string[] {
  const { program, checker } = appProgram()
  const scanned = new Set(files.map((file) => relativeToRepo(file)))
  const offenders: string[] = []

  for (const sourceFile of program.getSourceFiles()) {
    const relative = relativeToRepo(sourceFile.fileName)
    if (!scanned.has(relative)) continue
    const source = sourceFile.getFullText()
    const excused = excusedLines(source, 'raw-number-interpolation')
    const walk = (node: ts.Node, inLtrRun: boolean): void => {
      if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
        const childLtr = inLtrRun || (ts.isJsxElement(node) && elementHasLtr(node))
        for (const child of node.children) {
          if (ts.isJsxExpression(child)) {
            const expression = child.expression
            const type =
              expression === undefined ? undefined : checker.getTypeAtLocation(expression)
            if (type !== undefined && (type.flags & ts.TypeFlags.NumberLike) !== 0 && !childLtr) {
              const line =
                sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile)).line + 1
              if (!excused.has(line - 1)) {
                offenders.push(`${relative}:${line} ${child.getText(sourceFile)}`)
              }
            }
          }
          walk(child, childLtr)
        }
        return
      }
      ts.forEachChild(node, (child) => walk(child, inLtrRun))
    }
    walk(sourceFile, false)
  }
  return offenders
}
function fontStackOffenders(css: string): string[] {
  const offenders: string[] = []
  const sans = /--font-sans:\s*([^;]+);/u.exec(css)
  const arabic = /--font-arabic:\s*([^;]+);/u.exec(css)
  if (sans === null || arabic === null) {
    offenders.push('index.css must declare --font-sans and --font-arabic')
    return offenders
  }
  for (const [name, value] of [
    ['--font-sans', sans[1] ?? ''],
    ['--font-arabic', arabic[1] ?? ''],
  ] as const) {
    const traditional = value.indexOf('Traditional Arabic')
    const noto = value.indexOf('Noto Sans Arabic Variable')
    if (traditional === -1 || noto === -1 || traditional > noto) {
      offenders.push(`${name} must list 'Traditional Arabic' before 'Noto Sans Arabic Variable'`)
    }
  }
  if (!css.includes("@import '@fontsource-variable/noto-sans-arabic'")) {
    offenders.push("index.css must import '@fontsource-variable/noto-sans-arabic'")
  }
  if (!/html\s*\{[^}]*@apply\s+font-sans;/su.test(css)) {
    offenders.push('index.css must apply font-sans to html')
  }
  return offenders
}

function documentDirectionOffenders(html: string): string[] {
  return /<html[^>]*\blang="ar"/u.test(html) && /<html[^>]*\bdir="rtl"/u.test(html)
    ? []
    : ['index.html must declare <html lang="ar" dir="rtl">']
}

describe('rtl-copy-audit', () => {
  it('scans the pinned production set', () => {
    assertScannedFiles(SCANNED, EXPECTED_SCANNED_FILES)
  })

  it('keeps the responsive audit owner on the same file count', () => {
    const owner = readFileSync(join(process.cwd(), 'src/test/responsive-audit.test.ts'), 'utf8')
    const pinned = /EXPECTED_SCANNED_FILES\s*=\s*(\d+)/u.exec(owner)
    expect(pinned?.[1]).toBe(String(EXPECTED_SCANNED_FILES))
  })

  it('keeps the design token rule with its owner', () => {
    expect(
      readFileSync(join(process.cwd(), 'src/test/design-token-literals.test.ts'), 'utf8'),
    ).toContain('expect')
  })

  it('writes no raw numeric interpolation into JSX text', () => {
    const offenders: string[] = []
    for (const file of SCANNED.filter((candidate) => candidate.endsWith('.tsx'))) {
      const source = readFileSync(file, 'utf8')
      offenders.push(...rawNumberOffenders(file, source))
    }
    expect(offenders).toEqual([])
  })

  it('writes no number-typed interpolation into JSX text', () => {
    expect(numberInterpolationOffenders()).toEqual([])
  })
  it('writes no untranslated Latin copy into user-visible attributes', () => {
    const offenders: string[] = []
    for (const file of SCANNED.filter((candidate) => candidate.endsWith('.tsx'))) {
      const source = readFileSync(file, 'utf8')
      offenders.push(...latinAttributeOffenders(file, source))
    }
    expect(offenders).toEqual([])
  })

  it('declares the Arabic font stack and the RTL document direction', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    const layout = readFileSync(join(process.cwd(), 'src/shared/layout/app-layout.tsx'), 'utf8')
    expect([...fontStackOffenders(css), ...documentDirectionOffenders(html)]).toEqual([])
    expect(layout).toContain('dir="rtl"')
  })

  it('keeps the reviewed allowlists small', () => {
    const byRule = new Map<string, number>()
    for (const file of SCANNED) {
      for (const marker of allowMarkersIn(readFileSync(file, 'utf8'))) {
        byRule.set(marker.rule, (byRule.get(marker.rule) ?? 0) + 1)
      }
    }
    expect(byRule.get('latin-attribute-example')).toBe(4)
    expect(byRule.get('raw-number-interpolation')).toBe(2)
  })

  it('reports exactly the control violations it claims to detect', () => {
    const control = join(process.cwd(), 'src/test/fixtures/rtl-copy-audit-control.tsx')
    const numeric = numberInterpolationOffenders([control])
    expect(numeric).toHaveLength(1)
    expect(numeric[0] ?? '').toContain('{quantity}')
    const latin = latinAttributeOffenders(control, readFileSync(control, 'utf8'))
    expect(latin).toHaveLength(1)
    expect(latin[0] ?? '').toContain('placeholder="Save the document"')
  })

  it('detects the font and direction violations it claims to detect', () => {
    expect(fontStackOffenders(':root { --font-sans: Inter; }')).not.toEqual([])
    expect(documentDirectionOffenders('<html lang="en">')).not.toEqual([])
  })
})
