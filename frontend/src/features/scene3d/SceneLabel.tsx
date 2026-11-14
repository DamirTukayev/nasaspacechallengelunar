import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import type { Vec3 } from './math'

/** Labels own plain DOM nodes so replay can tear down a Canvas without nested React roots. */
export function SceneLabel({
  text,
  className,
  position,
}: {
  text: string
  className: string
  position: Vec3
}) {
  const { gl } = useThree()
  const anchor = useRef<Group>(null)
  const element = useRef<HTMLDivElement | null>(null)
  const projected = useRef(new Vector3())
  useEffect(() => {
    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '10',
    })
    const label = document.createElement('span')
    label.className = className
    label.textContent = text
    wrapper.appendChild(label)
    gl.domElement.parentElement?.appendChild(wrapper)
    element.current = wrapper
    return () => {
      element.current = null
      wrapper.remove()
    }
  }, [gl, text, className])
  useFrame(({ camera, size }) => {
    if (!anchor.current || !element.current) return
    let visible = true
    anchor.current.traverseAncestors((parent) => {
      if (!parent.visible) visible = false
    })
    anchor.current.getWorldPosition(projected.current).project(camera)
    const { x, y, z } = projected.current
    element.current.style.display = visible && z >= -1 && z <= 1 ? '' : 'none'
    element.current.style.transform = `translate(${((x + 1) * size.width) / 2}px, ${((1 - y) * size.height) / 2}px) translate(-50%, -50%)`
  })
  return <group ref={anchor} position={position} />
}
