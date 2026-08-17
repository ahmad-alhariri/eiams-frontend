#!/usr/bin/env node
/**
 * Regenerates `public/favicon.ico` from the binding SVG identity
 * (`public/favicon.svg`): the same 32x32 viewBox, path geometry, and brand
 * colors, rasterized with 4x supersampling into a 32x32 PNG and wrapped in a
 * standard ICO container. Browser fallback probes of `/favicon.ico` therefore
 * resolve to the approved mark instead of a 404.
 *
 * Deterministic: rerunning reproduces the committed file byte-for-byte.
 * Run from the repository root: `node scripts/generate-favicon-ico.mjs`
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 32
const SUPERSAMPLING = 4

// Binding colors (public/favicon.svg): forest #002623, gold #988561, teal #428177
const FOREST = { r: 0x00, g: 0x26, b: 0x23 }
const GOLD = { r: 0x98, g: 0x85, b: 0x61 }
const TEAL = { r: 0x42, g: 0x81, b: 0x77 }

// Binding geometry (public/favicon.svg), unscaled.
const BACKGROUND_RECT = { x: 0, y: 0, width: 32, height: 32, radius: 8 }
const CHEVRON = [
  [8, 22.5],
  [16, 8],
  [24, 22.5],
  [19.6, 22.5],
  [16, 16.4],
  [12.4, 22.5],
]
const BAR_RECT = { x: 8, y: 24, width: 16, height: 2.2, radius: 1.1 }

function pointInRoundedRect(x, y, rect) {
  if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) {
    return false
  }
  const centerX = Math.min(Math.max(x, rect.x + rect.radius), rect.x + rect.width - rect.radius)
  const centerY = Math.min(Math.max(y, rect.y + rect.radius), rect.y + rect.height - rect.radius)
  const dx = x - centerX
  const dy = y - centerY
  return dx * dx + dy * dy <= rect.radius * rect.radius
}

function pointInPolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) {
      inside = !inside
    }
  }
  return inside
}

function colorAt(x, y) {
  if (pointInRoundedRect(x, y, BAR_RECT)) {
    return TEAL
  }
  if (pointInPolygon(x, y, CHEVRON)) {
    return GOLD
  }
  if (pointInRoundedRect(x, y, BACKGROUND_RECT)) {
    return FOREST
  }
  return null
}

// Supersampled rasterization: each output pixel averages SUPERSAMPLING^2
// sub-pixel samples, matching the browser's anti-aliased SVG rendering.
function rasterize() {
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  const samples = SUPERSAMPLING * SUPERSAMPLING
  const step = 1 / SUPERSAMPLING

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let red = 0
      let green = 0
      let blue = 0
      let covered = 0

      for (let sy = 0; sy < SUPERSAMPLING; sy++) {
        for (let sx = 0; sx < SUPERSAMPLING; sx++) {
          const x = px + (sx + 0.5) * step
          const y = py + (sy + 0.5) * step
          const color = colorAt(x, y)
          if (color !== null) {
            red += color.r
            green += color.g
            blue += color.b
            covered++
          }
        }
      }

      const index = (py * SIZE + px) * 4
      if (covered > 0) {
        pixels[index] = Math.round(red / covered)
        pixels[index + 1] = Math.round(green / covered)
        pixels[index + 2] = Math.round(blue / covered)
        pixels[index + 3] = Math.round((covered / samples) * 255)
      }
    }
  }
  return pixels
}

// --- Minimal PNG encoder (RGBA, 8-bit) --------------------------------------

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let value = n
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  CRC_TABLE[n] = value >>> 0
}

function crc32(chunk) {
  let crc = 0xffffffff
  for (const byte of chunk) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, crc])
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const scanlines = Buffer.alloc((width * 4 + 1) * height)
  for (let row = 0; row < height; row++) {
    scanlines[row * (width * 4 + 1)] = 0 // filter: none
    pixels
      .subarray(row * width * 4, (row + 1) * width * 4)
      .forEach((byte, offset) => (scanlines[row * (width * 4 + 1) + 1 + offset] = byte))
  }
  const idat = deflateSync(scanlines)
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// --- ICO container: ICONDIR + one 32x32 entry + embedded PNG -----------------

function encodeIco(png) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // image count
  header[6] = 32 // width
  header[7] = 32 // height
  header.writeUInt16LE(1, 10) // planes
  header.writeUInt16LE(32, 12) // bits per pixel
  header.writeUInt32LE(png.length, 14) // bytes in resource
  header.writeUInt32LE(22, 18) // image offset
  return Buffer.concat([header, png])
}

const ico = encodeIco(encodePng(SIZE, SIZE, rasterize()))
const outputPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'favicon.ico')
writeFileSync(outputPath, ico)
console.log(`Wrote ${outputPath} (${ico.length} bytes)`)
