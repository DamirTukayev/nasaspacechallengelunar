/** Visible simulation time. Hidden-tab gaps are discarded without restarting the mission. */
export class RenderTiming {
  elapsed = 0
  private previous: number | null = null

  advance(timestamp: number, fps: number): { elapsed: number; delta: number } | null {
    const milliseconds = this.previous === null ? 0 : Math.max(0, timestamp - this.previous)
    if (this.previous !== null && milliseconds < 1000 / fps - 0.5) return null
    const delta = milliseconds / 1000
    this.previous = timestamp
    this.elapsed += delta
    return { elapsed: this.elapsed, delta }
  }

  resetGap(): void {
    this.previous = null
  }
}

/** Samples active rendering only; intentional idle caps must not lower automatic quality. */
export class ActiveFrameMeter {
  private warmup = 0
  private elapsed = 0
  private frames = 0
  private squares = 0

  sample(delta: number): { fps: number; variation: number } | null {
    if (!Number.isFinite(delta) || delta <= 0) {
      this.reset()
      return null
    }
    this.warmup += delta
    if (this.warmup < 2) return null
    this.elapsed += delta
    this.frames++
    this.squares += delta * delta
    if (this.elapsed < 2) return null
    const mean = this.elapsed / this.frames
    const result = {
      fps: this.frames / this.elapsed,
      variation: Math.sqrt(Math.max(0, this.squares / this.frames - mean * mean)) / mean,
    }
    this.elapsed = this.frames = this.squares = 0
    return result
  }

  reset(): void {
    this.warmup = this.elapsed = this.frames = this.squares = 0
  }
}
