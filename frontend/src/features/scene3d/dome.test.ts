import { describe, expect, it } from 'vitest'
import {
  ARC_COLORS,
  ARC_DRAW_SECONDS,
  DOME_FADE_SECONDS,
  DOME_TOTAL_SECONDS,
  arcOf,
  arcSamplesDrawn,
  CAMERA_RETURN_SECONDS,
  domeFade,
  skyCameraBlend,
  skyFocus,
  skyViewpoint,
} from './dome'

const R = 140

describe('arcOf', () => {
  it('puts every sample on the sphere, north = −z, east = +x, up = +y', () => {
    const arc = arcOf([0, 90, 180], [0, 0, 90], [true, true, true], R, ARC_COLORS.sun)

    const [north, east, zenith] = arc.points
    expect(north[2]).toBeCloseTo(-R)
    expect(east[0]).toBeCloseTo(R)
    expect(zenith[1]).toBeCloseTo(R)
    for (const p of arc.points) expect(Math.hypot(...p)).toBeCloseTo(R)
  })

  it('colours each sample by what the analysis says, not by bare elevation', () => {
    // Above the horizontal but behind a ridge, then visible again.
    const arc = arcOf([170, 180, 190], [1.5, 1.5, 1.5], [true, false, true], R, ARC_COLORS.sun)
    expect(arc.colors).toEqual([
      ARC_COLORS.sun.visible,
      ARC_COLORS.sun.hidden,
      ARC_COLORS.sun.visible,
    ])
  })

  it('keeps the Earth’s small libration loop small: a few degrees around north', () => {
    // A month of Earth positions from a polar site wobbles a few degrees around one point.
    const az = Array.from({ length: 60 }, (_, i) => 3 * Math.sin((i / 60) * 2 * Math.PI))
    const el = Array.from({ length: 60 }, (_, i) => 5 * Math.sin((i / 60) * 4 * Math.PI))
    const arc = arcOf(
      az,
      el,
      el.map((e) => e > 0),
      R,
      ARC_COLORS.earth,
    )

    const spanX =
      Math.max(...arc.points.map((p) => p[0])) - Math.min(...arc.points.map((p) => p[0]))
    // 6° of azimuth on a 140 km sphere ≈ 14.7 km across.
    expect(spanX).toBeCloseTo(2 * R * Math.sin((3 * Math.PI) / 180), 0)
  })
})

describe('dome timing', () => {
  it('fades the dome in first, then draws the arcs, then holds', () => {
    expect(domeFade(0)).toBe(0)
    expect(domeFade(DOME_FADE_SECONDS)).toBe(1)
    expect(arcSamplesDrawn(DOME_FADE_SECONDS / 2, 709)).toBe(0)
    expect(arcSamplesDrawn(DOME_FADE_SECONDS + ARC_DRAW_SECONDS, 709)).toBe(709)
    expect(DOME_TOTAL_SECONDS).toBeGreaterThan(DOME_FADE_SECONDS + ARC_DRAW_SECONDS)
  })

  it('draws more of the arc as time goes on, never past the end', () => {
    let previous = 0
    for (let t = 0; t <= DOME_TOTAL_SECONDS + 1; t += 0.1) {
      const n = arcSamplesDrawn(t, 709)
      expect(n).toBeGreaterThanOrEqual(previous)
      expect(n).toBeLessThanOrEqual(709)
      previous = n
    }
    expect(arcSamplesDrawn(10, 0)).toBe(0)
  })
})

describe('sky camera', () => {
  it('turns to the sky, holds while the arcs draw, then goes back', () => {
    expect(skyCameraBlend(0)).toBe(0)
    expect(skyCameraBlend(DOME_FADE_SECONDS)).toBe(1)
    expect(skyCameraBlend(DOME_FADE_SECONDS + ARC_DRAW_SECONDS)).toBe(1)
    expect(skyCameraBlend(DOME_TOTAL_SECONDS + CAMERA_RETURN_SECONDS)).toBe(0)
  })

  it('aims at the Earth’s mean position, across north without averaging to south', () => {
    // Azimuths straddling north: 350° and 10° must average to 0°, not 180°.
    const focus = skyFocus(
      { azimuth: [350, 10, 355, 5], elevation: [2, 4, -2, 0] },
      { azimuth: [90], elevation: [1] },
    )
    expect(Math.min(focus.az, 360 - focus.az)).toBeCloseTo(0, 6)
    expect(focus.el).toBeCloseTo(1 + 4)
  })

  it('falls back to the Sun when there are no Earth samples', () => {
    expect(skyFocus({ azimuth: [], elevation: [] }, { azimuth: [90], elevation: [10] }).az).toBe(90)
  })

  it('stands behind the lander and looks out over it at the focus', () => {
    const { position, target } = skyViewpoint({ az: 0, el: 5 }, R)
    // Looking north (−z): the camera is south of the lander (+z), the target far to the north.
    expect(position[2]).toBeGreaterThan(0)
    expect(target[2]).toBeLessThan(-100)
    expect(target[1]).toBeCloseTo(R * Math.sin((5 * Math.PI) / 180))
  })
})
