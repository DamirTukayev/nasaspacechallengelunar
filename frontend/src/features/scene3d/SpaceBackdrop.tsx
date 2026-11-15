import { useEffect, useMemo } from 'react'
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LinearFilter,
  SRGBColorSpace,
} from 'three'
import { MOON_RADIUS_KM } from '../mission-control/globe'

/** A decorative backdrop glow, separate from calculated surface lighting. */
export function MoonBackdropGlow({ altitude }: { altitude: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(94, 128, 167, 0.28)')
    gradient.addColorStop(0.5, 'rgba(94, 128, 167, 0.20)')
    gradient.addColorStop(0.75, 'rgba(94, 128, 167, 0.08)')
    gradient.addColorStop(1, 'rgba(94, 128, 167, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
    const result = new CanvasTexture(canvas)
    result.colorSpace = SRGBColorSpace
    result.generateMipmaps = false
    result.minFilter = LinearFilter
    return result
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <sprite position={[0, -MOON_RADIUS_KM - altitude, 0]} scale={MOON_RADIUS_KM * 3.4}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={0.3}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  )
}

/** A quiet, static star field; fixed screen-size points remain subtle in the whole-Moon view. */
export function SpaceBackdrop({ wide, count }: { wide: boolean; count: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const radius = wide ? 18000 : 400
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count
      const ring = Math.sqrt(1 - y * y)
      const angle = i * Math.PI * (3 - Math.sqrt(5))
      positions.set(
        [radius * ring * Math.cos(angle), radius * y, radius * ring * Math.sin(angle)],
        i * 3,
      )
    }
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return result
  }, [wide, count])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#8495ad"
        size={1.2}
        sizeAttenuation={false}
        transparent
        opacity={0.42}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}
