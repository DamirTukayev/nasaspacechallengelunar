import { Texture, type BufferGeometry, type LightShadow, type Material, type Object3D } from 'three'

/** Release resources owned by this scene once, including shared lander materials. */
export function disposeSceneResources(root: Object3D): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const collectTexture = (value: unknown) => {
    if (value instanceof Texture) textures.add(value)
    else if (Array.isArray(value)) value.forEach(collectTexture)
  }
  root.traverse((object) => {
    const owner = object as Object3D & {
      geometry?: BufferGeometry
      material?: Material | Material[]
      shadow?: LightShadow
      element?: { remove: () => void }
    }
    if (owner.geometry) geometries.add(owner.geometry)
    if (owner.material) {
      for (const material of Array.isArray(owner.material) ? owner.material : [owner.material]) {
        materials.add(material)
        Object.values(material).forEach(collectTexture)
        const uniforms = (material as Material & { uniforms?: Record<string, { value: unknown }> })
          .uniforms
        if (uniforms) Object.values(uniforms).forEach((uniform) => collectTexture(uniform.value))
      }
    }
    owner.shadow?.dispose()
    owner.element?.remove()
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => texture.dispose())
}
