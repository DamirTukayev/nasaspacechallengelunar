import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import {
  type FieldKey,
  type Heightmap,
  type SelectedLandingSearch,
  STAGES,
  TOTAL_SECONDS,
  formatLat,
  formatLon,
  makeGridSampler,
  rampColor,
  stageAt,
  sweepFraction,
} from './landing'

/*
 * World units: 1 = lunar radius (1737.4 km). The south pole is at (0, -1, 0).
 * Polar stereographic +y (toward 0°E) maps to world +x and +x (toward 90°E) to world -z,
 * which matches how THREE.SphereGeometry lays out an equirectangular texture.
 * Terrain heights are exaggerated so craters read from orbit.
 */
const R_KM = 1737.4
const EXAGGERATION = 2
const M_TO_UNITS = 1 / (R_KM * 1000)
const SUN_ELEVATION_DEG = 1.6
const EARTH_DISTANCE = 384_400 / R_KM
const EARTH_RADIUS = 6371 / R_KM
const EARTH_ELEVATION_DEG = 3.5

const FIELD_INDEX: Record<FieldKey, number> = {
  terrain: 0,
  light: 1,
  comm: 2,
  resources: 3,
  total: 4,
}

export type FrameInfo = {
  playing: boolean
  done: boolean
  stageIndex: number
  progress: number
  sweep: number
}

const POLE = new THREE.Vector3(0, -1, 0)
const UP_AT_POLE = new THREE.Vector3(0, -1, 0)

