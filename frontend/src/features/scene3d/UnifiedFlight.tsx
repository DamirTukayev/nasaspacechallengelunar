import { useFrame } from '@react-three/fiber'
import { useRef, useState, type ComponentRef, type RefObject } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Vector3 } from 'three'
import {
  azElToGlobe,
  flightFrame,
  FLIGHT_SECONDS,
  latLonToGlobe,
  MOON_RADIUS_KM,
  planFlight,
} from '../mission-control/globe'
import { prefersReducedMotion } from '../mission-control/flyIn'
import { descentFrame, type Vec3 } from './math'
import { globeDirectionToLocal, globePositionToLocal, type LunarSite } from './lunarFrame'

export interface GlobeView {
  site: LunarSite
  sites: import('../../api/types').Site[]
  flying: boolean
  whole: boolean
  onArrive: () => void
  altitudeRef: RefObject<HTMLElement | null>
}
const ease = (t: number) => t * t * (3 - 2 * t)
export function UnifiedFlight({
  globe,
  altitude,
  overview,
  sun,
  controlsRef,
  landed,
}: {
  globe: GlobeView
  altitude: number
  overview: Vec3
  sun: { az: number; el: number }
  controlsRef: RefObject<ComponentRef<typeof OrbitControls> | null>
  landed: boolean
}) {
  const { altitudeRef } = globe
  const [plan] = useState(() =>
    planFlight(
      latLonToGlobe(globe.site.lat, globe.site.lon),
      azElToGlobe(globe.site.lat, globe.site.lon, sun.az, sun.el),
    ),
  )
  const [reduced] = useState(prefersReducedMotion)
  const started = useRef<number | null>(null)
  const arrived = useRef(false)
  const previous = useRef(false)
  const transition = useRef<{ start: number; position: Vector3; target: Vector3 } | null>(null)
  useFrame(({ camera, clock }) => {
    const orbit = controlsRef.current
    if (globe.flying) {
      started.current ??= clock.elapsedTime
      const t = clock.elapsedTime - started.current
      const f = flightFrame(plan, Math.min(t, FLIGHT_SECONDS))
      const position = new Vector3(...globePositionToLocal(f.camera, globe.site, altitude))
      const target = new Vector3(...globePositionToLocal(f.target, globe.site, altitude))
      const up = new Vector3(...globeDirectionToLocal(f.up, globe.site))
      const blend = ease(Math.min(1, Math.max(0, (t - FLIGHT_SECONDS) / 3)))
      const landing = descentFrame(0, overview)
      position.lerp(new Vector3(...landing.camera), blend)
      target.lerp(new Vector3(0, landing.landerAltitude * 0.6, 0), blend)
      up.lerp(new Vector3(0, 1, 0), blend).normalize()
      camera.position.copy(position)
      camera.up.copy(up)
      camera.lookAt(target)
      if (altitudeRef.current)
        altitudeRef.current.textContent = `${Math.round(Math.max(0, position.distanceTo(new Vector3(0, -MOON_RADIUS_KM - altitude, 0)) - MOON_RADIUS_KM)).toLocaleString('en-US')} km`
      if (t >= FLIGHT_SECONDS + 3 && !arrived.current) {
        arrived.current = true
        globe.onArrive()
      }
      return
    }
    if (!landed || !orbit) return
    if (previous.current !== globe.whole) {
      previous.current = globe.whole
      transition.current = {
        start: clock.elapsedTime,
        position: camera.position.clone(),
        target: orbit.target.clone(),
      }
    }
    const move = transition.current
    if (!move) return
    controlsRef.current!.enabled = false
    const t = reduced ? 1 : Math.min(1, (clock.elapsedTime - move.start) / 1.6)
    const target = globe.whole ? new Vector3(0, -MOON_RADIUS_KM - altitude, 0) : new Vector3()
    const position = globe.whole
      ? new Vector3(0, MOON_RADIUS_KM * 3, MOON_RADIUS_KM * 1.4)
      : new Vector3(...overview)
    camera.position.copy(move.position).lerp(position, ease(t))
    orbit.target.copy(move.target).lerp(target, ease(t))
    camera.up.set(0, 1, 0)
    camera.lookAt(orbit.target)
    if (t === 1) {
      transition.current = null
      controlsRef.current!.enabled = true
    }
  })
  return null
}
