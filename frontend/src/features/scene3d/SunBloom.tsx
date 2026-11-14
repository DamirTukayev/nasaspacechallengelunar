import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector2 } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/** Only the high profile uses postprocessing; other profiles keep the inexpensive solar halo. */
export function SunBloom() {
  const { gl, scene, camera, size, viewport } = useThree()
  const composer = useMemo(() => {
    const result = new EffectComposer(gl)
    result.addPass(new RenderPass(scene, camera))
    result.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.4, 1.6))
    result.addPass(new OutputPass())
    return result
  }, [gl, scene, camera])
  useEffect(() => {
    composer.setPixelRatio(viewport.dpr)
    composer.setSize(size.width, size.height)
  }, [composer, size.width, size.height, viewport.dpr])
  useEffect(
    () => () => {
      composer.passes.forEach((pass) => pass.dispose())
      composer.dispose()
    },
    [composer],
  )
  useFrame((_, delta) => composer.render(delta), 1)
  return null
}
