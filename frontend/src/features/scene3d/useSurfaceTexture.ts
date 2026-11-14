import { useEffect, useState } from 'react'
import { SRGBColorSpace, TextureLoader, type Texture } from 'three'

/** Keep the existing surface visible while a higher-detail texture loads or fails. */
export function useSurfaceTexture(url: string | null, color = true) {
  const [loaded, setLoaded] = useState<{ url: string; texture: Texture } | null>(null)
  useEffect(() => {
    if (!url) return
    let active = true
    let texture: Texture | undefined
    new TextureLoader().load(
      url,
      (result) => {
        texture = result
        if (!active) {
          result.dispose()
          return
        }
        if (color) result.colorSpace = SRGBColorSpace
        result.anisotropy = 4
        setLoaded({ url, texture: result })
      },
      undefined,
      () => {
        /* The bundled overview remains available offline. */
      },
    )
    return () => {
      active = false
      texture?.dispose()
    }
  }, [url, color])
  return loaded?.url === url ? loaded.texture : null
}
