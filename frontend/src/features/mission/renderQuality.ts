import { deviceQuality, type Quality } from '../scene3d/quality'

export const LANDING_QUALITY = {
  high: { dpr: 2, shadowSize: 2048, globeSegments: 192, earthSegments: 48, stars: 5000 },
  balanced: { dpr: 1.25, shadowSize: 1024, globeSegments: 128, earthSegments: 32, stars: 1600 },
  low: { dpr: 0.85, shadowSize: 0, globeSegments: 64, earthSegments: 24, stars: 500 },
} as const

/** Start conservatively; the existing controller can reduce load during active playback. */
export function initialLandingQuality(): Quality {
  return deviceQuality() === 'low' ? 'low' : 'balanced'
}

export function landingPixelRatio(deviceDpr: number, quality: Quality): number {
  return Math.min(deviceDpr, LANDING_QUALITY[quality].dpr)
}
