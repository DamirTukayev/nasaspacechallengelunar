// Draft API contract — see docs/mvp-plan.md. Keep in sync with the backend.

export interface HealthResponse {
  status: string
  version: string
}

export type SiteGroup = 'Apollo' | 'CLPS' | 'International' | 'South Pole'

/** Planetocentric Mean Earth/Polar Axis coordinates, east-positive longitude. */
export interface Site {
  id: string
  name: string
  group: SiteGroup
  lat: number
  lon: number
  /** Elevation relative to the 1737.4 km sphere; null until filled from LOLA. */
  alt_m: number | null
  /** ISO date (UTC), null for sites without a landing. */
  landing_date: string | null
  description: string
  /** URL of the coordinate source. */
  source: string
}

/** Columnar series: index i of every array refers to times[i] (ISO, UTC). */
export interface AzElTrack {
  /** Degrees, clockwise from north. */
  azimuth: number[]
  /** Degrees above the smooth sphere's horizon. */
  elevation: number[]
}

export interface EphemerisResponse {
  times: string[]
  sun: AzElTrack
  earth: AzElTrack
  step_minutes: number
}

export interface ScenarioRequest {
  lat: number
  lon: number
  /** Taken from the DEM when omitted. */
  alt_m?: number
  /** Eye/panel height above the ground, meters (default 2). */
  observer_height_m?: number
  /** ISO datetime; treated as UTC when no offset is given. */
  start: string
  end: string
  step_minutes?: number
  /** Earth counts as visible when its center is this far above the skyline. */
  min_earth_elevation_deg?: number
}

export interface Window {
  start: string
  end: string
  duration_hours: number
  starts_before_range: boolean
  ends_after_range: boolean
}

export type Verdict = 'green' | 'yellow' | 'red'

/** lunar_day: works through one stretch of daylight (as CLPS landers do).
 *  survive_night: has to keep going through the lunar night. */
export type Mission = 'lunar_day' | 'survive_night'

export interface MissionVerdict {
  verdict: Verdict
  reasons: string[]
}

export type HorizonKind = 'sphere' | 'terrain'

export interface HorizonResponse {
  kind: HorizonKind
  /** Degrees from north, clockwise (0, 0.5, … 359.5). */
  azimuths: number[]
  /** Skyline elevation at each azimuth; negative on peaks. */
  elevations: number[]
  /** Terrain height at the site relative to 1737.4 km; null without terrain. */
  site_alt_m: number | null
  observer_height_m: number
  dem: string | null
  /** Where each azimuth's ray meets the skyline (same order as azimuths); null on a sphere. */
  hits?: {
    distance_m: (number | null)[]
    /** Relative to the 1737.4 km sphere, like site_alt_m. */
    height_m: (number | null)[]
    lat: (number | null)[]
    lon: (number | null)[]
  } | null
  /** Rays traced (one per azimuth). */
  rays?: number
  /** Terrain points evaluated for the skyline; null on a sphere. */
  terrain_samples?: number | null
}

export interface AnalyzeResponse {
  horizon_kind: HorizonKind
  site_alt_m: number | null
  series: {
    times: string[]
    sun: AzElTrack & { skyline: number[]; visible_fraction: number[] }
    earth: AzElTrack & { skyline: number[]; visible: boolean[] }
  }
  windows: { sun: Window[]; earth: Window[]; both: Window[] }
  metrics: {
    sunlit_pct: number
    earth_visible_pct: number
    both_pct: number
    mean_sun_disk_fraction: number
    max_sun_el: number
    mean_sun_el_sunlit: number | null
    next_sunrise: string | null
    next_sunset: string | null
    next_earthrise: string | null
    next_earthset: string | null
    longest_dark_hours: number
    longest_no_earth_hours: number
    /** Longest stretch with both the Sun and the Earth in view. Absent from older backends. */
    longest_both_hours?: number
    /** Same as mission_verdicts.survive_night. */
    verdict: Verdict
    verdict_reasons: string[]
    /** One verdict per kind of mission. Absent from older backends. */
    mission_verdicts?: Partial<Record<Mission, MissionVerdict>>
  }
}

export interface TerrainResponse {
  valid?: boolean[] | null
  lat?: number | null
  lon?: number | null
  source_resolution_m?: number | null
  kind: HorizonKind
  /** Grid is size × size nodes. */
  size: number
  /** The grid spans ±half_extent_m east and north of the site. */
  half_extent_m: number
  /** Row-major heights above the site's ground plane (m); row 0 = north, column 0 = west. */
  heights: number[]
  site_alt_m: number | null
  dem: string | null
}

export interface NearbyRequest extends ScenarioRequest {
  /** The grid reaches this far east/west/north/south of the site. */
  half_extent_km?: number
  /** Spacing between grid nodes. */
  step_km?: number
  /** Also return when the Sun and the Earth are visible from each node. */
  include_timelines?: boolean
}

/**
 * Per node, base64 of one bit per time sample (packed big-endian, 8 per byte):
 * 1 where the body is visible from that node. null where the node is off the DEM.
 */
export interface NearbyTimelines {
  samples: number
  sun: (string | null)[]
  earth: (string | null)[]
}

export interface NearbySpot {
  lat: number
  lon: number
  site_alt_m: number
  sunlit_pct: number
  earth_visible_pct: number
  both_pct: number
  longest_dark_hours: number
  longest_no_earth_hours: number
  verdict: Verdict
}

/** Row-major grid: spots[row * east_m.length + col]; row 0 is the north edge. */
export interface NearbyResponse {
  center_lat: number
  center_lon: number
  /** Column offsets from the centre, west → east, meters. */
  east_m: number[]
  /** Row offsets from the centre, north → south, meters. */
  north_m: number[]
  /** null where the node is off the terrain model. */
  spots: (NearbySpot | null)[]
  best_index: number | null
  dem: string
  azimuth_step_deg: number
  /** Only with include_timelines. */
  timelines?: NearbyTimelines | null
}

/** `start`–`end` is the mission for the first landing date; later dates shift it by whole days. */
export interface CalendarRequest extends ScenarioRequest {
  /** Landing dates to try, one per day. */
  days?: number
}

/** One landing date: the mission that starts at `start` and runs to `end`. */
export interface CalendarDay {
  start: string
  end: string
  sunlit_pct: number
  earth_visible_pct: number
  both_pct: number
  longest_dark_hours: number
  longest_no_earth_hours: number
  longest_both_hours: number
  /** Unbroken time with both Sun and Earth from the landing moment; 0 if either is missing. */
  both_from_start_hours: number
  /** That stretch is still open when the mission ends. */
  both_outlasts_mission: boolean
  sunlit_at_start: boolean
  earth_at_start: boolean
  verdicts: Record<Mission, Verdict>
}

export interface CalendarResponse {
  horizon_kind: HorizonKind
  site_alt_m: number | null
  /** Length of the mission analysed for every date. */
  mission_hours: number
  step_minutes: number
  /** Consecutive landing dates, one day apart. */
  days: CalendarDay[]
}
