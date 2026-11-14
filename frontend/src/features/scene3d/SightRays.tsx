import { SceneLabel } from './SceneLabel'
import { Line } from '@react-three/drei'
import type { Vec3 } from './math'
import { type Sight, describeSight } from './sight'

/** Rays leave from the top of the (enlarged) lander, near its antenna. */
const ORIGIN: Vec3 = [0, 0.18, 0]
/** How far a clear ray is drawn towards the sky, km. */
const SKY_RAY_KM = 60
/** How far the dashed "would continue" part is drawn past a blocking ridge, km. */
const PAST_RIDGE_KM = 25

const COLORS = {
  sun: '#f5c542',
  earth: '#6ea8ff',
  blocked: '#ff6b6b',
} as const

const along = (from: Vec3, dir: Vec3, km: number): Vec3 => [
  from[0] + dir[0] * km,
  from[1] + dir[1] * km,
  from[2] + dir[2] * km,
]

function Ray({ body, sight }: { body: 'sun' | 'earth'; sight: Sight }) {
  if (sight.kind === 'below') return null

  if (sight.kind === 'visible') {
    return (
      <Line
        points={[ORIGIN, along(ORIGIN, sight.direction, SKY_RAY_KM)]}
        color={COLORS[body]}
        lineWidth={2.5}
        transparent
        opacity={0.85}
        toneMapped={false}
      />
    )
  }

  // Blocked: a red ray to the ridge, a marker there, and a faint continuation to the body.
  const ridge = sight.blocker?.position ?? along(ORIGIN, sight.direction, 3)
  const markerRadius = Math.max(0.04, (sight.blocker?.distanceKm ?? 3) * 0.012)
  return (
    <group>
      <Line
        points={[ORIGIN, ridge]}
        color={COLORS.blocked}
        lineWidth={2.5}
        transparent
        opacity={0.9}
        toneMapped={false}
      />
      <Line
        points={[ridge, along(ridge, sight.direction, PAST_RIDGE_KM)]}
        color={COLORS[body]}
        lineWidth={1.5}
        dashed
        dashSize={0.6}
        gapSize={0.5}
        transparent
        opacity={0.45}
        toneMapped={false}
      />
      <mesh position={ridge}>
        <sphereGeometry args={[markerRadius, 16, 12]} />
        <meshBasicMaterial color={COLORS.blocked} toneMapped={false} />
      </mesh>
      <SceneLabel
        position={ridge}
        className="sight-label"
        text={`${body === 'sun' ? '☀' : '◉'} ${describeSight(sight)}`}
      />
    </group>
  )
}

/** Lines of sight from the lander to the Sun and the Earth, stopping on terrain that hides them. */
export function SightRays({ sun, earth }: { sun: Sight; earth: Sight }) {
  return (
    <>
      <Ray body="sun" sight={sun} />
      <Ray body="earth" sight={earth} />
    </>
  )
}