function toWorld(xKm: number, yKm: number, hM: number, out = new THREE.Vector3()) {
  const s = 1 / R_KM
  return out
    .set(yKm * s, -1, -xKm * s)
    .normalize()
    .multiplyScalar(1 + (hM * EXAGGERATION) / 1000 / R_KM)
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const easeOut = (t: number) => 1 - (1 - t) ** 3
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

function glowTexture(inner: string, outer: string): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, inner)
  g.addColorStop(0.25, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Terrain mesh over a square heightmap, optionally clipped to a disk around the pole. */
function buildTerrainGeometry(
  map: Heightmap,
  centerXKm: number,
  centerYKm: number,
  diskRadiusKm: number | null,
): { geometry: THREE.BufferGeometry; xs: Float32Array; ys: Float32Array } {
  const n = map.size
  const half = map.half_size_km
  const positions = new Float32Array(n * n * 3)
  const local = new Float32Array(n * n * 2)
  const xs = new Float32Array(n * n)
  const ys = new Float32Array(n * n)
  const v = new THREE.Vector3()

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const i = row * n + col
      const x = centerXKm - half + (2 * half * col) / (n - 1)
      const y = centerYKm + half - (2 * half * row) / (n - 1)
      let h = map.heights_m[i]
      if (diskRadiusKm !== null) {
        // Fade heights to the sphere at the rim so the patch meets the globe seamlessly.
        const r = Math.hypot(x, y) / diskRadiusKm
        h *= 1 - clamp01((r - 0.82) / 0.18)
      }
      toWorld(x, y, h, v)
      positions.set([v.x, v.y, v.z], i * 3)
      local.set([x, y], i * 2)
      xs[i] = x
      ys[i] = y
    }
  }

  const indices: number[] = []
  const inside = (i: number) =>
    diskRadiusKm === null || Math.hypot(xs[i], ys[i]) <= diskRadiusKm * 1.0001
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col
      const b = a + 1
      const c = a + n
      const d = c + 1
      if (inside(a) && inside(c) && inside(b)) indices.push(a, c, b)
      if (inside(b) && inside(c) && inside(d)) indices.push(b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('local', new THREE.BufferAttribute(local, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return { geometry, xs, ys }
}

type HeatUniforms = {
  uField: { value: number }
  uPrevField: { value: number }
  uSweep: { value: number }
  uHeat: { value: number }
  uDim: { value: number }
  uSearchR: { value: number }
  uRamp: { value: THREE.Color[] }
  uHole: { value: THREE.Vector4 }
  uHoleOn: { value: number }
}

/** MeshStandardMaterial plus a score heatmap revealed by a radar sweep. */
function heatMaterial(uniforms: HeatUniforms, color: THREE.ColorRepresentation) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.97, metalness: 0 })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 scoreA;
        attribute vec4 scoreB;
        attribute vec2 local;
        varying vec4 vScoreA;
        varying vec4 vScoreB;
        varying vec2 vLocal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vScoreA = scoreA;
        vScoreB = scoreB;
        vLocal = local;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uField;
        uniform float uPrevField;
        uniform float uSweep;
        uniform float uHeat;
        uniform float uDim;
        uniform float uSearchR;
        uniform vec3 uRamp[5];
        uniform vec4 uHole;
        uniform float uHoleOn;
        varying vec4 vScoreA;
        varying vec4 vScoreB;
        varying vec2 vLocal;

        vec3 rampColor(float v) {
          v = clamp(v, 0.0, 1.0) * 4.0;
          int i = int(min(floor(v), 3.0));
          return mix(uRamp[i], uRamp[i + 1], v - float(i));
        }

        float pickScore(float f) {
          if (f < 0.5) return vScoreA.x;
          if (f < 1.5) return vScoreA.y;
          if (f < 2.5) return vScoreA.z;
          if (f < 3.5) return vScoreA.w;
          return vScoreB.x;
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uHoleOn > 0.5 && vLocal.x > uHole.x && vLocal.x < uHole.y
            && vLocal.y > uHole.z && vLocal.y < uHole.w) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float r = length(vLocal);
        float inSearch = 1.0 - smoothstep(uSearchR * 0.97, uSearchR, r);
        float revealed = clamp((uSweep - vScoreB.y) / 0.03, 0.0, 1.0);
        vec3 heatNew = rampColor(pickScore(uField));
        vec3 heatPrev = uPrevField >= 0.0 ? rampColor(pickScore(uPrevField)) : diffuseColor.rgb;
        float shown = uPrevField >= 0.0 ? 1.0 : revealed;
        float eligible = mix(1.0, 0.18 + 0.82 * vScoreB.z, uDim);
        vec3 heat = mix(heatPrev, heatNew, revealed);
        float heatAmount = uHeat * inSearch * shown * eligible;
        diffuseColor.rgb = mix(diffuseColor.rgb, heat, heatAmount * 0.8);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += heat * heatAmount * 0.32;
        float gap = abs(vScoreB.y - uSweep);
        gap = min(gap, 1.0 - gap);
        float edge = exp(-gap * gap * 30000.0) * uHeat * inSearch * step(uSweep, 1.0);
        totalEmissiveRadiance += vec3(1.0, 0.86, 0.55) * edge * 0.5;`,
      )
  }
  return material
}

function buildLander(): {
  group: THREE.Group
  flame: THREE.Mesh
  light: THREE.PointLight
} {
  // Meters, local +y up. Oversized ~8x so it reads at kilometer viewing distances.
  const group = new THREE.Group()
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a640, metalness: 0.7, roughness: 0.35 })
  const silver = new THREE.MeshStandardMaterial({ color: 0xe8e6f2, metalness: 0.4, roughness: 0.4 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2738, metalness: 0.5, roughness: 0.5 })
  const accent = new THREE.MeshStandardMaterial({
    color: 0xffc94d,
    emissive: 0xffc94d,
    emissiveIntensity: 0.4,
  })

  const body = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 44, 8), gold)
  body.position.y = 62
  group.add(body)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(48, 40, 48), silver)
  cabin.position.y = 104
  cabin.rotation.y = Math.PI / 8
  group.add(cabin)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(49, 6, 49), accent)
  stripe.position.y = 112
  stripe.rotation.y = Math.PI / 8
  group.add(stripe)

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 30, 6), silver)
  antenna.position.set(14, 138, 0)
  group.add(antenna)
  const dish = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8, 0, Math.PI * 2, 0, 1.1), silver)
  dish.position.set(14, 150, 0)
  dish.rotation.x = Math.PI
  group.add(dish)

  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const top = new THREE.Vector3(Math.cos(a) * 38, 48, Math.sin(a) * 38)
    const foot = new THREE.Vector3(Math.cos(a) * 78, 4, Math.sin(a) * 78)
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, top.distanceTo(foot), 6),
      silver,
    )
    leg.position.copy(top).add(foot).multiplyScalar(0.5)
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize())
    group.add(leg)
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 3, 12), dark)
    pad.position.copy(foot)
    group.add(pad)
  }

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(9, 18, 18, 16, 1, true), dark)
  nozzle.position.y = 32
  group.add(nozzle)

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(16, 90, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffb46b,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  flame.rotation.x = Math.PI
  flame.position.y = 32 - 45
  group.add(flame)

  // Distance is in world units (the group is scaled): glow fades out ~1.5 km from the engine.
  const light = new THREE.PointLight(0xff9a6b, 0, 0.0009, 0)
  light.position.y = 10
  group.add(light)

  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== flame) o.castShadow = true
  })
  return { group, flame, light }
}

function buildFlag(logo: THREE.Texture): {
  group: THREE.Group
  pole: THREE.Group
  cloth: THREE.Mesh
} {
  const group = new THREE.Group()
  const pole = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0xdedbe8, metalness: 0.6, roughness: 0.3 })

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 160, 8), metal)
  mast.position.y = 80
  pole.add(mast)
  // Horizontal rod along the top, as on the Apollo flags: there is no wind to hold it out.
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 94, 8), metal)
  rod.rotation.z = Math.PI / 2
  rod.position.set(47, 158, 0)
  pole.add(rod)
  group.add(pole)

  const geometry = new THREE.PlaneGeometry(92, 92, 24, 24)
  const pos = geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    // Creases from being folded for launch, not wind ripples.
    pos.setZ(i, Math.sin(x * 0.17) * 1.6 + Math.sin(y * 0.11 + x * 0.05) * 1.1)
  }
  geometry.computeVertexNormals()
  geometry.translate(46, -46, 0)

  const cloth = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map: logo, side: THREE.DoubleSide, roughness: 0.8 }),
  )
  cloth.position.set(1, 157, 0)
  cloth.castShadow = true
  group.add(cloth)
  mast.castShadow = true
  return { group, pole, cloth }
}

export class MissionScene {
  private renderer: THREE.WebGLRenderer
  private labels: CSS2DRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, 1e-6, 2000)
  private clock = new THREE.Clock()
  private frame = 0
  private resizeObserver: ResizeObserver

  private sun = new THREE.DirectionalLight(0xfff4e6, 3.2)
  private sunGlow: THREE.Sprite
  private earth: THREE.Group
  private globe: THREE.Mesh

  private uniforms: HeatUniforms = {
    uField: { value: 0 },
    uPrevField: { value: -1 },
    uSweep: { value: 0 },
    uHeat: { value: 0 },
    uDim: { value: 0 },
    uSearchR: { value: 80 },
    uRamp: {
      value: [0, 0.25, 0.5, 0.75, 1].map((v) => {
        const [r, g, b] = rampColor(v)
        return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
      }),
    },
    uHole: { value: new THREE.Vector4() },
    uHoleOn: { value: 0 },
  }

  private data: SelectedLandingSearch | null = null
  private terrain: THREE.Mesh | null = null
  private siteTerrain: THREE.Mesh | null = null
  private site = new THREE.Vector3()
  private siteUp = new THREE.Vector3()
  private siteSide = new THREE.Vector3()
  private beams: { mesh: THREE.Mesh; label: CSS2DObject; rank: number }[] = []
  private coldTraps: THREE.Points | null = null
  private links: THREE.Line[] = []
  private lander: ReturnType<typeof buildLander>
  private flag: ReturnType<typeof buildFlag>
  private siteFrame = new THREE.Group()
  private dust: THREE.Points

  private startedAt: number | null = null
  private orbitAngle = 0.7
  private camTarget = new THREE.Vector3()
  private closeSunAzimuth = 0
  private focusFrom = new THREE.Vector3()
  private focusFromTarget = new THREE.Vector3()
  private onFrame: (info: FrameInfo) => void
  private lastEmit = 0

  constructor(container: HTMLElement, onFrame: (info: FrameInfo) => void) {
    this.onFrame = onFrame
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.setClearColor(0x05041a)
    container.appendChild(this.renderer.domElement)

    this.labels = new CSS2DRenderer()
    this.labels.domElement.className = 'mission-labels'
    container.appendChild(this.labels.domElement)

    this.camera.up.copy(UP_AT_POLE)
    this.scene.add(new THREE.AmbientLight(0x6b5fb0, 0.3))
    this.scene.add(new THREE.HemisphereLight(0x7fb8ff, 0x1a1440, 0.12))

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.scene.add(this.sun, this.sun.target)

    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,248,230,1)', 'rgba(255,201,77,0)'),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.sunGlow.scale.setScalar(60)
    this.scene.add(this.sunGlow)

    this.scene.add(this.buildStars())
    this.globe = this.buildGlobe(90)
    this.scene.add(this.globe)
    this.earth = this.buildEarth()
    this.scene.add(this.earth)

    const logo = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}noctis-logo.png`)
    logo.colorSpace = THREE.SRGBColorSpace
    this.lander = buildLander()
    this.flag = buildFlag(logo)
    this.siteFrame.add(this.lander.group, this.flag.group)
    this.siteFrame.scale.setScalar(M_TO_UNITS)
    this.siteFrame.visible = false
    this.scene.add(this.siteFrame)

    this.dust = this.buildDust()
    this.siteFrame.add(this.dust)

    this.setSun(0.9, SUN_ELEVATION_DEG)
    this.camera.position.set(2.4, -2.0, 2.2)
    this.camTarget.set(0, 0, 0)

    this.resizeObserver = new ResizeObserver(() => this.resize(container))
    this.resizeObserver.observe(container)
    this.resize(container)
    this.loop()
  }

  // --- construction -----------------------------------------------------------------------

  private buildStars(): THREE.Points {
    const count = 5000
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const tint = [new THREE.Color(0xffffff), new THREE.Color(0xffdcb4), new THREE.Color(0xb9c8ff)]
    const v = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(900)
      positions.set([v.x, v.y, v.z], i * 3)
      const c = tint[i % 3].clone().multiplyScalar(0.4 + Math.random() * 0.6)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true }),
    )
  }

  private buildGlobe(capKm: number): THREE.Mesh {
    const texture = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}textures/moon-color-1k.jpg`,
    )
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    const cap = (capKm / R_KM) * 0.985
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1 - 2e-5, 192, 96, 0, Math.PI * 2, 0, Math.PI - cap),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 }),
    )
    globe.receiveShadow = true
    return globe
  }

  private buildEarth(): THREE.Group {
    const group = new THREE.Group()
    const el = THREE.MathUtils.degToRad(EARTH_ELEVATION_DEG)
    // Seen from the south pole, the Earth hangs low over the 0°E meridian (world +x).
    group.position
      .set(Math.cos(el), 0, 0)
      .addScaledVector(UP_AT_POLE, Math.sin(el))
      .multiplyScalar(EARTH_DISTANCE)
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 48, 24),
      new THREE.MeshStandardMaterial({
        color: 0x3f7fe0,
        emissive: 0x1d3f8a,
        emissiveIntensity: 1.2,
        roughness: 0.6,
      }),
    )
    group.add(planet)
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('rgba(127,184,255,0.9)', 'rgba(127,184,255,0)'),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    halo.scale.setScalar(EARTH_RADIUS * 5)
    group.add(halo)
    return group
  }

  private buildDust(): THREE.Points {
    const count = 400
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      seeds.set([Math.random() * Math.PI * 2, 0.4 + Math.random() * 0.6], i * 2)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.userData.seeds = seeds
    const dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xc9c2e0,
        size: 3,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    )
    return dust
  }

  setData(data: SelectedLandingSearch): void {
    this.data = data
    this.uniforms.uSearchR.value = data.radius_km

    // Replace the globe so its hole matches this terrain's radius.
    this.scene.remove(this.globe)
    this.globe = this.buildGlobe(data.terrain.half_size_km)
    this.scene.add(this.globe)

    const { geometry, xs, ys } = buildTerrainGeometry(data.terrain, 0, 0, data.terrain.half_size_km)
    this.addScores(geometry, data, xs, ys)
    this.terrain = new THREE.Mesh(geometry, heatMaterial(this.uniforms, 0x8d8a98))
    this.terrain.castShadow = true
    this.terrain.receiveShadow = true
    this.scene.add(this.terrain)

    const st = data.site_terrain
    const fine = buildTerrainGeometry(st, st.center_x_km, st.center_y_km, null)
    this.addScores(fine.geometry, data, fine.xs, fine.ys)
    this.siteTerrain = new THREE.Mesh(
      fine.geometry,
      heatMaterial({ ...this.uniforms, uHoleOn: { value: 0 }, uHeat: { value: 0 } }, 0x8d8a98),
    )
    this.siteTerrain.castShadow = true
    this.siteTerrain.receiveShadow = true
    this.siteTerrain.visible = false
    this.scene.add(this.siteTerrain)
    const inset = st.cell_m / 1000
    this.uniforms.uHole.value.set(
      st.center_x_km - st.half_size_km + inset,
      st.center_x_km + st.half_size_km - inset,
      st.center_y_km - st.half_size_km + inset,
      st.center_y_km + st.half_size_km - inset,
    )

    const center = Math.floor(st.heights_m.length / 2)
    toWorld(st.center_x_km, st.center_y_km, st.heights_m[center], this.site)
    this.siteUp.copy(this.site).normalize()
    // A horizontal direction at the site, pointing away from the pole.
    this.siteSide.subVectors(this.site, POLE).projectOnPlane(this.siteUp).normalize()
    this.siteFrame.position.copy(this.site)
    this.siteFrame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.siteUp)
    this.siteFrame.rotateY(-0.6)

    // Plant the flag beside the lander, cloth facing the closing camera, and light the
    // scene from over the camera's shoulder so neither is backlit.
    const toCamera = this.siteSide
      .clone()
      .applyQuaternion(this.siteFrame.quaternion.clone().invert())
      .setY(0)
      .normalize()
    const theta = Math.atan2(toCamera.x, toCamera.z)
    const right = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta))
    // Left of the lander on screen: the result card covers the right side. The cloth hangs
    // toward the lander, so leave room for it.
    this.flag.group.position.copy(right).multiplyScalar(-210).addScaledVector(toCamera, 70)
    this.flag.group.rotation.y = theta
    this.closeSunAzimuth = Math.atan2(this.siteSide.z, this.siteSide.x) + 0.75

    this.buildMarkers(data)
    this.reset()
  }

  private addScores(
    geometry: THREE.BufferGeometry,
    data: SelectedLandingSearch,
    xs: Float32Array,
    ys: Float32Array,
  ): void {
    const sample = makeGridSampler(data)
    const p = data.points
    const eligible = p.eligible.map((e) => (e ? 1 : 0))
    const n = xs.length
    const a = new Float32Array(n * 4)
    const b = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const x = xs[i]
      const y = ys[i]
      a[i * 4] = sample(p.score_terrain, x, y) ?? 0
      a[i * 4 + 1] = sample(p.score_light, x, y) ?? 0
      a[i * 4 + 2] = sample(p.score_comm, x, y) ?? 0
      a[i * 4 + 3] = sample(p.score_resources, x, y) ?? 0
      b[i * 4] = sample(p.total, x, y) ?? 0
      b[i * 4 + 1] = sweepFraction(x, y)
      b[i * 4 + 2] = (sample(eligible, x, y) ?? 0) > 0.5 ? 1 : 0
    }
    geometry.setAttribute('scoreA', new THREE.BufferAttribute(a, 4))
    geometry.setAttribute('scoreB', new THREE.BufferAttribute(b, 4))
  }

  private buildMarkers(data: SelectedLandingSearch): void {
    for (const beam of this.beams) {
      this.scene.remove(beam.mesh)
      beam.mesh.remove(beam.label)
    }
    this.beams = []
    const p = data.points
    const ranking = data.ranking.length ? data.ranking : [data.best]
    ranking.forEach((index, rank) => {
      const base = toWorld(p.x_km[index], p.y_km[index], p.alt_m[index])
      const up = base.clone().normalize()
      const height = rank === 0 ? 0.03 : 0.016
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.00022, 0.00022, height, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: rank === 0 ? 0xffc94d : 0xff9a6b,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      mesh.position.copy(base).addScaledVector(up, height / 2)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
      mesh.visible = false
      const div = document.createElement('div')
      div.className = rank === 0 ? 'site-label site-label-best' : 'site-label'
      div.textContent =
        rank === 0 ? `#1 · ${formatLat(p.lat[index])} ${formatLon(p.lon[index])}` : `#${rank + 1}`
      const label = new CSS2DObject(div)
      // Halfway up the beam: stays in frame while the camera closes in.
      label.position.set(0, rank === 0 ? 0 : height / 2, 0)
      mesh.add(label)
      label.visible = false
      this.scene.add(mesh)
      this.beams.push({ mesh, label, rank })
    })

    if (this.coldTraps) this.scene.remove(this.coldTraps)
    const cold: number[] = []
    const fracs: number[] = []
    const v = new THREE.Vector3()
    p.cold_trap.forEach((isCold, i) => {
      if (!isCold) return
      toWorld(p.x_km[i], p.y_km[i], p.alt_m[i] + 400, v)
      cold.push(v.x, v.y, v.z)
      fracs.push(sweepFraction(p.x_km[i], p.y_km[i]))
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(cold, 3))
    geometry.userData.fracs = fracs
    this.coldTraps = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x7fe0ff,
        size: 7,
        sizeAttenuation: false,
        map: glowTexture('rgba(255,255,255,1)', 'rgba(127,224,255,0)'),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.scene.add(this.coldTraps)

    for (const line of this.links) this.scene.remove(line)
    this.links = []
    const byComm = p.score_comm
      .map((s, i) => [s, i] as const)
      .sort((x, y) => y[0] - x[0])
      .slice(0, 10)
    for (const [, i] of byComm) {
      const from = toWorld(p.x_km[i], p.y_km[i], p.alt_m[i] + 300)
      const to = from.clone().lerp(this.earth.position, 0.0016)
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        new THREE.LineDashedMaterial({
          color: 0x7fb8ff,
          dashSize: 0.004,
          gapSize: 0.003,
          transparent: true,
          opacity: 0,
        }),
      )
      line.computeLineDistances()
      this.links.push(line)
      this.scene.add(line)
    }
  }

  // --- control ----------------------------------------------------------------------------

  /** Play from the beginning, or from `offsetSeconds` in (handy for rehearsing a stage). */
  start(offsetSeconds = 0): void {
    if (!this.data) return
    this.reset()
    this.focusFrom.copy(this.camera.position)
    this.focusFromTarget.copy(this.camTarget)
    this.orbitAngle = Math.atan2(this.camera.position.z, this.camera.position.x)
    this.startedAt = this.clock.getElapsedTime() - Math.max(0, offsetSeconds)
  }

  reset(): void {
    this.startedAt = null
    this.uniforms.uHeat.value = 0
    this.uniforms.uSweep.value = 0
    this.uniforms.uPrevField.value = -1
    this.uniforms.uDim.value = 0
    this.uniforms.uHoleOn.value = 0
    if (this.siteTerrain) this.siteTerrain.visible = false
    this.siteFrame.visible = false
    for (const beam of this.beams) {
      beam.mesh.visible = false
      beam.label.visible = false
    }
    this.setSun(0.9, SUN_ELEVATION_DEG)
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.domElement.remove()
  }

  private resize(container: HTMLElement): void {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    this.renderer.setSize(w, h)
    this.labels.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Sun direction from its azimuth around the pole (radians) and elevation (degrees). */
  private setSun(azimuth: number, elevationDeg: number, focus: THREE.Vector3 = POLE): void {
    const el = THREE.MathUtils.degToRad(elevationDeg)
    const dir = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth))
      .multiplyScalar(Math.cos(el))
      .addScaledVector(UP_AT_POLE, Math.sin(el))
    this.sun.target.position.copy(focus)
    this.sun.position.copy(focus).addScaledVector(dir, 0.5)
    this.sunGlow.position.copy(dir).multiplyScalar(700)
    const cam = this.sun.shadow.camera
    const wide = focus === POLE
    const half = wide ? 0.06 : 0.004
    // Biases in world units: ~90 m for the whole region, ~5 m for the close-up.
    this.sun.shadow.bias = wide ? -0.0002 : -0.00002
    this.sun.shadow.normalBias = wide ? 0.00005 : 0.000003
    cam.left = cam.bottom = -half
    cam.right = cam.top = half
    cam.near = 0.01
    cam.far = 1.0
    cam.updateProjectionMatrix()
  }

  // --- animation --------------------------------------------------------------------------

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop)
    const dt = Math.min(0.1, this.clock.getDelta())
    const now = this.clock.getElapsedTime()
    const t = this.startedAt === null ? null : now - this.startedAt
    this.update(t, dt, now)
    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
  }

  private update(t: number | null, dt: number, now: number): void {
    const desiredPos = new THREE.Vector3()
    const desiredTarget = new THREE.Vector3()
    let follow = 1 - Math.exp(-dt * 1.8)

    if (t === null) {
      // Idle: slow orbit around the Moon, south pole on top.
      const a = now * 0.06
      desiredPos.set(Math.cos(a) * 3.1, -1.9, Math.sin(a) * 3.1)
      desiredTarget.set(0, -0.15, 0)
      this.emit({ playing: false, done: false, stageIndex: -1, progress: 0, sweep: 0 }, now)
    } else {
      const done = t >= TOTAL_SECONDS
      const { index, progress } = stageAt(Math.min(t, TOTAL_SECONDS - 1e-6))
      const stage = STAGES[index]
      this.orbitAngle += dt * 0.025

      this.updateHeat(stage.field, index, progress)
      const sweep = this.uniforms.uSweep.value
      this.updateExtras(stage.id, progress, now, sweep)

      const poleView = (alt: number, dist: number, angle: number) =>
        desiredPos
          .copy(POLE)
          .addScaledVector(UP_AT_POLE, alt)
          .add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist))

      switch (stage.id) {
        case 'focus': {
          // Explicit ease so the flight from orbit is one smooth move.
          const k = ease(progress)
          poleView(0.11, 0.13, this.orbitAngle)
          desiredPos.lerpVectors(this.focusFrom, desiredPos, k)
          desiredTarget.lerpVectors(this.focusFromTarget, POLE, k)
          follow = 1
          break
        }
        case 'comm': {
          // Low over the ice, looking toward the Earth on the horizon.
          desiredPos.copy(POLE).add(new THREE.Vector3(-0.13, -0.045, 0.03))
          desiredTarget.copy(POLE).add(new THREE.Vector3(0.05, 0, 0))
          break
        }
        case 'select': {
          if (progress < 0.45) {
            poleView(0.12, 0.11, this.orbitAngle)
            desiredTarget.copy(POLE)
          } else {
            desiredPos
              .copy(this.site)
              .addScaledVector(this.siteUp, 0.03)
              .addScaledVector(this.siteSide, 0.032)
            desiredTarget.copy(this.site)
          }
          break
        }
        case 'landing':
        case 'flag': {
          const spin = stage.id === 'flag' ? progress * 0.9 : 0
          const side = this.siteSide.clone().applyAxisAngle(this.siteUp, spin - 0.35)
          const dist = stage.id === 'flag' ? 0.00048 : 0.0006
          desiredPos
            .copy(this.site)
            .addScaledVector(this.siteUp, dist * 0.55)
            .addScaledVector(side, dist)
          desiredTarget.copy(this.site).addScaledVector(this.siteUp, 0.00004)
          follow = 1 - Math.exp(-dt * (stage.id === 'landing' && progress < 0.4 ? 1.2 : 2.5))
          break
        }
        default:
          poleView(0.1, 0.12, this.orbitAngle)
          desiredTarget.copy(POLE)
      }

      this.emit({ playing: !done, done, stageIndex: index, progress, sweep }, now, done)
    }

    this.camera.position.lerp(desiredPos, follow)
    this.camTarget.lerp(desiredTarget, follow)
    this.camera.up.copy(this.camTarget.lengthSq() > 0.5 ? this.camTarget : UP_AT_POLE)
    if (this.camTarget.lengthSq() > 0.5) this.camera.up.normalize()
    this.camera.lookAt(this.camTarget)
  }

  private updateHeat(field: FieldKey | undefined, index: number, progress: number): void {
    const u = this.uniforms
    const stage = STAGES[index]
    if (field) {
      const sweepSeconds = stage.id === 'select' ? 0.3 : 0.8
      u.uField.value = FIELD_INDEX[field]
      u.uSweep.value = Math.min(1.2, progress / sweepSeconds)
      if (progress >= sweepSeconds) u.uSweep.value = 1.2
      const prev = STAGES[index - 1]?.field
      u.uPrevField.value = prev ? FIELD_INDEX[prev] : -1
      u.uHeat.value = 1
      u.uDim.value = stage.id === 'select' ? clamp01((progress - 0.3) / 0.15) : 0
    } else if (stage.id === 'focus') {
      u.uHeat.value = 0
    } else {
      // Landing and flag: fade the map out as we get close.
      u.uField.value = FIELD_INDEX.total
      u.uPrevField.value = FIELD_INDEX.total
      u.uSweep.value = 1.2
      u.uHeat.value = stage.id === 'landing' ? 0.6 * (1 - clamp01(progress / 0.4)) : 0
    }
  }

  private updateExtras(stage: string, progress: number, now: number, sweep: number): void {
    // Sun: one compressed lunar day during the illumination scan, then fixed.
    if (stage === 'light') {
      this.setSun(0.9 + progress * Math.PI * 2, SUN_ELEVATION_DEG)
    } else if (stage === 'landing' || stage === 'flag') {
      this.setSun(this.closeSunAzimuth, 6, this.site)
    } else {
      this.setSun(0.9, SUN_ELEVATION_DEG)
    }

    // Earth-link beams.
    const linkOpacity =
      stage === 'comm' ? clamp01(progress * 3) * (0.55 + 0.35 * Math.sin(now * 6)) : 0
    for (const line of this.links) {
      const m = line.material as THREE.LineDashedMaterial
      m.opacity = linkOpacity
      line.visible = linkOpacity > 0.01
    }

    // Cold traps light up behind the sweep during the resources scan and stay faintly after.
    if (this.coldTraps) {
      const m = this.coldTraps.material as THREE.PointsMaterial
      const visible = stage === 'resources' || stage === 'select'
      m.opacity = visible ? (stage === 'resources' ? 0.6 + 0.4 * Math.sin(now * 5) : 0.35) : 0
      this.coldTraps.visible = visible
      const fracs = this.coldTraps.geometry.userData.fracs as number[]
      const count = stage === 'resources' ? fracs.filter((f) => f <= sweep).length : fracs.length
      this.coldTraps.geometry.setDrawRange(0, count)
    }

    // Candidate beams.
    for (const beam of this.beams) {
      const show = stage === 'select' && progress > 0.32
      const m = beam.mesh.material as THREE.MeshBasicMaterial
      const appear = clamp01((progress - 0.32 - beam.rank * 0.03) / 0.08)
      beam.mesh.visible = show
      beam.label.visible = show && appear > 0.5 && (beam.rank === 0 || progress < 0.5)
      m.opacity = show ? appear * (beam.rank === 0 ? 0.6 + 0.4 * Math.sin(now * 7) : 0.65) : 0
    }

    // Close-up terrain and the lander.
    const close = stage === 'landing' || stage === 'flag'
    this.uniforms.uHoleOn.value = close ? 1 : 0
    if (this.siteTerrain) this.siteTerrain.visible = close
    this.siteFrame.visible = close
    if (!close) return

    const { group, flame, light } = this.lander
    const touchdown = 0.72
    if (stage === 'landing') {
      const k = easeOut(clamp01(progress / touchdown))
      group.position.set((1 - k) * 600, (1 - k) * 2600, (1 - k) * -300)
      const burning = progress < touchdown + 0.03
      flame.visible = burning
      flame.scale.set(1, 0.7 + 0.5 * Math.random() * (1 - k * 0.5), 1)
      light.intensity = burning ? 2.5 : 0
      this.flag.group.visible = false
      this.updateDust(clamp01((progress - touchdown) / (1 - touchdown)))
    } else {
      group.position.set(0, 0, 0)
      flame.visible = false
      light.intensity = 0
      this.updateDust(1)
      this.flag.group.visible = true
      const rise = easeOut(clamp01(progress / 0.35))
      this.flag.pole.scale.set(1, Math.max(0.001, rise), 1)
      const unfurl = easeOut(clamp01((progress - 0.3) / 0.3))
      this.flag.cloth.scale.set(Math.max(0.001, unfurl), 1, 1)
      this.flag.cloth.visible = unfurl > 0.001
    }
  }

  private updateDust(k: number): void {
    const geometry = this.dust.geometry
    const seeds = geometry.userData.seeds as Float32Array
    const pos = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const a = seeds[i * 2]
      const s = seeds[i * 2 + 1]
      const r = 40 + k * 420 * s
      pos.setXYZ(i, Math.cos(a) * r, 6 + Math.sin(k * Math.PI) * 30 * s, Math.sin(a) * r)
    }
    pos.needsUpdate = true
    const m = this.dust.material as THREE.PointsMaterial
    m.opacity = k > 0 && k < 1 ? 0.8 * (1 - k) : 0
  }

  private emit(info: FrameInfo, now: number, force = false): void {
    if (!force && now - this.lastEmit < 0.08) return
    this.lastEmit = now
    this.onFrame(info)
  }
}
