import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../scene3d/math'
import {
  FLIGHT_SECONDS,
  MOON_RADIUS_KM,
  azElToGlobe,
  flightFrame,
  globeToLatLon,
  latLonToGlobe,
  normalize,
  planFlight,
  slerp,
} from './globe'

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3) => Math.sqrt(dot(a, a))
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

function expectVec(actual: Vec3, expected: Vec3, digits = 6) {
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits))
}

describe('globe frame', () => {
  it('matches how three.js wraps an equirectangular map', () => {
    // u = 0.5 (0° longitude) faces +x, u = 0.75 (90°E) faces −z, north is +y.
    expectVec(latLonToGlobe(0, 0), [1, 0, 0])
    expectVec(latLonToGlobe(0, 90), [0, 0, -1])
    expectVec(latLonToGlobe(0, 180), [-1, 0, 0])
    expectVec(latLonToGlobe(90, 0), [0, 1, 0])
    expectVec(latLonToGlobe(-90, 45), [0, -1, 0])
  })

  it('round-trips latitude and longitude', () => {
    for (const [lat, lon] of [
      [-89.45, -137.31],
      [-85.99, 2.93],
      [10, 170],
    ]) {
      const back = globeToLatLon(latLonToGlobe(lat, lon))
      expect(back.lat).toBeCloseTo(lat, 9)
      expect(back.lon).toBeCloseTo(lon, 9)
    }
  })
})

describe('azElToGlobe', () => {
  it('maps the local zenith, north and east at the equator', () => {
    expectVec(azElToGlobe(0, 0, 0, 90), [1, 0, 0])
    expectVec(azElToGlobe(0, 0, 0, 0), [0, 1, 0])
    expectVec(azElToGlobe(0, 0, 90, 0), [0, 0, -1])
  })

  it('at the south pole, north points along the site meridian and up is −y', () => {
    expectVec(azElToGlobe(-90, 0, 0, 90), [0, -1, 0])
    // From the south pole every direction along the surface is "north".
    expect(azElToGlobe(-90, 0, 0, 0)[1]).toBeCloseTo(0, 9)
    // A grazing Sun at the pole lights the globe from the side, as in the analysis.
    expect(Math.abs(azElToGlobe(-89.9, 0, 123, 1.5)[1])).toBeLessThan(0.03)
  })

  it('returns unit vectors', () => {
    expect(len(azElToGlobe(-85.4, 33.2, 211, -3.1))).toBeCloseTo(1, 12)
  })
})

describe('slerp', () => {
  it('stays on the unit sphere and hits both ends', () => {
    const a: Vec3 = [1, 0, 0]
    const b = normalize([0, 1, 1])
    expectVec(slerp(a, b, 0), a)
    expectVec(slerp(a, b, 1), b)
    expect(len(slerp(a, b, 0.37))).toBeCloseTo(1, 12)
  })
})

describe('flight', () => {
  const pole = latLonToGlobe(-89.9, 0)
  const sunAtPole = azElToGlobe(-89.9, 0, 140, 1)

  it('starts with the whole Moon in view and ends low over the site', () => {
    const plan = planFlight(pole, sunAtPole)
    const first = flightFrame(plan, 0)
    const last = flightFrame(plan, FLIGHT_SECONDS)
    expect(first.altitudeKm).toBeCloseTo(3 * MOON_RADIUS_KM, 6)
    expectVec(first.target, [0, 0, 0])
    expect(first.finished).toBe(false)

    expect(last.finished).toBe(true)
    expectVec(last.camera, plan.end)
    expectVec(last.target, pole)
    expect(last.altitudeKm).toBeGreaterThan(150)
    expect(last.altitudeKm).toBeLessThan(250)
  })

  it('starts over the sunlit side', () => {
    const plan = planFlight(pole, sunAtPole)
    expect(dot(plan.start, sunAtPole)).toBeGreaterThan(0.7)
  })

  it('descends without ever going up', () => {
    const plan = planFlight(pole, sunAtPole)
    let previous = Infinity
    for (let t = 0; t <= FLIGHT_SECONDS; t += 0.1) {
      const { altitudeKm } = flightFrame(plan, t)
      expect(altitudeKm).toBeLessThanOrEqual(previous + 1e-9)
      previous = altitudeKm
    }
  })

  it.each([
    ['south pole, grazing Sun', -89.9, 0, 140, 1],
    ['Malapert', -85.99, 2.93, 80, 3],
    ['equator at noon', 0, 0, 0, 90],
    ['north pole', 89, 20, 250, 0.5],
    ['far side', -20, 170, 300, 40],
  ])('%s: the camera never looks along its own up vector', (_name, lat, lon, az, el) => {
    const site = latLonToGlobe(lat, lon)
    const plan = planFlight(site, azElToGlobe(lat, lon, az, el))
    for (let t = 0; t <= FLIGHT_SECONDS; t += 0.05) {
      const f = flightFrame(plan, t)
      const view = normalize(sub(f.target, f.camera))
      expect(Math.abs(dot(view, f.up))).toBeLessThan(1e-9)
      expect(len(f.up)).toBeCloseTo(1, 9)
      // And it stays outside the Moon.
      expect(len(f.camera)).toBeGreaterThan(1.05)
    }
  })

  it("starts with the Moon's north up and ends with the surface below", () => {
    const plan = planFlight(pole, sunAtPole)
    const first = flightFrame(plan, 0)
    const north = normalize([
      -plan.start[0] * plan.start[1],
      1 - plan.start[1] ** 2,
      -plan.start[2] * plan.start[1],
    ])
    expect(dot(first.up, north)).toBeCloseTo(1, 6)
    const last = flightFrame(plan, FLIGHT_SECONDS)
    expect(dot(last.up, pole)).toBeGreaterThan(0.5)
  })

  it('ends with the site in front of the camera, limb in view', () => {
    const plan = planFlight(pole, sunAtPole)
    const f = flightFrame(plan, FLIGHT_SECONDS)
    const view = normalize(sub(f.target, f.camera))
    // Oblique, not straight down: the camera sees the horizon of the Moon.
    const down = -dot(view, normalize(f.camera))
    expect(down).toBeGreaterThan(0.3)
    expect(down).toBeLessThan(0.9)
  })
})
