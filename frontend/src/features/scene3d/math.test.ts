import { describe, expect, it } from 'vitest'
import {
  DESCENT_SECONDS,
  TOUCHDOWN_SECONDS,
  type Vec3,
  azElToVector,
  descentFrame,
  descentTelemetry,
} from './math'

const close = (v: number[], expected: number[]) =>
  v.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 6))

describe('azElToVector', () => {
  it('maps compass directions onto the scene axes', () => {
    close(azElToVector(0, 0), [0, 0, -1]) // north = −z
    close(azElToVector(90, 0), [1, 0, 0]) // east = +x
    close(azElToVector(180, 0), [0, 0, 1]) // south = +z
    close(azElToVector(270, 0), [-1, 0, 0]) // west = −x
    close(azElToVector(123, 90), [0, 1, 0]) // zenith
  })

  it('returns unit vectors', () => {
    const [x, y, z] = azElToVector(37, 12)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10)
  })
})

describe('descentFrame', () => {
  const overview: Vec3 = [6, 3, 6]

  it('starts high with the engine on', () => {
    const f = descentFrame(0, overview)
    expect(f.landerAltitude).toBeCloseTo(4)
    expect(f.thrust).toBeGreaterThan(0.5)
    expect(f.finished).toBe(false)
  })

  it('comes down monotonically and touches down at 5 s', () => {
    const heights = [0, 1, 2, 3, 4, 4.99].map((s) => descentFrame(s, overview).landerAltitude)
    expect(heights).toEqual([...heights].sort((a, b) => b - a))
    expect(descentFrame(5, overview)).toMatchObject({ landerAltitude: 0, thrust: 0 })
  })

  it('ends in the overview position', () => {
    const f = descentFrame(DESCENT_SECONDS, overview)
    expect(f.finished).toBe(true)
    close(f.camera, overview)
  })
})

describe('descentTelemetry', () => {
  it('agrees with the animated lander height', () => {
    for (const s of [0, 1.3, 2.7, 4.1]) {
      expect(descentTelemetry(s).altitudeM).toBeCloseTo(
        descentFrame(s, [0, 0, 0]).landerAltitude * 1000,
        6,
      )
    }
  })

  it('brakes from a realistic speed to a gentle touchdown', () => {
    const start = descentTelemetry(0)
    expect(start.altitudeM).toBe(4000)
    // Real landers start their final descent from 4 km at a few tens of m/s.
    expect(start.descentRateMs).toBeGreaterThan(30)
    expect(start.descentRateMs).toBeLessThan(100)
    expect(descentTelemetry(TOUCHDOWN_SECONDS * 0.98).descentRateMs).toBeLessThan(2)

    const rates = [0, 1, 2, 3, 4].map((s) => descentTelemetry(s).descentRateMs)
    expect(rates).toEqual([...rates].sort((a, b) => b - a))
  })

  it('reports the touchdown with the engine off', () => {
    expect(descentTelemetry(TOUCHDOWN_SECONDS)).toEqual({
      altitudeM: 0,
      descentRateMs: 0,
      thrust: 0,
      touchedDown: true,
    })
    expect(descentTelemetry(2).touchedDown).toBe(false)
  })
})
