import { Html, Stars, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react'
import { type Group, type Mesh, Quaternion, SRGBColorSpace, type Texture, Vector3 } from 'three'
import type { Site } from '../../api/types'
import moonColorUrl from '../../assets/moon/lroc-color-4k.jpg'
import moonReliefUrl from '../../assets/moon/ldem-relief-1k.jpg'
import { formatUtc } from '../../lib/time'
import type { Vec3 } from '../scene3d/math'
import { type FlightPlan, flightFrame, globeToLatLon, latLonToGlobe, planFlight } from './globe'

// Start fetching the maps as soon as Mission Control's code arrives, before the scene needs them.
useTexture.preload([moonColorUrl, moonReliefUrl])

function prepareColor(texture: Texture) {
  texture.colorSpace = SRGBColorSpace
  // Keeps the map sharp near the limb and over the poles, where it is seen edge-on.
  texture.anisotropy = 8
}

function Moon() {
  const color = useTexture(moonColorUrl, prepareColor)
  // The relief map holds heights, not colours: it stays linear.
  const relief = useTexture(moonReliefUrl)
  return (
    <mesh>
      <sphereGeometry args={[1, 192, 96]} />
      <meshStandardMaterial
        map={color}
        bumpMap={relief}
        bumpScale={3}
        roughness={1}
        metalness={0}
      />
    </mesh>
  )
}

const UP = new Vector3(0, 0, 1)

interface Marker {
  key: string
  name: string
  lat: number
  lon: number
  active: boolean
}

/** Marker sizes are set for this camera distance and scaled to keep their size on screen. */
const MARKER_REFERENCE_DISTANCE = 3.4

function SiteMarker({ site, active }: { site: Marker; active: boolean }) {
  const groupRef = useRef<Group>(null)
  const ringRef = useRef<Mesh>(null)
  const position = useMemo(() => {
    const [x, y, z] = latLonToGlobe(site.lat, site.lon)
    return new Vector3(x, y, z)
  }, [site.lat, site.lon])
  const orientation = useMemo(
    () => new Quaternion().setFromUnitVectors(UP, position.clone().normalize()),
    [position],
  )

  useFrame(({ clock, camera }) => {
    groupRef.current?.scale.setScalar(
      camera.position.distanceTo(position) / MARKER_REFERENCE_DISTANCE,
    )
    const ring = ringRef.current
    if (!ring) return
    const pulse = (clock.elapsedTime % 1.6) / 1.6
    ring.scale.setScalar(1 + pulse * 2.5)
    const material = ring.material as { opacity: number }
    material.opacity = 0.9 * (1 - pulse)
  })

  const lifted = position.clone().multiplyScalar(1.002)
  return (
    <group ref={groupRef} position={lifted} quaternion={orientation}>
      <mesh>
        <circleGeometry args={[active ? 0.009 : 0.004, 20]} />
        <meshBasicMaterial color={active ? '#f5c542' : '#cfe8ff'} toneMapped={false} />
      </mesh>
      {active && (
        <>
          <mesh ref={ringRef}>
            <ringGeometry args={[0.012, 0.015, 40]} />
            <meshBasicMaterial color="#f5c542" transparent toneMapped={false} depthWrite={false} />
          </mesh>
          <Html center zIndexRange={[10, 0]} position={[0, 0, 0.02]}>
            <span className="mc-intro-label">{site.name}</span>
          </Html>
        </>
      )}
    </group>
  )
}

function FlightDirector({
  plan,
  stopped,
  altitudeRef,
  overRef,
  onArrive,
}: {
  plan: FlightPlan
  stopped: boolean
  altitudeRef: RefObject<HTMLElement | null>
  overRef: RefObject<HTMLElement | null>
  onArrive: () => void
}) {
  const camera = useThree((s) => s.camera)
  const startedAt = useRef<number | null>(null)
  const arrived = useRef(false)

  useFrame(({ clock }) => {
    // Skipped: hold the current shot while the view fades to the landing.
    if (stopped) return
    // The clock starts with the first drawn frame, once the maps are on screen.
    if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const f = flightFrame(plan, clock.elapsedTime - startedAt.current)

    camera.position.set(...f.camera)
    camera.up.set(...f.up)
    camera.lookAt(...f.target)

    if (altitudeRef.current)
      altitudeRef.current.textContent = `${Math.round(f.altitudeKm).toLocaleString('en-US')} km`
    if (overRef.current) {
      const { lat, lon } = globeToLatLon(f.camera)
      overRef.current.textContent = `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`
    }

    if (f.finished && !arrived.current) {
      arrived.current = true
      onArrive()
    }
  })
  return null
}

export interface GlobeIntroProps {
  sites: Site[]
  site: { lat: number; lon: number; name: string; siteId?: string }
  /** Directions to the Sun and the Earth in the globe frame, at the start of the period. */
  sun: Vec3
  earth: Vec3
  time: string
  /** Fading out: the flight is over or skipped. */
  leaving: boolean
  /** The flight reached the site, or was skipped: the landing can start. */
  onArrive: () => void
  /** Fully faded out. */
  onGone: () => void
}

/** The approach: the whole Moon, lit as at the start of the period, then down to the site. */
export default function GlobeIntro({
  sites,
  site,
  sun,
  earth,
  time,
  leaving,
  onArrive,
  onGone,
}: GlobeIntroProps) {
  const target = useMemo(() => latLonToGlobe(site.lat, site.lon), [site.lat, site.lon])
  const plan = useMemo(() => planFlight(target, sun), [target, sun])
  const first = useMemo(() => flightFrame(plan, 0), [plan])
  const altitudeRef = useRef<HTMLElement>(null)
  const overRef = useRef<HTMLElement>(null)

  // Space, Enter, S or Esc skips; caught before Mission Control's own keys see them.
  const latestArrive = useRef(onArrive)
  useEffect(() => {
    latestArrive.current = onArrive
  })
  useEffect(() => {
    if (leaving) return
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if ([' ', 'Enter', 'Escape', 's', 'S'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        latestArrive.current()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [leaving])

  // A catalog site is highlighted; a custom spot gets its own marker.
  const markers = useMemo(() => {
    const list: Marker[] = sites.map((s) => ({
      key: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      active: s.id === site.siteId,
    }))
    if (!list.some((m) => m.active))
      list.push({ key: 'custom', name: site.name, lat: site.lat, lon: site.lon, active: true })
    return list
  }, [sites, site])

  const light = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]

  return (
    <div
      className="mc-intro"
      data-leaving={leaving || undefined}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && leaving) onGone()
      }}
    >
      <Canvas
        // Fading out over the landing: the last frame stays on the canvas, no need to draw more.
        frameloop={leaving ? 'never' : 'always'}
        dpr={[1, 2]}
        camera={{ position: first.camera, up: first.up, fov: 35, near: 0.001, far: 200 }}
        aria-label="Flight from the whole Moon down to the landing site"
      >
        <color attach="background" args={['#000000']} />
        <Stars radius={60} depth={30} count={2500} factor={2.5} saturation={0} fade speed={0} />
        {/* Sunlight from the real direction at the start of the period, a hint of earthshine. */}
        <directionalLight position={light(sun, 10)} intensity={3} color="#fff4e0" />
        <directionalLight position={light(earth, 10)} intensity={0.2} color="#9fb6ff" />
        <ambientLight intensity={0.06} />
        <Suspense fallback={null}>
          <Moon />
          {markers.map((m) => (
            <SiteMarker key={m.key} site={m} active={m.active} />
          ))}
          <FlightDirector
            plan={plan}
            stopped={leaving}
            altitudeRef={altitudeRef}
            overRef={overRef}
            onArrive={onArrive}
          />
        </Suspense>
      </Canvas>

      <div className="mc-intro-readout mc-panel" aria-live="off">
        <p className="mc-intro-kicker">Approach · {site.name}</p>
        <dl>
          <div>
            <dt>Altitude</dt>
            <dd ref={altitudeRef}>{Math.round(first.altitudeKm).toLocaleString('en-US')} km</dd>
          </div>
          <div>
            <dt>Over</dt>
            <dd ref={overRef}>—</dd>
          </div>
        </dl>
        <p className="mc-muted">
          Sunlight as at {formatUtc(time)} (JPL Horizons) · LRO colour map, NASA SVS
        </p>
      </div>

      {!leaving && (
        <button
          type="button"
          className="secondary mc-intro-skip"
          onClick={onArrive}
          title="Skip the flight (Space, Enter or Esc)"
        >
          Skip ▸▸
        </button>
      )}
    </div>
  )
}
