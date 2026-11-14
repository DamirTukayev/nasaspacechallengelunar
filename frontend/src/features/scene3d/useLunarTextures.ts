import { useTexture } from '@react-three/drei'
import { SRGBColorSpace } from 'three'
import { API_URL } from '../../api/client'
import colorUrl from '../../assets/moon/lroc-color-4k.jpg'
import reliefUrl from '../../assets/moon/ldem-relief-1k.jpg'
import { useSurfaceTexture } from './useSurfaceTexture'
import type { Quality } from './quality'

export function useLunarTextures(quality: Quality) {
  const color = useTexture(colorUrl, (texture) => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
  })
  const relief = useTexture(reliefUrl)
  const detailedColor = useSurfaceTexture(
    quality !== 'low' ? `${API_URL}/api/surface/globe/globe-color.jpg` : null,
  )
  const detailedRelief = useSurfaceTexture(
    quality !== 'low' ? `${API_URL}/api/surface/globe/globe-height.png` : null,
    false,
  )
  return { color: detailedColor ?? color, relief: detailedRelief ?? relief }
}
export type LunarTextures = ReturnType<typeof useLunarTextures>
