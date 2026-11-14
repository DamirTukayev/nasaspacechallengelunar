import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
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
  const vectors = useMemo(
    () => ({
      position: new Vector3(),
      target: new Vector3(),
      up: new Vector3(),
      landingPosition: new Vector3(...descentFrame(0, overview).camera),
      landingTarget: new Vector3(0, descentFrame(0, overview).landerAltitude * 0.6, 0),
      north: new Vector3(0, 1, 0),
      center: new Vector3(0, -MOON_RADIUS_KM - altitude, 0),
      origin: new Vector3(),
      overview: new Vector3(...overview),
      whole: new Vector3(0, MOON_RADIUS_KM * 3, MOON_RADIUS_KM * 1.4),
      fromPosition: new Vector3(),
      fromTarget: new Vector3(),
    }),
    [altitude, overview],
  )
  const lastAltitude = useRef<number | null>(null)
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
      const position = vectors.position.set(...globePositionToLocal(f.camera, globe.site, altitude))
      const target = vectors.target.set(...globePositionToLocal(f.target, globe.site, altitude))
      const up = vectors.up.set(...globeDirectionToLocal(f.up, globe.site))
      const blend = ease(Math.min(1, Math.max(0, (t - FLIGHT_SECONDS) / 3)))
      position.lerp(vectors.landingPosition, blend)
      target.lerp(vectors.landingTarget, blend)
      up.lerp(vectors.north, blend).normalize()
      camera.position.copy(position)
      camera.up.copy(up)
      camera.lookAt(target)
      const height = Math.round(Math.max(0, position.distanceTo(vectors.center) - MOON_RADIUS_KM))
      if (altitudeRef.current && lastAltitude.current !== height) {
        altitudeRef.current.textContent = `${height.toLocaleString('en-US')} km`
        lastAltitude.current = height
      }
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
        position: vectors.fromPosition.copy(camera.position),
        target: vectors.fromTarget.copy(orbit.target),
      }
    }
    const move = transition.current
    if (!move) return
    controlsRef.current!.enabled = false
    const t = reduced ? 1 : Math.min(1, (clock.elapsedTime - move.start) / 1.6)
    const target = globe.whole ? vectors.center : vectors.origin
    const position = globe.whole ? vectors.whole : vectors.overview
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
