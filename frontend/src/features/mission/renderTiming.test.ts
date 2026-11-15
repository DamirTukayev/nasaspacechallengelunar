import { describe, expect, it } from 'vitest'
import { ActiveFrameMeter, RenderTiming } from './renderTiming'

describe('landing scene timing', () => {
  it('caps idle rendering without losing time between accepted frames', () => {
    const timing = new RenderTiming()
    expect(timing.advance(1000, 24)).toEqual({ elapsed: 0, delta: 0 })
    expect(timing.advance(1016, 24)).toBeNull()
    expect(timing.advance(1033, 24)).toBeNull()
    expect(timing.advance(1050, 24)).toEqual({ elapsed: 0.05, delta: 0.05 })
    expect(timing.advance(1066, 24)).toBeNull()
    expect(timing.advance(1100, 24)).toEqual({ elapsed: 0.1, delta: 0.05 })
  })

  it('discards hidden-tab and stopped-playback gaps while preserving mission time', () => {
    const timing = new RenderTiming()
    timing.advance(0, 60)
    timing.advance(1000, 60)
    timing.resetGap()
    expect(timing.advance(301000, 60)).toEqual({ elapsed: 1, delta: 0 })
    expect(timing.advance(302000, 60)).toEqual({ elapsed: 2, delta: 1 })
  })

  it('supports active 60 fps independently of the idle cap', () => {
    const timing = new RenderTiming()
    timing.advance(0, 24)
    expect(timing.advance(1000 / 60, 60)?.delta).toBeCloseTo(1 / 60)
  })
})

describe('active landing frame sampling', () => {
  it('ignores warmup and measures a stable active cadence', () => {
    const meter = new ActiveFrameMeter()
    for (let i = 0; i < 100; i++) expect(meter.sample(1 / 60)).toBeNull()
    let result = null
    for (let i = 0; i < 160 && !result; i++) result = meter.sample(1 / 60)
    expect(result?.fps).toBeCloseTo(60)
    expect(result?.variation).toBeLessThan(0.00001)
  })

  it('records severe visible stalls so automatic quality can reduce load', () => {
    const meter = new ActiveFrameMeter()
    meter.sample(1)
    expect(meter.sample(1)).toBeNull()
    expect(meter.sample(1)).toEqual({ fps: 1, variation: 0 })
  })

  it('starts a new warmup after suspension instead of sampling the hidden gap', () => {
    const meter = new ActiveFrameMeter()
    meter.sample(1)
    meter.sample(1)
    meter.reset()
    expect(meter.sample(1)).toBeNull()
    expect(meter.sample(1)).toBeNull()
    expect(meter.sample(1)).toEqual({ fps: 1, variation: 0 })
    expect(meter.sample(NaN)).toBeNull()
    expect(meter.sample(1)).toBeNull()
  })
})
