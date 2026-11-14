import { describe, expect, it } from 'vitest'
import {
  decodeBits,
  rampColor,
  runningCounts,
  sharesUntil,
  vertexValue,
  vertexWeights,
} from './heat'

/** What the backend sends: bits packed big-endian (numpy.packbits), base64. */
function encode(bits: number[]): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  bits.forEach((b, i) => {
    if (b) bytes[i >> 3] |= 1 << (7 - (i & 7))
  })
  return btoa(String.fromCharCode(...bytes))
}

describe('decodeBits', () => {
  it('reads numpy.packbits output, ignoring padding bits', () => {
    // numpy.packbits([1,0,1,1,0,0,0,0, 1,1]) → [0b10110000, 0b11000000] → "sMA="
    expect(Array.from(decodeBits('sMA=', 10))).toEqual([1, 0, 1, 1, 0, 0, 0, 0, 1, 1])
  })

  it('round-trips any pattern', () => {
    const bits = Array.from({ length: 709 }, (_, i) => ((i * 7919) % 3 === 0 ? 1 : 0))
    expect(Array.from(decodeBits(encode(bits), 709))).toEqual(bits)
  })
})

describe('share so far', () => {
  const timelines = [encode([1, 1, 0, 0]), null, encode([0, 0, 0, 1])]
  const counts = runningCounts(timelines, 4)
  const present = timelines.map((t) => t !== null)

  it('is the share of samples 0…index with the body visible', () => {
    expect(Array.from(sharesUntil(counts, 3, 4, 0, present)).slice(0, 1)).toEqual([1])
    expect(sharesUntil(counts, 3, 4, 1, present)[0]).toBe(1)
    expect(sharesUntil(counts, 3, 4, 3, present)[0]).toBe(0.5)
    expect(sharesUntil(counts, 3, 4, 2, present)[2]).toBe(0)
    expect(sharesUntil(counts, 3, 4, 3, present)[2]).toBe(0.25)
  })

  it('marks nodes off the DEM as missing, and clamps the index', () => {
    expect(Number.isNaN(sharesUntil(counts, 3, 4, 3, present)[1])).toBe(true)
    expect(sharesUntil(counts, 3, 4, 99, present)[0]).toBe(0.5)
  })
})

describe('vertexWeights', () => {
  // A 3×3 grid over ±2 km (2 km step) under a 5×5 terrain over ±4 km.
  const grid = { east_m: [-2000, 0, 2000], north_m: [2000, 0, -2000] }
  const { nodes, weights } = vertexWeights(5, 4000, grid)

  it('leaves vertices outside the grid uncoloured', () => {
    expect(nodes[0]).toBe(-1) // north-west corner of the terrain, 4 km out
  })

  it('puts a vertex on a node entirely on that node', () => {
    const centre = 2 * 5 + 2
    const values = Float32Array.from([0, 0, 0, 0, 0.8, 0, 0, 0, 0])
    expect(vertexValue(values, nodes, weights, centre)).toBeCloseTo(0.8)
  })

  it('interpolates between nodes, north up and east right', () => {
    // Vertex (row 1, col 2): 2 km north, on the centre meridian → exactly the north node.
    const north = 1 * 5 + 2
    const values = Float32Array.from([0, 0.6, 0, 0, 0.2, 0, 0, 0, 0])
    expect(vertexValue(values, nodes, weights, north)).toBeCloseTo(0.6)
  })

  it('skips nodes off the DEM instead of darkening the blend', () => {
    const values = Float32Array.from([Number.NaN, 1, 1, 1, 1, 1, 1, 1, 1])
    for (let v = 0; v < 25; v++) {
      const value = vertexValue(values, nodes, weights, v)
      if (!Number.isNaN(value)) expect(value).toBeCloseTo(1)
    }
  })
})

describe('rampColor', () => {
  it('runs dark to the layer colour and clamps', () => {
    const close = (got: number[], want: number[]) =>
      want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 9))
    close(rampColor('sun', 1), [1, 0.78, 0.26])
    close(rampColor('earth', 1), [0.43, 0.66, 1])
    expect(rampColor('sun', -1)).toEqual(rampColor('sun', 0))
    expect(rampColor('sun', 0.5)[0]).toBeGreaterThan(rampColor('sun', 0.2)[0])
  })
})
