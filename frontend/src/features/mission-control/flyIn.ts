export const INTRO_SEEN_KEY = 'lunar-site-planner:intro-seen'

export function readIntroSeen(): boolean {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function storeIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {
    // Not remembered: the flight plays again on the next visit, nothing worse.
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Whether a scene opens with the flight from the whole Moon down to the site.
 *
 * - never with reduced motion;
 * - always at the start of the automatic show, so a recording is complete;
 * - otherwise once per browser: the first time Mission Control opens a site.
 */
export function shouldFlyIn({
  reducedMotion,
  seen,
  demoStep,
}: {
  reducedMotion: boolean
  seen: boolean
  /** Scene of the automatic show, null outside it. */
  demoStep: number | null
}): boolean {
  if (reducedMotion) return false
  if (demoStep !== null) return demoStep === 0
  return !seen
}
