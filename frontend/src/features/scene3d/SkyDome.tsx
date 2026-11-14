import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three'
import type { AnalyzeResponse } from '../../api/types'
import { prefersReducedMotion } from '../mission-control/flyIn'
import { DOME_RADIUS, skyPoint, skySegments } from './skyPaths'

function Segments({
  positions,
  color,
  opacity,
  animate = false,
}: {
  positions: Float32Array
  color: string
  opacity: number
  animate?: boolean
}) {
  const [reducedMotion] = useState(prefersReducedMotion)
  const line = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    if (animate) geometry.setDrawRange(0, 0)
    return new LineSegments(
      geometry,
      new LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: !animate,
        toneMapped: false,
      }),
    )
  }, [positions, color, opacity, animate])
  const started = useRef<number | null>(null)
  useEffect(() => {
    started.current = null
    return () => {
      line.geometry.dispose()
      line.material.dispose()
    }
  }, [line])
  useFrame(({ clock }) => {
    if (!animate) return
    started.current ??= clock.elapsedTime
    const fraction = reducedMotion ? 1 : Math.min(1, (clock.elapsedTime - started.current) / 4)
    line.geometry.setDrawRange(0, Math.floor((positions.length / 6) * fraction) * 2)
  })
  return <primitive object={line} />
}

export function SkyDome({
  series,
  index,
  maxPoints = 2048,
}: {
  series: AnalyzeResponse['series']
  index: number
  maxPoints?: number
}) {
  const tracks = useMemo(
    () => [skySegments(series.sun, maxPoints), skySegments(series.earth, maxPoints)],
    [series, maxPoints],
  )
  const grid = useMemo(() => {
    const points: number[] = []
    for (const el of [0, 30, 60])
      for (let az = 0; az < 360; az += 5) points.push(...skyPoint(az, el), ...skyPoint(az + 5, el))
    for (let az = 0; az < 360; az += 45)
      for (let el = 0; el < 90; el += 5) points.push(...skyPoint(az, el), ...skyPoint(az, el + 5))
    return new Float32Array(points)
  }, [])
  return (
    <group>
      <mesh>
        <sphereGeometry args={[DOME_RADIUS, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial
          color="#91bce5"
          transparent
          opacity={0.025}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Segments positions={grid} color="#aac8e9" opacity={0.22} />
      {tracks.map((track, i) => {
        const color = i === 0 ? '#ffd65a' : '#87c6ff'
        const body = i === 0 ? series.sun : series.earth
        return (
          <group key={i}>
            <Segments positions={track.above} color={color} opacity={0.95} animate />
            <Segments positions={track.below} color={color} opacity={0.22} animate />
            <mesh position={skyPoint(body.azimuth[index], body.elevation[index])}>
              <sphereGeometry args={[0.09, 12, 8]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
