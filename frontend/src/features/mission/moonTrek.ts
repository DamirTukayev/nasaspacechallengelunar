/** Verified against the layer's WMTSCapabilities.xml and Moon Trek polar catalog.
 * Moon2000 south-polar stereographic: R=1737400 m, +x=90°E, +y=0°E.
 * The WMTS advertises EPSG:0; the catalog identifies IAU2000:30120.
 */
export const MOON_TREK_CAPABILITIES =
  'https://trek.nasa.gov/tiles/Moon/SP/LRO_LOLA_Shade_SPole45_100mp_v04/1.0.0/WMTSCapabilities.xml'
const BASE =
  'https://trek.nasa.gov/tiles/Moon/SP/LRO_LOLA_Shade_SPole45_100mp_v04/1.0.0/default/default028mm'
const ORIGIN_KM = 1095.93
// Level 4: scale denominator 1911150.2511160688 * 0.00028 m/px * 256 px.
const TILE_KM = 136.99125

export function moonTrekTiles(halfKm: number) {
  if (!Number.isFinite(halfKm) || halfKm <= 0 || halfKm > 150) return []
  const first = Math.floor((ORIGIN_KM - halfKm) / TILE_KM)
  const last = Math.ceil((ORIGIN_KM + halfKm) / TILE_KM) - 1
  const tiles = []
  for (let row = first; row <= last; row++)
    for (let col = first; col <= last; col++) {
      tiles.push({
        url: `${BASE}/4/${row}/${col}.png`,
        leftKm: -ORIGIN_KM + col * TILE_KM,
        topKm: ORIGIN_KM - row * TILE_KM,
        sizeKm: TILE_KM,
      })
    }
  return tiles
}
