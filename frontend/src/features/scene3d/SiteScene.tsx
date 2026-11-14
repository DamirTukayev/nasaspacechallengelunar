import { OrbitControls, Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type ComponentRef, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import type { Group, Mesh } from 'three'
import { useTerrain } from '../../api/queries'
import type { HorizonResponse, TerrainResponse } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { LANDER_SCALE, Lander } from './Lander'
import { EarthGlobe, SunDisc } from './SkyBodies'
import { SightRays } from './SightRays'
import { SkylineFan } from './SkylineFan'
import { TerrainMesh } from './TerrainMesh'
import { type Vec3, azElToVector, descentFrame } from './math'
import { type Sight, sightOf } from './sight'

export interface BodyState {
  az: number
  el: number
  /** Visible from the site according to the full analysis (200 km skyline). */
  visible: boolean
  /** Skyline elevation in the body's direction, from the analysis. */
  skyline?: number
  /** Share of the solar disk above the skyline (the Sun only). */
  diskFraction?: number
}

interface Props {
  site: { lat: number; lon: number }
  sun: BodyState
  earth: BodyState
  horizon?: HorizonResponse
}

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

const OVERVIEW: Vec3 = [13, 9, 17]
const EXAGGERATIONS = [1, 2, 3]

/** Moves the camera and the lander through the landing, then hands over to the user. */
function DescentDirector({
  playId,
  hold,
  overview,
  bodyRef,
  plumeRef,
  controlsRef,
  onFinished,
}: {
  playId: number
  /** Wait at the top of the descent (something else is on screen). */
  hold: boolean
  overview: Vec3
  bodyRef: RefObject<Group | null>
  plumeRef: RefObject<Mesh | null>
  controlsRef: RefObject<OrbitControlsImpl | null>
  onFinished: () => void
}) {
  const camera = useThree((s) => s.camera)
  const startedAt = useRef<number | null>(null)
  const running = useRef(false)

  useEffect(() => {
    startedAt.current = null
    running.current = true
  }, [playId])

  useFrame(({ clock }) => {
    if (!running.current) return
    if (hold) startedAt.current = null
    else if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const frame = descentFrame(
      startedAt.current === null ? 0 : clock.elapsedTime - startedAt.current,
      overview,
    )

    bodyRef.current?.position.setY(frame.landerAltitude)
    const plume = plumeRef.current
    if (plume) {
      plume.visible = frame.thrust > 0.01
      plume.scale.setScalar(Math.max(frame.thrust, 0.001))
      plume.position.y = 0.9 - 1.5 * frame.thrust
    }

    camera.position.set(...frame.camera)
    camera.lookAt(0, frame.landerAltitude * 0.6, 0)
    controlsRef.current?.target.set(0, 0, 0)

    if (frame.finished) {
      running.current = false
      onFinished()
    }
  })
  return null
}

function SceneContents({
  terrain,
  exaggeration,
  sunDir,
  earthDir,
  sunUp,
  playId,
  hold,
  onLanded,
  landed,
  overview,
  sights,
  horizon,
  fan,
}: {
  terrain: TerrainResponse
  exaggeration: number
  sunDir: Vec3
  earthDir: Vec3
  sunUp: boolean
  playId: number
  hold: boolean
  onLanded: () => void
  landed: boolean
  overview: Vec3
  sights: { sun: Sight; earth: Sight } | null
  horizon?: HorizonResponse
  fan?: FanControl
}) {
  const bodyRef = useRef<Group>(null)
  const plumeRef = useRef<Mesh>(null)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const lightDistance = 60

  return (
    <>
      <color attach="background" args={['#000000']} />
      <Stars radius={400} depth={60} count={3000} factor={4} saturation={0} fade speed={0} />

      {/* Real lunar shadows are nearly black; a faint fill keeps the shape of shadowed
          ground readable. */}
      <ambientLight intensity={0.32} color="#9fb6ff" />
      <directionalLight
        position={[sunDir[0] * lightDistance, sunDir[1] * lightDistance, sunDir[2] * lightDistance]}
        intensity={sunUp ? 3.2 : 0}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={140}
      />

      <TerrainMesh terrain={terrain} exaggeration={exaggeration} />
      <Lander
        bodyRef={bodyRef}
        plumeRef={plumeRef}
        sunDirection={sunDir}
        earthDirection={earthDir}
      />
      {/* Site marker above the lander: visible from afar, unlike the lander itself.
          Shown once landed, so it never pierces the descending lander. */}
      <mesh position={[0, 1.2, 0]} visible={landed}>
        <cylinderGeometry args={[0.012, 0.012, 1.6, 6]} />
        <meshBasicMaterial color="#f5c542" transparent opacity={0.7} toneMapped={false} />
      </mesh>

      {landed && sights && <SightRays sun={sights.sun} earth={sights.earth} />}
      {fan && horizon?.hits && (
        <SkylineFan
          horizon={horizon}
          exaggeration={exaggeration}
          runId={fan.runId}
          onDone={fan.onDone}
        />
      )}

      {sunDir[1] > -0.05 && <SunDisc direction={sunDir} />}
      {earthDir[1] > -0.05 && <EarthGlobe direction={earthDir} />}

      <OrbitControls
        ref={controlsRef}
        enabled={landed}
        enableDamping
        target={[0, 0, 0]}
        minDistance={0.15}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
      <DescentDirector
        playId={playId}
        hold={hold}
        overview={overview}
        bodyRef={bodyRef}
        plumeRef={plumeRef}
        controlsRef={controlsRef}
        onFinished={onLanded}
      />
    </>
  )
}

export interface SiteCanvasProps {
  terrain: TerrainResponse
  sun: BodyState
  earth: BodyState
  exaggeration?: number
  /** Bump to replay the landing. */
  playId: number
  /**
   * Keep the lander at the top of the descent and draw only on demand: the scene is built
   * and its shaders compiled, ready to take over without a stall.
   */
  hold?: boolean
  landed: boolean
  onLanded: () => void
  /** Where the camera settles after the landing. */
  overview?: Vec3
  /** With hit points, rays to the Sun and Earth stop on the terrain that hides them. */
  horizon?: HorizonResponse
  /** Show the skyline being traced (needs `horizon` with hit points). */
  fan?: FanControl
}

export interface FanControl {
  /** Bump to run the sweep; 0 keeps it hidden. */
  runId: number
  onDone: () => void
}

/** The 3D landing site: terrain, light from the Sun, the Earth, the lander and its descent. */
export function SiteCanvas({
  terrain,
  sun,
  earth,
  exaggeration = 1,
  playId,
  hold = false,
  landed,
  onLanded,
  overview = OVERVIEW,
  horizon,
  fan,
}: SiteCanvasProps) {
  const sunDir = useMemo(() => azElToVector(sun.az, sun.el), [sun.az, sun.el])
  const earthDir = useMemo(() => azElToVector(earth.az, earth.el), [earth.az, earth.el])
  const sights = useMemo(
    () =>
      horizon
        ? {
            sun: sightOf(
              sun.az,
              sun.el,
              sun.visible,
              sun.skyline ?? 0,
              horizon,
              sun.diskFraction ?? 1,
              exaggeration,
            ),
            earth: sightOf(
              earth.az,
              earth.el,
              earth.visible,
              earth.skyline ?? 0,
              horizon,
              1,
              exaggeration,
            ),
          }
        : null,
    [horizon, sun, earth, exaggeration],
  )

  return (
    <Canvas
      shadows
      frameloop={hold ? 'demand' : 'always'}
      dpr={[1, 2]}
      camera={{ position: [9, 7, 12], fov: 45, near: 0.01, far: 2000 }}
      aria-label="3D view of the landing site"
    >
      <SceneContents
        terrain={terrain}
        exaggeration={exaggeration}
        sunDir={sunDir}
        earthDir={earthDir}
        // On a peak the skyline dips below 0°: the Sun can be visible while slightly below
        // the horizontal, so trust the analysis, not the bare elevation.
        sunUp={sun.visible || sun.el > -0.3}
        playId={playId}
        hold={hold}
        landed={landed}
        onLanded={onLanded}
        overview={overview}
        sights={sights}
        horizon={horizon}
        fan={fan}
      />
    </Canvas>
  )
}

export default function SiteScene({ site, sun, earth, horizon }: Props) {
  const terrain = useTerrain(site)
  const [exaggeration, setExaggeration] = useState(1)
  const [playId, setPlayId] = useState(0)
  const [landed, setLanded] = useState(false)

  function replay() {
    setLanded(false)
    setPlayId((n) => n + 1)
  }

  return (
    <figure className="scene3d">
      <div className="scene3d-canvas">
        {terrain.isPending && <Spinner label="Loading terrain around the site…" />}
        {terrain.isError && (
          <p className="error" role="alert">
            Could not load terrain: {terrain.error.message}
          </p>
        )}
        {terrain.data && (
          <SiteCanvas
            terrain={terrain.data}
            sun={sun}
            earth={earth}
            exaggeration={exaggeration}
            playId={playId}
            landed={landed}
            onLanded={() => setLanded(true)}
            horizon={horizon}
          />
        )}

        <div className="scene3d-badges" aria-live="off">
          <span className="badge" data-on={sun.visible}>
            ☀ {sun.visible ? 'Sunlit at the site' : 'Site in shadow'}
          </span>
          <span className="badge" data-on={earth.visible} data-body="earth">
            ◉ {earth.visible ? 'Earth in view' : 'Earth hidden'}
          </span>
        </div>
      </div>

      <div className="scene3d-controls">
        <button type="button" className="secondary" onClick={replay} disabled={!landed}>
          ↺ Replay landing
        </button>
        <label className="scene3d-exaggeration">
          Relief
          <select value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))}>
            {EXAGGERATIONS.map((x) => (
              <option key={x} value={x}>
                ×{x}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">Drag to orbit · scroll to zoom</span>
      </div>

      <figcaption className="muted small">
        {terrain.data?.kind === 'terrain'
          ? `LOLA terrain within ${(terrain.data.half_extent_m / 1000).toFixed(0)} km of the site; shadows come only from this area, the verdict uses the full 200 km skyline.`
          : 'No terrain data here: a bare lunar sphere.'}{' '}
        Lander ×{LANDER_SCALE}, Sun and Earth enlarged for visibility.
      </figcaption>
    </figure>
  )
}
