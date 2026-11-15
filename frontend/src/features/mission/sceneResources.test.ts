import { expect, it, vi } from 'vitest'
import {
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  Texture,
} from 'three'
import { disposeSceneResources } from './sceneResources'

it('releases shared mesh resources and textures once per scene subtree', () => {
  const root = new Group()
  const geometry = new BoxGeometry()
  const texture = new Texture()
  const material = new MeshStandardMaterial({ map: texture, emissiveMap: texture })
  const shader = new ShaderMaterial({ uniforms: { maps: { value: [texture] } } })
  root.add(new Mesh(geometry, material), new Mesh(geometry, [material, shader]))
  const disposals = [geometry, texture, material, shader].map((item) => vi.spyOn(item, 'dispose'))

  disposeSceneResources(root)

  disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1))
  expect(root.children).toHaveLength(2) // Ownership and removal are separate operations.
})

it('removes owned labels and releases light shadow targets', () => {
  const root = new Group()
  const light = new DirectionalLight()
  const shadowDispose = vi.spyOn(light.shadow, 'dispose')
  const element = { remove: vi.fn() }
  const label = Object.assign(new Object3D(), { element })
  root.add(light, label)

  disposeSceneResources(root)

  expect(shadowDispose).toHaveBeenCalledTimes(1)
  expect(element.remove).toHaveBeenCalledTimes(1)
})
