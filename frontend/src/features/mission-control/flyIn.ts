export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Whether a scene opens with the flight from the whole Moon down to the site.
 *
 * - never with reduced motion;
 * - always at the start of the automatic show, so a recording is complete;
 * - otherwise once per opening of Mission Control.
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
