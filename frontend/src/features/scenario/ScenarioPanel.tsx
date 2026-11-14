import { type ReactNode, useMemo } from 'react'
import { MissionSwitch } from '../mission/MissionSwitch'
import { useSites } from '../../api/queries'
import type { Site, SiteGroup } from '../../api/types'
import { fromUtcInput, toUtcInput } from '../../lib/time'
import {
  CUSTOM_SITE,
  DURATION_PRESETS,
  STEP_OPTIONS,
  type DraftErrors,
  type ScenarioDraft,
  draftFromSite,
  pointCount,
  suggestStep,
} from './scenario'

const GROUP_ORDER: SiteGroup[] = ['South Pole', 'CLPS', 'International', 'Apollo']

interface Props {
  draft: ScenarioDraft
  errors: DraftErrors
  canSubmit: boolean
  /** Why the scenario cannot be added to the comparison, or null if it can. */
  compareBlockedReason: string | null
  onChange: (draft: ScenarioDraft) => void
  onSubmit: () => void
  onCompare: () => void
}

function groupSites(sites: Site[]): [SiteGroup, Site[]][] {
  return GROUP_ORDER.map((group): [SiteGroup, Site[]] => [
    group,
    sites.filter((s) => s.group === group),
  ]).filter(([, list]) => list.length > 0)
}

/** Sets the end `ms` after the start (or after now) and coarsens the step if needed. */
function withDuration(draft: ScenarioDraft, start: Date | null, ms: number): ScenarioDraft {
  const from = start ?? new Date()
  const to = new Date(from.getTime() + ms)
  return {
    ...draft,
    start: toUtcInput(from),
    end: toUtcInput(to),
    stepMinutes: Math.max(draft.stepMinutes, suggestStep(from, to)),
  }
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  )
}

export function ScenarioPanel({
  draft,
  errors,
  canSubmit,
  compareBlockedReason,
  onChange,
  onSubmit,
  onCompare,
}: Props) {
  const sites = useSites()
  const grouped = useMemo(() => groupSites(sites.data ?? []), [sites.data])
  const selectedSite = sites.data?.find((s) => s.id === draft.siteId)

  const start = fromUtcInput(draft.start)
  const end = fromUtcInput(draft.end)
  const points = start && end && end > start ? pointCount(start, end, draft.stepMinutes) : null

  function selectSite(id: string) {
    const site = sites.data?.find((s) => s.id === id)
    onChange(site ? draftFromSite(draft, site) : { ...draft, siteId: CUSTOM_SITE, name: '' })
  }

  // Typing coordinates by hand turns the scenario into a custom site.
  function editCoordinate(field: 'lat' | 'lon', value: string) {
    onChange({ ...draft, [field]: value, siteId: CUSTOM_SITE, name: '' })
  }

  function applyDuration(ms: number) {
    onChange(withDuration(draft, start, ms))
  }

  return (
    <form
      className="panel scenario-panel"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) onSubmit()
      }}
    >
      <h2>Scenario</h2>

      <MissionSwitch />

      <Field
        label="Landing site"
        htmlFor="site"
        hint={selectedSite?.description}
        error={sites.isError ? `Could not load sites: ${sites.error.message}` : undefined}
      >
        <select
          id="site"
          value={draft.siteId}
          onChange={(e) => selectSite(e.target.value)}
          disabled={sites.isPending}
        >
          {grouped.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM_SITE}>Custom coordinates…</option>
        </select>
      </Field>

      <div className="field-row">
        <Field label="Latitude, °" htmlFor="lat" error={errors.lat}>
          <input
            id="lat"
            inputMode="decimal"
            value={draft.lat}
            onChange={(e) => editCoordinate('lat', e.target.value)}
            aria-invalid={!!errors.lat}
          />
        </Field>
        <Field label="East longitude, °" htmlFor="lon" error={errors.lon}>
          <input
            id="lon"
            inputMode="decimal"
            value={draft.lon}
            onChange={(e) => editCoordinate('lon', e.target.value)}
            aria-invalid={!!errors.lon}
          />
        </Field>
      </div>

      <div className="field-stack">
        <Field label="Start (UTC)" htmlFor="start" error={errors.start}>
          <input
            id="start"
            type="datetime-local"
            value={draft.start}
            onChange={(e) => onChange({ ...draft, start: e.target.value })}
            aria-invalid={!!errors.start}
          />
        </Field>
        <Field label="End (UTC)" htmlFor="end" error={errors.end}>
          <input
            id="end"
            type="datetime-local"
            value={draft.end}
            onChange={(e) => onChange({ ...draft, end: e.target.value })}
            aria-invalid={!!errors.end}
          />
        </Field>
      </div>

      <div className="presets" role="group" aria-label="Duration from start">
        {DURATION_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="chip-button"
            onClick={() => applyDuration(preset.ms)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <Field
        label="Time step"
        htmlFor="step"
        error={errors.step}
        hint={points ? `${points.toLocaleString()} points` : undefined}
      >
        <select
          id="step"
          value={draft.stepMinutes}
          onChange={(e) => onChange({ ...draft, stepMinutes: Number(e.target.value) })}
        >
          {STEP_OPTIONS.map((o) => (
            <option key={o.minutes} value={o.minutes}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="actions">
        <button type="submit" className="primary" disabled={!canSubmit}>
          Analyze
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!canSubmit || compareBlockedReason !== null}
          title={compareBlockedReason ?? 'Analyze and keep for side-by-side comparison'}
          onClick={onCompare}
        >
          + Compare
        </button>
      </div>
    </form>
  )
}
