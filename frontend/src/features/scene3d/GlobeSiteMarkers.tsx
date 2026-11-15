import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Site } from '../../api/types'
import { latLonToGlobe, MOON_RADIUS_KM } from '../mission-control/globe'
import { globePositionToLocal, type LunarSite } from './lunarFrame'
import { projectGlobeMarkers } from './globeMarkers'
import './globeMarkers.css'

function positionMarker(element: HTMLElement, point?: { x: number; y: number }) {
  element.style.display = point ? '' : 'none'
  if (point) element.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`
}

export function GlobeSiteMarkers({
  site,
  sites,
  altitude,
  onPickSite,
}: {
  site: LunarSite
  sites: Site[]
  altitude: number
  onPickSite?: (siteId: string) => void
}) {
  const gl = useThree((state) => state.gl)
  const elements = useRef(new Map<string, HTMLButtonElement>())
  const pick = useRef(onPickSite)
  useEffect(() => {
    pick.current = onPickSite
  }, [onPickSite])
  const { lat, lon, siteId } = site
  const markers = useMemo(() => {
    const listed = sites.map((s) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      name: s.name,
      selected: s.id === siteId,
    }))
    if (!listed.some((s) => s.selected))
      listed.unshift({ id: 'selected', lat, lon, name: site.name, selected: true })
    return listed.map((s) => ({
      id: s.id,
      selected: s.selected,
      name: s.name,
      coordinates: `${Math.abs(s.lat).toFixed(2)}°${s.lat < 0 ? 'S' : 'N'} ${Math.abs(s.lon).toFixed(2)}°${s.lon < 0 ? 'W' : 'E'}`,
      position: new Vector3(
        ...globePositionToLocal(latLonToGlobe(s.lat, s.lon), { lat, lon }, altitude),
      ),
    }))
  }, [lat, lon, siteId, site.name, sites, altitude])
  const center = useMemo(() => new Vector3(0, -MOON_RADIUS_KM - altitude, 0), [altitude])

  useEffect(() => {
    const layer = document.createElement('div')
    layer.className = 'globe-site-markers'
    layer.setAttribute('role', 'group')
    layer.setAttribute('aria-label', 'Lunar landing sites')
    const nodes = new Map<string, HTMLButtonElement>()
    for (const marker of markers) {
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = 'globe-site-marker'
      dot.dataset.siteId = marker.id
      dot.dataset.selected = String(marker.selected)
      dot.setAttribute('aria-label', `${marker.name}, ${marker.coordinates}`)
      dot.setAttribute('aria-pressed', String(marker.selected))
      dot.onpointerdown = (event) => event.stopPropagation()
      dot.onclick = (event) => {
        event.stopPropagation()
        pick.current?.(marker.id)
      }
      dot.style.display = 'none'
      const circle = document.createElement('span')
      circle.className = 'globe-site-marker-dot'
      dot.appendChild(circle)
      {
        const label = document.createElement('span')
        label.className = 'mc-intro-label globe-site-marker-label'
        const name = document.createElement('span')
        name.textContent = marker.name
        const coordinates = document.createElement('small')
        coordinates.textContent = marker.coordinates
        label.append(name, coordinates)
        label.setAttribute('aria-hidden', 'true')
        dot.appendChild(label)
      }
      layer.appendChild(dot)
      nodes.set(marker.id, dot)
    }
    elements.current = nodes
    gl.domElement.parentElement?.appendChild(layer)
    return () => {
      elements.current = new Map()
      layer.remove()
    }
  }, [gl, markers, site.name])

  useFrame(({ camera, size }) => {
    const visible = projectGlobeMarkers(markers, camera, center, size)
    for (const [id, element] of elements.current) {
      positionMarker(
        element,
        visible.find((marker) => marker.id === id),
      )
    }
  })
  return null
}
