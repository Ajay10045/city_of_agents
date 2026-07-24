// ─── Procedural city map layout ───────────────────────────────────────────────
// Turns the game's named zones (from the ward report) into a deterministic,
// organic-looking district map: seeded site placement → Voronoi → Lloyd
// relaxation → inset + corner smoothing. Pure & memoizable: same city name +
// zone list always yields the same layout.

import { Delaunay } from 'd3-delaunay'
import { hashString, mulberry32 } from './rng'

export const MAP_W = 1000
export const MAP_H = 640

export interface ZoneInput {
  name: string
  populationPct: number   // 0-100
}

export interface BuildingSpot {
  x: number
  y: number
  w: number
  h: number
}

export interface DistrictLayout {
  name: string
  polygon: [number, number][]
  path: string                       // smoothed SVG path
  centroid: [number, number]
  buildingSpots: BuildingSpot[]
  citizenSpots: [number, number][]   // deterministic anchor points for citizen dots
  populationPct: number
}

export interface CityLayout {
  width: number
  height: number
  districts: DistrictLayout[]
}

// Zones matching these read as peripheral → biased toward the map edge.
const EDGE_KEYWORDS = ['industrial', 'outskirt', 'suburb', 'rural', 'port', 'airport', 'fringe']

function isEdgeZone(name: string): boolean {
  const lower = name.toLowerCase()
  return EDGE_KEYWORDS.some(k => lower.includes(k))
}

function polygonCentroid(poly: [number, number][]): [number, number] {
  let x = 0, y = 0, a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    const cross = x0 * y1 - x1 * y0
    a += cross
    x += (x0 + x1) * cross
    y += (y0 + y1) * cross
  }
  a *= 0.5
  if (Math.abs(a) < 1e-6) return poly[0]
  return [x / (6 * a), y / (6 * a)]
}

export function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Move each vertex toward the centroid by `inset` px (soft shrink). */
function insetPolygon(poly: [number, number][], inset: number): [number, number][] {
  const [cx, cy] = polygonCentroid(poly)
  return poly.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy) || 1
    const f = Math.max(0, (d - inset) / d)
    return [cx + dx * f, cy + dy * f] as [number, number]
  })
}

/** Corner-cut smoothing → quadratic beziers through edge midpoints. */
function smoothPath(poly: [number, number][]): string {
  const n = poly.length
  if (n < 3) return ''
  const mid = (i: number): [number, number] => {
    const [x0, y0] = poly[i % n]
    const [x1, y1] = poly[(i + 1) % n]
    return [(x0 + x1) / 2, (y0 + y1) / 2]
  }
  let d = `M${mid(0)[0].toFixed(1)},${mid(0)[1].toFixed(1)}`
  for (let i = 1; i <= n; i++) {
    const [px, py] = poly[i % n]
    const [mx, my] = mid(i)
    d += ` Q${px.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`
  }
  return d + ' Z'
}

/** Rejection-sample `count` points inside the polygon. */
function samplePoints(
  poly: [number, number][],
  count: number,
  rng: () => number,
  minDist = 0,
): [number, number][] {
  const xs = poly.map(p => p[0])
  const ys = poly.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  const pts: [number, number][] = []
  let attempts = 0
  while (pts.length < count && attempts < count * 60) {
    attempts++
    const x = x0 + rng() * (x1 - x0)
    const y = y0 + rng() * (y1 - y0)
    if (!pointInPolygon(x, y, poly)) continue
    if (minDist > 0 && pts.some(([px, py]) => Math.hypot(px - x, py - y) < minDist)) continue
    pts.push([x, y])
  }
  return pts
}

/**
 * Build the deterministic city layout.
 * Zones are placed by best-candidate sampling (top-population zone biased to
 * the center, industrial/outskirt zones to the edge), turned into Voronoi
 * cells, relaxed, then inset + smoothed into organic blobs.
 */
