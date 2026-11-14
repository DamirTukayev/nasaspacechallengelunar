// All times in the app are UTC. <input type="datetime-local"> has no zone, so its value
// ("YYYY-MM-DDTHH:mm") is always read and written as UTC here.

export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS
/** Synodic month: sunrise to sunrise at a given spot on the Moon. */
export const LUNAR_DAY_MS = 29.530589 * DAY_MS

export function toUtcInput(date: Date): string {
  return date.toISOString().slice(0, 16)
}

/** Returns null for an empty or malformed value. */
export function fromUtcInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function formatUtc(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function formatDuration(hours: number): string {
  // Shorter than a minute is effectively "never happened" for these metrics.
  if (hours < 1 / 60) return 'None'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} d`
}
