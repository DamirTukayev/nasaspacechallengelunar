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
/** Two sustained slow windows are required by the caller; no automatic oscillation upwards. */
export function lowerQuality(quality: Quality, fps: number): Quality {
  if (fps >= 50) return quality
  return quality === 'high' ? 'balanced' : 'low'
}

/** A steady 30 Hz cadence can be a browser power cap, not missed frames. */
export function slowFrameWindow(fps: number, variation: number): boolean {
  return fps < 27 || (fps < 50 && variation > 0.15)
}
