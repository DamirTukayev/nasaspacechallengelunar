import type { Vec3 } from './math'

/** Distance at which the Sun and Earth are drawn, km; beyond the terrain, inside the stars. */
const SKY_DISTANCE = 140
/** Real apparent radii are tiny (0.27° Sun, 0.95° Earth); both are enlarged for visibility. */
const SUN_RADIUS = SKY_DISTANCE * Math.tan((0.27 * 3 * Math.PI) / 180)
const EARTH_RADIUS = SKY_DISTANCE * Math.tan((0.95 * 2.5 * Math.PI) / 180)

const at = (dir: Vec3): Vec3 => [
  dir[0] * SKY_DISTANCE,
  dir[1] * SKY_DISTANCE,
  dir[2] * SKY_DISTANCE,
]

export function SunDisc({ direction }: { direction: Vec3 }) {
  return (
    <group position={at(direction)}>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 24, 16]} />
        <meshBasicMaterial color={[4, 3.7, 2.8]} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 2.4, 24, 16]} />
        <meshBasicMaterial color="#f5c542" transparent opacity={0.12} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** The Earth, lit by the same sunlight as the terrain, so its phase comes out right. */
export function EarthGlobe({ direction }: { direction: Vec3 }) {
  return (
    <mesh position={at(direction)}>
      <sphereGeometry args={[EARTH_RADIUS, 32, 24]} />
      <meshStandardMaterial
        color="#4f86d9"
        emissive="#0b1f3d"
        emissiveIntensity={0.35}
        roughness={0.7}
      />
    </mesh>
  )
}
