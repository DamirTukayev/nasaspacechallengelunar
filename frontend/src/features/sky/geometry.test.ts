import { describe, expect, it } from 'vitest'
import { elevationRange, gridStep, trackSegments } from './geometry'

describe('trackSegments', () => {
  it('keeps a path that does not cross north in one piece', () => {
    expect(trackSegments([90, 120, 150], [1, 2, 3])).toEqual([
      [
        { az: 90, el: 1 },
        { az: 120, el: 2 },
        { az: 150, el: 3 },
      ],
    ])
  })

  it('cuts a path crossing north at the edges with an interpolated elevation', () => {
    const segments = trackSegments([350, 10], [0, 2])

    expect(segments).toHaveLength(2)
    expect(segments[0].at(-1)).toEqual({ az: 360, el: 1 })
    expect(segments[1][0]).toEqual({ az: 0, el: 1 })
  })

  it('cuts the other way when moving west through north', () => {
    const segments = trackSegments([5, 355], [4, 0])

    expect(segments[0].at(-1)).toEqual({ az: 0, el: 2 })
    expect(segments[1][0]).toEqual({ az: 360, el: 2 })
  })

  it('keeps only the included samples', () => {
    const segments = trackSegments([0, 10, 20, 30, 40], [1, 1, 1, 1, 1], (i) => i !== 2)

    expect(segments.map((s) => s.map((p) => p.az))).toEqual([
      [0, 10],
      [30, 40],
    ])
  })

  it('drops single isolated points', () => {
    expect(trackSegments([0, 10, 20], [1, 1, 1], (i) => i === 1)).toEqual([])
  })
})

describe('elevationRange', () => {
  it('fits a polar sky with some margin', () => {
    expect(elevationRange([-2, 7], [1.5], [-6, 6])).toEqual({ min: -4, max: 9 })
  })

  it('caps at the zenith', () => {
    expect(elevationRange([0], [-88, 88], [65]).max).toBe(90)
  })

  it('gives sensible grid steps', () => {
    expect(gridStep({ min: -4, max: 9 })).toBe(2)
    expect(gridStep({ min: -4, max: 90 })).toBe(15)
  })
})
