import { Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three'
import { MOON_RADIUS_KM } from '../mission-control/globe'
import { localAxes } from './lunarFrame'

export function globeRotation(site: { lat: number; lon: number }) {
  const axes = localAxes(site).map((axis) => new Vector3(...axis))
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(...(axes as [Vector3, Vector3, Vector3])).transpose(),
  )
}

/** Zero slope at both ends avoids a crease where measured terrain meets the overview. */
export function edgeBlend(x: number, z: number, half: number, width: number) {
  const t = Math.max(0, Math.min(1, (half - Math.max(Math.abs(x), Math.abs(z))) / width))
  return t * t * (3 - 2 * t)
}

export interface GlobeSample {
  height: number
  uv: [number, number]
  normal: Vector3
}
export type GlobeJoin = (x: number, z: number) => GlobeSample

/** Sample the actual globe triangles, not an ideal sphere sitting above the coarse mesh. */
export function createGlobeJoin(
  site: { lat: number; lon: number },
  altitude: number,
  half: number,
  segments: number,
): GlobeJoin {
  const geo = new SphereGeometry(MOON_RADIUS_KM, segments, segments / 2)
  geo.applyQuaternion(globeRotation(site))
  geo.translate(0, -MOON_RADIUS_KM - altitude, 0)
  const positions = geo.getAttribute('position'),
    normals = geo.getAttribute('normal'),
    uv = geo.getAttribute('uv')
  const triangles: { p: Vector3[]; n: Vector3[]; uv: [number, number][]; denominator: number }[] =
    []
  const index = geo.index!
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    const p = ids.map((j) => new Vector3().fromBufferAttribute(positions, j))
    if (Math.max(...p.map((v) => v.y)) < -MOON_RADIUS_KM - altitude) continue
    if (
      Math.min(...p.map((v) => v.x)) > half ||
      Math.max(...p.map((v) => v.x)) < -half ||
      Math.min(...p.map((v) => v.z)) > half ||
      Math.max(...p.map((v) => v.z)) < -half
    )
      continue
    const [a, b, c] = p
    const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
    if (Math.abs(denominator) < 1e-9) continue
    triangles.push({
      p,
      denominator,
      n: ids.map((j) => new Vector3().fromBufferAttribute(normals, j)),
      uv: ids.map((j) => [uv.getX(j), uv.getY(j)]),
    })
  }
  geo.dispose()
  return (x, z) => {
    for (const triangle of triangles) {
      const [a, b, c] = triangle.p
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / triangle.denominator
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / triangle.denominator
      const w = 1 - u - v
      if (Math.min(u, v, w) < -1e-6) continue
      const weights = [u, v, w]
      return {
        height: u * a.y + v * b.y + w * c.y,
        uv: [
          weights.reduce((sum, t, j) => sum + t * triangle.uv[j][0], 0),
          weights.reduce((sum, t, j) => sum + t * triangle.uv[j][1], 0),
        ],
        normal: triangle.n[0]
          .clone()
          .multiplyScalar(u)
          .addScaledVector(triangle.n[1], v)
          .addScaledVector(triangle.n[2], w)
          .normalize(),
      }
    }
    throw new Error('Terrain footprint lies outside the visible globe mesh')
  }
}
