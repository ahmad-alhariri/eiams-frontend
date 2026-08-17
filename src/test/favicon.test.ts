import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import htmlEntryRaw from '../../index.html?raw'
import generatorRaw from '../../scripts/generate-favicon-ico.mjs?raw'
import { describe, expect, it } from 'vitest'

const faviconIco = readFileSync(join(process.cwd(), 'public', 'favicon.ico'))

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

describe('application shell favicon', () => {
  it('declares the binding SVG icon in the application entry', () => {
    expect(htmlEntryRaw).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
  })

  it('serves a valid ICO fallback so /favicon.ico never 404s', () => {
    // ICONDIR: reserved=0, type=icon(1), image count=1
    expect([...faviconIco.subarray(0, 6)]).toEqual([0, 0, 1, 0, 1, 0])

    // Single 32x32 entry: planes=1, bpp=32, PNG embedded at offset 22
    expect(faviconIco[6]).toBe(32)
    expect(faviconIco[7]).toBe(32)
    expect(faviconIco.readUInt16LE(10)).toBe(1)
    expect(faviconIco.readUInt16LE(12)).toBe(32)
    expect(faviconIco.readUInt32LE(18)).toBe(22)

    // Embedded PNG: signature, then a 32x32 RGBA image
    expect([...faviconIco.subarray(22, 30)]).toEqual(PNG_SIGNATURE)
    expect(faviconIco.readUInt32BE(38)).toBe(32)
    expect(faviconIco.readUInt32BE(42)).toBe(32)
    expect(faviconIco[46]).toBe(8) // bit depth
    expect(faviconIco[47]).toBe(6) // color type: RGBA
  })

  it('regenerates the fallback from the binding SVG identity', () => {
    expect(generatorRaw).toContain('public/favicon.svg')
    expect(generatorRaw).toContain('#002623')
    expect(generatorRaw).toContain('#988561')
    expect(generatorRaw).toContain('#428177')
  })
})
