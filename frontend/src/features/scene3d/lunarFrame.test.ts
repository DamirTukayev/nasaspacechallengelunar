import { describe, it, expect } from 'vitest'
import { azElToGlobe, latLonToGlobe, MOON_RADIUS_KM } from '../mission-control/globe'
import { azElToVector } from './math'
import { globeDirectionToLocal, globePositionToLocal } from './lunarFrame'
describe('shared lunar frame', () => {
  for (const site of [
    { lat: -90, lon: 0 },
    { lat: -80.13, lon: 1.44 },
    { lat: 20, lon: 130 },
  ]) {
    it(`anchors the surface and axes at ${site.lat},${site.lon}`, () => {
      const p = globePositionToLocal(latLonToGlobe(site.lat, site.lon), site)
      p.forEach((v) => expect(v).toBeCloseTo(0, 8))
      const direction = globeDirectionToLocal(azElToGlobe(site.lat, site.lon, 73, 12), site)
      direction.forEach((v, i) => expect(v).toBeCloseTo(azElToVector(73, 12)[i], 8))
      expect(globePositionToLocal([0, 0, 0], site, 1.3)[1]).toBeCloseTo(-MOON_RADIUS_KM - 1.3)
    })
  }
})
