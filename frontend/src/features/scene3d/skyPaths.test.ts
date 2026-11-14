import { describe, expect, it } from 'vitest'
import { DOME_RADIUS, skyPoint, skySegments, trackIndices } from './skyPaths'

describe('sky paths', () => {
  it('uses the panorama convention: north is -z, east is +x, zenith is +y', () => {
    expect(skyPoint(0, 0)).toEqual([0, 0, -DOME_RADIUS])
    expect(skyPoint(90, 0)[0]).toBeCloseTo(DOME_RADIUS)
    expect(skyPoint(0, 90)[1]).toBeCloseTo(DOME_RADIUS)
  })
  it('splits a horizon crossing near north without drawing across the azimuth seam', () => {
    const track = skySegments({ azimuth: [359, 1], elevation: [-2, 2] })
    expect(track.above.length).toBe(6)
    expect(track.below.length).toBe(6)
    expect(track.above[1]).toBe(0)
    expect(track.above[2]).toBeCloseTo(-DOME_RADIUS, 2)
  })
  it('retains both endpoints when reducing long series', () => {
    const indices = trackIndices(20000, 512)
    expect(indices[0]).toBe(0)
    expect(indices.at(-1)).toBe(19999)
    expect(indices.length).toBeLessThanOrEqual(512)
    expect(trackIndices(1)).toEqual([0])
    expect(trackIndices(0)).toEqual([])
  })
  it('keeps real Earth libration samples rather than replacing them with an ellipse', () => {
    const azimuth = [10, 11, 10, 9, 10],
      elevation = [5, 6, 7, 6, 5]
    const { above } = skySegments({ azimuth, elevation })
    expect(Array.from(above.slice(6, 9))).toEqual(skyPoint(11, 6).map(Math.fround))
    expect(above.length).toBe(24)
  })
})