export function buildCityLayout(cityName: string, zones: ZoneInput[]): CityLayout {
  const safeZones = zones.length > 0 ? zones : [{ name: 'City Centre', populationPct: 100 }]
  const rng = mulberry32(hashString(cityName + '::' + safeZones.map(z => z.name).join('|')))
  const sorted = [...safeZones].sort((a, b) => b.populationPct - a.populationPct)

  const cx = MAP_W / 2
  const cy = MAP_H / 2
  const margin = 90

  // ── Site placement: best-candidate sampling with center/edge bias ──
  const sites: [number, number][] = []
  sorted.forEach((zone, idx) => {
    const edge = isEdgeZone(zone.name)
    const centerBias = idx === 0 && !edge
    let best: [number, number] | null = null
    let bestScore = -Infinity
    const candidates = sites.length === 0 ? 1 : 14
    for (let c = 0; c < candidates; c++) {
      let x: number, y: number
      if (centerBias) {
        x = cx + (rng() - 0.5) * MAP_W * 0.25
        y = cy + (rng() - 0.5) * MAP_H * 0.25
      } else if (edge) {
        // ring near the boundary
        const angle = rng() * Math.PI * 2
        const rx = (MAP_W / 2 - margin) * (0.75 + rng() * 0.25)
        const ry = (MAP_H / 2 - margin) * (0.75 + rng() * 0.25)
        x = cx + Math.cos(angle) * rx
        y = cy + Math.sin(angle) * ry
      } else {
        x = margin + rng() * (MAP_W - margin * 2)
        y = margin + rng() * (MAP_H - margin * 2)
      }
      const minD = sites.length === 0
        ? Infinity
        : Math.min(...sites.map(([sx, sy]) => Math.hypot(sx - x, sy - y)))
      if (minD > bestScore) {
        bestScore = minD
        best = [x, y]
      }
    }
    sites.push(best ?? [cx, cy])
  })

  // ── Voronoi + Lloyd relaxation ──
  const bounds: [number, number, number, number] = [24, 24, MAP_W - 24, MAP_H - 24]
  let currentSites = sites
  let voronoi = Delaunay.from(currentSites).voronoi(bounds)
  for (let iter = 0; iter < 2; iter++) {
    currentSites = currentSites.map((site, i) => {
      const cell = voronoi.cellPolygon(i)
      if (!cell) return site
      return polygonCentroid(cell.map(p => [p[0], p[1]] as [number, number]))
    })
    voronoi = Delaunay.from(currentSites).voronoi(bounds)
  }

  // ── Cells → organic district blobs ──
  const districts: DistrictLayout[] = sorted.map((zone, i) => {
    const rawCell = voronoi.cellPolygon(i)
    const cell: [number, number][] = rawCell
      ? rawCell.slice(0, -1).map(p => [p[0], p[1]] as [number, number])  // drop closing dup
      : [[cx - 80, cy - 60], [cx + 80, cy - 60], [cx + 80, cy + 60], [cx - 80, cy + 60]]
    const inset = insetPolygon(cell, 7)
    const centroid = polygonCentroid(inset)

    // Density conveys population: more buildings in populous zones.
    const buildingCount = Math.max(5, Math.min(26, Math.round(zone.populationPct * 0.7 + 4)))
    const buildingSpots: BuildingSpot[] = samplePoints(inset, buildingCount, rng, 26)
      .map(([x, y]) => ({
        x,
        y,
        w: 7 + rng() * 9,
        h: 9 + rng() * 20,
      }))
      .sort((a, b) => a.y - b.y)   // painter's order

    const citizenSpots = samplePoints(inset, 24, rng, 18)

    return {
      name: zone.name,
      polygon: inset,
      path: smoothPath(inset),
      centroid,
      buildingSpots,
      citizenSpots,
      populationPct: zone.populationPct,
    }
  })

  return { width: MAP_W, height: MAP_H, districts }
}

/**
 * Fuzzy-match a citizen's location string to a district.
 * Returns the district index or -1 (→ caller places them in the plaza strip).
 */
export function matchDistrict(location: string, districts: DistrictLayout[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const loc = norm(location)
  if (!loc) return -1
  // exact, then containment either way, then shared-word overlap
  let idx = districts.findIndex(d => norm(d.name) === loc)
  if (idx >= 0) return idx
  idx = districts.findIndex(d => norm(d.name).includes(loc) || loc.includes(norm(d.name)))
  if (idx >= 0) return idx
  const locWords = new Set(loc.split(' ').filter(w => w.length > 2))
  let bestIdx = -1
  let bestOverlap = 0
  districts.forEach((d, i) => {
    const words = norm(d.name).split(' ').filter(w => w.length > 2)
    const overlap = words.filter(w => locWords.has(w)).length
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      bestIdx = i
    }
  })
  return bestOverlap > 0 ? bestIdx : -1
}
