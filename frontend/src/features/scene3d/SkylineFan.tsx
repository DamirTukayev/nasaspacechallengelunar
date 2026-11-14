import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineLoop, LineSegments } from 'three'
import type { HorizonResponse } from '../../api/types'
import { FAN_TOTAL_SECONDS, FADE_SECONDS, rayGrowth, rayOpacity, raysDone } from './fan'
import type { Vec3 } from './math'
import { hitPositions } from './sight'

/** Same origin as the lines of sight: the top of the enlarged lander. */
const ORIGIN: Vec3 = [0, 0.18, 0]
const COLOR = '#7fdcff'

interface Props {
  stride?: number
  horizon: HorizonResponse
  exaggeration: number
  /** Bump to run the sweep again; 0 hides the fan. */
  runId: number
  onDone: () => void
}

/**
 * The skyline being computed: one ray per azimuth shoots out from the lander to the point
 * where it meets the terrain (from the API), and the skyline ring is drawn through those
 * points. Drawn over the terrain, radar-style: many points are beyond the 3D patch or below
 * it because of the Moon's curvature.
 */
export function SkylineFan({ horizon, exaggeration, runId, onDone, stride = 1 }: Props) {
  const points = useMemo(
    () => hitPositions(horizon, exaggeration).filter((_, i) => i % stride === 0),
    [horizon, exaggeration, stride],
  )
  const n = points.length

  const { rays, ring } = useMemo(() => {
    const rayGeometry = new BufferGeometry()
    rayGeometry.setAttribute('position', new BufferAttribute(new Float32Array(n * 6), 3))

    // A ray that left the DEM has no point; the ring reuses the previous one to stay closed.
    const ringPositions = new Float32Array(n * 3)
    let last: Vec3 = ORIGIN
    points.forEach((p, i) => {
      if (p) last = p
      ringPositions.set(last, i * 3)
    })
    const ringGeometry = new BufferGeometry()
    ringGeometry.setAttribute('position', new BufferAttribute(ringPositions, 3))
    ringGeometry.setDrawRange(0, 0)

    const common = { color: COLOR, transparent: true, depthTest: false, toneMapped: false }
    const rayMat = new LineBasicMaterial({ ...common, opacity: 0.55 })
    const ringMat = new LineBasicMaterial({ ...common, opacity: 0.95 })
    const raysObject = new LineSegments(rayGeometry, rayMat)
    const ringObject = new LineLoop(ringGeometry, ringMat)
    raysObject.renderOrder = 10
    ringObject.renderOrder = 11
    raysObject.frustumCulled = false
    ringObject.frustumCulled = false
    return { rays: raysObject, ring: ringObject }
  }, [points, n])

  useEffect(
    () => () => {
      for (const line of [rays, ring]) {
        line.geometry.dispose()
        ;(line.material as LineBasicMaterial).dispose()
      }
    },
    [rays, ring],
  )

  const startedAt = useRef<number | null>(null)
  const finished = useRef(false)
  const settled = useRef(false)
  useEffect(() => {
    startedAt.current = null
    finished.current = false
    settled.current = false
  }, [runId, points])

  const raysRef = useRef<LineSegments>(null)
  const ringRef = useRef<LineLoop>(null)

  useFrame(({ clock }) => {
    const raysLine = raysRef.current
    const ringLine = ringRef.current
    if (!raysLine || !ringLine) return
    raysLine.visible = ringLine.visible = runId > 0
    if (runId === 0 || settled.current) return
    if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const t = clock.elapsedTime - startedAt.current

    const positions = raysLine.geometry.getAttribute('position') as BufferAttribute
    const array = positions.array as Float32Array
    points.forEach((p, i) => {
      const g = p ? rayGrowth(t, i, n) : 0
      const end: Vec3 = p
        ? [
            ORIGIN[0] + (p[0] - ORIGIN[0]) * g,
            ORIGIN[1] + (p[1] - ORIGIN[1]) * g,
            ORIGIN[2] + (p[2] - ORIGIN[2]) * g,
          ]
        : ORIGIN
      array.set(ORIGIN, i * 6)
      array.set(end, i * 6 + 3)
    })
    positions.needsUpdate = true

    ringLine.geometry.setDrawRange(0, raysDone(t, n))
    ;(raysLine.material as LineBasicMaterial).opacity = rayOpacity(t)
    ;(ringLine.material as LineBasicMaterial).opacity = t > FAN_TOTAL_SECONDS ? 0.55 : 0.95

    if (!finished.current && t >= FAN_TOTAL_SECONDS) {
      finished.current = true
      onDone()
    }
    // Once faded out, nothing changes any more: stop touching the buffers.
    if (t >= FAN_TOTAL_SECONDS + FADE_SECONDS) settled.current = true
  })

  return (
    <>
      <primitive ref={raysRef} object={rays} />
      <primitive ref={ringRef} object={ring} />
    </>
  )
}
