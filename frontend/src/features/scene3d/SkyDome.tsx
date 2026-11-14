import { prefersReducedMotion } from '../mission-control/flyIn'
import { trackIndices } from './skyPaths'
import { Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { type ComponentRef, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, type MeshBasicMaterial, Vector3 } from 'three'
import { SKY_DISTANCE } from './SkyBodies'
import {
  ARC_COLORS,
  CAMERA_RETURN_SECONDS,
  DOME_OPACITY,
  DOME_TOTAL_SECONDS,
  arcOf,
  arcSamplesDrawn,
  domeFade,
  skyCameraBlend,
  skyFocus,
  skyViewpoint,
} from './dome'

export interface SkyTrack {
  sun: { azimuth: number[]; elevation: number[]; visible: boolean[] }
  earth: { azimuth: number[]; elevation: number[]; visible: boolean[] }
}

export interface SkyControl {
  visible?: boolean
  track: SkyTrack
  /** Bump to run the sequence; 0 hides the dome. */
  runId: number
  onDone: () => void
}

type LineRef = ComponentRef<typeof Line>

/** The orbit controls' target: kept on what the camera looks at, so orbiting continues from there. */
export type ControlsRef = RefObject<{ target: Vector3 } | null>

/** Altitude rings for scale: the horizontal, then 10° and 30° above it. */
const RINGS_DEG = [0, 10, 30]

function ring(elDeg: number): [number, number, number][] {
  const el = (elDeg * Math.PI) / 180
  const r = SKY_DISTANCE * Math.cos(el)
  const y = SKY_DISTANCE * Math.sin(el)
  return Array.from({ length: 121 }, (_, i) => {
    const a = (i / 120) * 2 * Math.PI
    return [r * Math.sin(a), y, -r * Math.cos(a)]
  })
}

/**
 * The sky over the site (W5): a faint dome and the paths of the Sun and the Earth over the
 * whole period, drawn sample by sample from the same series as the verdict. Bright where the
 * analysis sees the body, dim where the terrain hides it.
 */
export function SkyDome({
  track,
  visible = true,
  maxPoints = 2048,
  runId,
  onDone,
  controls,
  onSkyView,
}: SkyControl & {
  maxPoints?: number
  controls?: ControlsRef
  /** Told when the camera turns to the sky and back, e.g. to hide what blocks the view. */
  onSkyView?: (on: boolean) => void
}) {
  const [reducedMotion] = useState(prefersReducedMotion)
  const selected = useMemo(() => {
    const select = (body: SkyTrack['sun']) => {
      const indices = trackIndices(body.azimuth.length, maxPoints)
      return {
        azimuth: indices.map((i) => body.azimuth[i]),
        elevation: indices.map((i) => body.elevation[i]),
        visible: indices.map((i) => body.visible[i]),
      }
    }
    return { sun: select(track.sun), earth: select(track.earth) }
  }, [track, maxPoints])
  const camera = useThree((s) => s.camera)
  const sun = useMemo(
    () =>
      arcOf(
        selected.sun.azimuth,
        selected.sun.elevation,
        selected.sun.visible,
        SKY_DISTANCE,
        ARC_COLORS.sun,
      ),
    [selected.sun],
  )
  const earth = useMemo(
    () =>
      arcOf(
        selected.earth.azimuth,
        selected.earth.elevation,
        selected.earth.visible,
        SKY_DISTANCE,
        ARC_COLORS.earth,
      ),
    [selected.earth],
  )
  const rings = useMemo(() => RINGS_DEG.map(ring), [])
  const view = useMemo(() => {
    const v = skyViewpoint(skyFocus(track.earth, track.sun), SKY_DISTANCE)
    return { position: new Vector3(...v.position), target: new Vector3(...v.target) }
  }, [track])
  // Where the camera was when the sequence started: it goes back there afterwards.
  const from = useRef<{ position: Vector3; target: Vector3 } | null>(null)
  const settled = useRef(false)
  const skyView = useRef(false)

  const domeMaterial = useRef<MeshBasicMaterial>(null)
  const sunLine = useRef<LineRef>(null)
  const earthLine = useRef<LineRef>(null)
  const startedAt = useRef<number | null>(null)
  const finished = useRef(false)

  // Restarting (a replayed landing) puts back whatever the sky view hid.
  const onSkyViewRef = useRef(onSkyView)
  useEffect(() => {
    onSkyViewRef.current = onSkyView
  })
  useEffect(() => {
    startedAt.current = null
    finished.current = false
    settled.current = false
    from.current = null
    if (skyView.current) {
      skyView.current = false
      onSkyViewRef.current?.(false)
    }
  }, [runId, track])

  // Keep the latest callback without restarting the sequence when the parent re-renders.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useFrame(({ clock }) => {
    if (runId === 0 || settled.current) return
    if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const t =
      reducedMotion || !visible
        ? DOME_TOTAL_SECONDS + CAMERA_RETURN_SECONDS
        : clock.elapsedTime - startedAt.current

    // The camera turns to the sky, holds, then returns to where it was.
    if (from.current === null) {
      from.current = {
        position: camera.position.clone(),
        target: controls?.current?.target.clone() ?? new Vector3(0, 0, 0),
      }
    }
    const b = skyCameraBlend(t)
    const look = from.current.target.clone().lerp(view.target, b)
    camera.position.copy(from.current.position).lerp(view.position, b)
    camera.lookAt(look)
    controls?.current?.target.copy(look)
    const turned = b > 0.05
    if (turned !== skyView.current) {
      skyView.current = turned
      onSkyViewRef.current?.(turned)
    }
    if (t >= DOME_TOTAL_SECONDS + CAMERA_RETURN_SECONDS) settled.current = true
    if (finished.current) return

    if (domeMaterial.current) domeMaterial.current.opacity = DOME_OPACITY * domeFade(t)
    for (const [line, n] of [
      [sunLine.current, sun.points.length],
      [earthLine.current, earth.points.length],
    ] as const) {
      // A line of n points has n − 1 segments, one instance each.
      if (line) line.geometry.instanceCount = Math.max(arcSamplesDrawn(t, n) - 1, 0)
    }

    if (t >= DOME_TOTAL_SECONDS) {
      finished.current = true
      for (const line of [sunLine.current, earthLine.current]) {
        if (line) line.geometry.instanceCount = Infinity
      }
      onDoneRef.current()
    }
  })

  if (runId === 0) return null

  return (
    <group visible={visible}>
      <mesh renderOrder={-1}>
        {/* Upper half only: below the horizontal is the Moon. */}
        <sphereGeometry args={[SKY_DISTANCE, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial
          ref={domeMaterial}
          color="#9fc2ff"
          side={BackSide}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {rings.map((points, i) => (
        <Line
          key={RINGS_DEG[i]}
          points={points}
          color="#9fc2ff"
          lineWidth={1}
          transparent
          opacity={i === 0 ? 0.35 : 0.16}
          depthWrite={false}
        />
      ))}
      {sun.points.length > 1 && (
        <Line
          ref={sunLine}
          points={sun.points}
          vertexColors={sun.colors}
          lineWidth={2.5}
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
        />
      )}
      {earth.points.length > 1 && (
        <Line
          ref={earthLine}
          points={earth.points}
          vertexColors={earth.colors}
          lineWidth={2.5}
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
        />
      )}
    </group>
  )
}
