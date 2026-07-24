import type { Citizen } from '../../types'
import type { CityLayout } from '../../lib/cityLayout'
import { matchDistrict } from '../../lib/cityLayout'
import { hashString, mulberry32 } from '../../lib/rng'

// ─── Crowd placement ──────────────────────────────────────────────────────────
// Assigns each citizen a stable position: inside their matched district (using
// that district's pre-sampled citizen spots), or into a "plaza" strip along the
// bottom edge if their location doesn't match any district.

export interface CrowdDot {
  id: string
  name: string
  x: number
  y: number
  alignment: number   // -100..100 (base color)
  weight: number      // population_weight (base size)
}

export function buildCrowd(citizens: Citizen[], layout: CityLayout): CrowdDot[] {
  const perDistrict = new Map<number, number>()   // next spot index per district
  const plazaY = layout.height - 26
  let plazaCount = 0
  const dots: CrowdDot[] = []

  for (const c of citizens) {
    const rng = mulberry32(hashString(c.id))
    const di = matchDistrict(c.demographics.location, layout.districts)
    if (di >= 0) {
      const district = layout.districts[di]
      const spots = district.citizenSpots
      const used = perDistrict.get(di) ?? 0
      const spot = spots.length > 0 ? spots[used % spots.length] : district.centroid
      perDistrict.set(di, used + 1)
      // small deterministic jitter so stacked citizens on the same spot separate
      dots.push({
        id: c.id,
        name: c.name,
        x: spot[0] + (rng() - 0.5) * 14,
        y: spot[1] + (rng() - 0.5) * 14,
        alignment: c.mayor_alignment,
        weight: c.wellbeing >= 0 ? Math.max(0.008, 1 / Math.max(citizens.length, 1)) : 0.02,
      })
    } else {
      // plaza strip
      const col = plazaCount++
      const cols = 26
      const x = 40 + (col % cols) * ((layout.width - 80) / cols)
      const y = plazaY + Math.floor(col / cols) * 16
      dots.push({
        id: c.id,
        name: c.name,
        x,
        y,
        alignment: c.mayor_alignment,
        weight: 0.02,
      })
    }
  }
  return dots
}

/** Base dot color from mayor alignment. */
export function alignmentColor(alignment: number): string {
  if (alignment > 30) return '#22c55e'
  if (alignment > 5) return '#65a30d'
  if (alignment > -5) return '#94a3b8'
  if (alignment > -30) return '#f59e0b'
  return '#f87171'
}
