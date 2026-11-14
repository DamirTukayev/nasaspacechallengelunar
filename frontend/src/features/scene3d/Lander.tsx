import { type RefObject, useMemo } from 'react'
import { type Group, type Mesh, Quaternion, Vector3 } from 'three'
import { type Vec3 } from './math'

/** How much the lander is enlarged so it can be seen in a 40 km scene. */
export const LANDER_SCALE = 60

interface Props {
  /** Moved by the descent animation (its y is the height above the ground, km). */
  bodyRef: RefObject<Group | null>
  /** Scaled by the descent animation; hidden when the engine is off. */
  plumeRef: RefObject<Mesh | null>
  /** Unit vector towards the Sun: the solar panel turns to face its azimuth. */
  sunDirection: Vec3
  /** Unit vector towards the Earth: the antenna points at it. */
  earthDirection: Vec3
}

const LEG_ANGLES = [45, 135, 225, 315].map((d) => (d * Math.PI) / 180)

/**
 * A generic four-legged lander, about 4 m tall in reality (before LANDER_SCALE).
 * Built from metres, then scaled to km.
 */
export function Lander({ bodyRef, plumeRef, sunDirection, earthDirection }: Props) {
  // The panel only rotates about the vertical axis, towards the Sun's azimuth.
  const panelYaw = Math.atan2(sunDirection[0], sunDirection[2])

  const antennaRotation = useMemo(() => {
    const q = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      new Vector3(...earthDirection).normalize(),
    )
    return q
  }, [earthDirection])

  return (
    <group ref={bodyRef} scale={LANDER_SCALE / 1000}>
      {/* Body */}
      <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.1, 1.3, 1.4, 8]} />
        <meshStandardMaterial color="#d8c27a" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.7, 1.0, 0.5, 8]} />
        <meshStandardMaterial color="#c9ccd4" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Legs and footpads */}
      {LEG_ANGLES.map((a) => {
        const x = Math.sin(a)
        const z = Math.cos(a)
        return (
          <group key={a}>
            <mesh
              position={[x * 1.55, 0.75, z * 1.55]}
              rotation={[z * 0.45, 0, -x * 0.45]}
              castShadow
            >
              <cylinderGeometry args={[0.07, 0.07, 1.8, 6]} />
              <meshStandardMaterial color="#9aa0aa" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[x * 1.95, 0.05, z * 1.95]} castShadow>
              <cylinderGeometry args={[0.28, 0.32, 0.1, 10]} />
              <meshStandardMaterial color="#9aa0aa" metalness={0.5} roughness={0.6} />
            </mesh>
          </group>
        )
      })}

      {/* Solar panel on a mast, turned to the Sun */}
      <group position={[0, 2.8, 0]} rotation={[0, panelYaw, 0]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.2, 6]} />
          <meshStandardMaterial color="#9aa0aa" />
        </mesh>
        <mesh position={[0, 1.4, 0.05]} castShadow>
          <boxGeometry args={[2.6, 1.3, 0.05]} />
          <meshStandardMaterial color="#1d3b7a" metalness={0.3} roughness={0.3} />
        </mesh>
      </group>

      {/* High-gain antenna pointed at the Earth */}
      <group position={[0.6, 2.8, -0.4]} quaternion={antennaRotation}>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.7, 6]} />
          <meshStandardMaterial color="#c9ccd4" />
        </mesh>
        <mesh position={[0, 0.75, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.45, 0.25, 16, 1, true]} />
          <meshStandardMaterial color="#e8eaee" side={2} />
        </mesh>
      </group>

      {/* Engine plume: a unit cone hanging below the body, scaled by thrust */}
      <mesh ref={plumeRef} position={[0, 0.9, 0]} visible={false}>
        <coneGeometry args={[0.55, 3, 16, 1, true]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.75} toneMapped={false} />
      </mesh>
    </group>
  )
}
