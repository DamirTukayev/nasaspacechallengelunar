export type Quality = 'high' | 'balanced' | 'low'
export type QualityChoice = 'auto' | Quality
export const QUALITY = {
  high: {
    dpr: 1.75,
    shadowSize: 2048,
    stars: 1600,
    rayStride: 1,
    terrainStride: 1,
    pathPoints: 2048,
    globeSegments: 128,
    bloom: true,
  },
  balanced: {
    dpr: 1.25,
    shadowSize: 1024,
    stars: 800,
    rayStride: 2,
    terrainStride: 2,
    pathPoints: 1024,
    globeSegments: 96,
    bloom: false,
  },
  low: {
    dpr: 0.85,
    shadowSize: 0,
    stars: 300,
    rayStride: 4,
    terrainStride: 4,
    pathPoints: 512,
    globeSegments: 48,
    bloom: false,
  },
} as const

export function initialQuality(hints: {
  coarse: boolean
  cores: number
  memory?: number
}): Quality {
  if (hints.coarse || hints.cores <= 4 || (hints.memory !== undefined && hints.memory <= 4))
    return 'low'
  return 'high'
}
export function deviceQuality(): Quality {
  return initialQuality({
    coarse: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    cores: navigator.hardwareConcurrency || 8,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  })
}
/** Reduce one step after the controller confirms sustained low performance. */
export function lowerQuality(quality: Quality, fps: number): Quality {
  if (fps >= 50) return quality
  return quality === 'high' ? 'balanced' : 'low'
}

export interface AutoQualityState {
  quality: Quality
  slow: number
  settle?: boolean
  cap?: number
  probe?: { original: Quality; baseline: number; skip: boolean; samples: number[] }
}

/** Compare two settled windows after reducing load; cadence alone cannot identify a cap. */
export function advanceQuality(
  state: AutoQualityState,
  fps: number,
  variation: number,
): AutoQualityState {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(variation)) return state
  if (state.settle) return { ...state, settle: false }
  const steady = variation <= 0.15
  if (state.probe) {
    const probe = state.probe
    if (probe.skip) return { ...state, probe: { ...probe, skip: false } }
    const samples = [...probe.samples, fps]
    if (!steady || fps < 27) return { quality: state.quality, slow: 0 }
    if (samples.length < 2) return { ...state, probe: { ...probe, samples } }
    const measured = samples.reduce((sum, value) => sum + value, 0) / samples.length
    if (measured >= probe.baseline * 1.15) return { quality: state.quality, slow: 0 }
    return { quality: probe.original, slow: 0, cap: probe.baseline, settle: true }
  }
  // Reassess when cadence changes; a remembered cap must not mask a later slowdown.
  if (state.cap && steady && Math.abs(fps - state.cap) <= state.cap * 0.1)
    return { ...state, slow: 0 }
  if (fps >= 50) return { quality: state.quality, slow: 0 }
  const slow = state.slow + 1
  if (slow < 2) return { quality: state.quality, slow }
  const next = lowerQuality(state.quality, fps)
  if (next === state.quality) return { quality: next, slow: 0 }
  if (!steady || fps < 27) return { quality: next, slow: 0 }
  return {
    quality: next,
    slow: 0,
    probe: { original: state.quality, baseline: fps, skip: true, samples: [] },
  }
}
