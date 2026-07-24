import type {
  GameState, Minister, Policy, MediaHeadline, WardReportEntry,
  AdvisorStance, StanceValue,
} from '../types'

// ─── numeric helpers ──────────────────────────────────────────────────────────

export function avg(vals: number[]) {
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function fmtNum(n: number) {
  return Math.round(n).toLocaleString()
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const arr = [...values].sort((a, b) => a - b)
  const mid = Math.floor(arr.length / 2)
  if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2
  return arr[mid]
}

// ─── Welfare score helpers ────────────────────────────────────────────────────

export function deriveWelfare(cp: GameState['city_params']) {
  return {
    health: avg([cp.hospitals_and_clinics, cp.air_quality_and_pollution]),
    wealth: avg([cp.jobs_and_commerce, cp.affordable_housing]),
    safety: avg([cp.police_and_emergency, cp.courts_and_legal]),
    social: avg([cp.community_and_spaces, cp.schools_and_universities]),
  }
}

export function welfareDelta(after: Record<string, number>, before: Record<string, number>) {
  const avgBefore = (keys: string[]) => avg(keys.map(k => before[k] ?? 50))
  const avgAfter = (keys: string[]) => avg(keys.map(k => after[k] ?? 50))
  return {
    health: avgAfter(['hospitals_and_clinics', 'air_quality_and_pollution']) - avgBefore(['hospitals_and_clinics', 'air_quality_and_pollution']),
    wealth: avgAfter(['jobs_and_commerce', 'affordable_housing']) - avgBefore(['jobs_and_commerce', 'affordable_housing']),
    safety: avgAfter(['police_and_emergency', 'courts_and_legal']) - avgBefore(['police_and_emergency', 'courts_and_legal']),
    social: avgAfter(['community_and_spaces', 'schools_and_universities']) - avgBefore(['community_and_spaces', 'schools_and_universities']),
  }
}

export function isHotspot(w: WardReportEntry): boolean {
  return w.trend === 'down' || w.hotspot === true
}

export function isBrightSpot(w: WardReportEntry): boolean {
  return w.trend === 'up' || w.bright_spot === true
}

export function isMediaHeadline(value: unknown): value is MediaHeadline {
  return !!value
    && typeof value === 'object'
    && typeof (value as MediaHeadline).outlet === 'string'
    && typeof (value as MediaHeadline).headline === 'string'
    && typeof (value as MediaHeadline).lean === 'string'
}

export function severityLabel(s: number): { label: string; bg: string; border: string; color: string } {
  if (s >= 70) return { label: 'HIGH', bg: 'rgba(239,68,68,0.15)', border: '#7f1d1d', color: '#f87171' }
  if (s >= 40) return { label: 'MEDIUM', bg: 'rgba(249,115,22,0.15)', border: '#7c2d12', color: '#fb923c' }
  return { label: 'LOW', bg: 'rgba(34,197,94,0.1)', border: '#14532d', color: '#4ade80' }
}

// ─── Agent portrait (Demographic Match) ──────────────────────────────────────

export function getPortraitForMinister(name: string, ministers: Minister[]): string {
  const m = ministers.find(can => can.name === name)
  if (!m) return '/agents/generic/generic_male_mid_1.png'

  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  h = Math.abs(h)

  const isFemale = h % 2 === 0
  const genderStr = isFemale ? 'female' : 'male'

  const ageGroup = m.demographics?.age_group || '36-50'
  let ageStr = 'mid'
  if (ageGroup.includes('18') || ageGroup.includes('25') || ageGroup.includes('26') || ageGroup.includes('35')) {
    ageStr = 'young'
  } else if (ageGroup.includes('51') || ageGroup.includes('65') || ageGroup.includes('+')) {
    ageStr = 'old'
  }

  let variant = 1
  if (ageStr === 'young' || ageStr === 'mid') {
    variant = ((h >> 1) % 2) + 1
  }

  return `/agents/generic/generic_${genderStr}_${ageStr}_${variant}.png`
}

// ─── Minister lookup helpers ──────────────────────────────────────────────────

export function findMinisterForPortfolio(ministers: Minister[], portfolio: string): Minister | undefined {
  return ministers.find(m => m.portfolio === portfolio || m.extra_portfolios?.includes(portfolio))
}

export function normaliseName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function mapPolicyAdvisorStances(ministers: Minister[], policy: Policy): AdvisorStance[] {
  const raw = Array.isArray(policy.advisor_stances) ? policy.advisor_stances : []
  if (raw.length === 0) return []

  const byName = new Map<string, Minister>()
  for (const minister of ministers) {
    byName.set(normaliseName(minister.name), minister)
  }

  const seen = new Set<string>()
  const mapped: AdvisorStance[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rawName = typeof item.minister_name === 'string'
      ? item.minister_name
      : (typeof item.ministerName === 'string' ? item.ministerName : '')
    const minister = byName.get(normaliseName(rawName))
    if (!minister) continue
    if (seen.has(minister.id)) continue

    const stanceRaw = typeof item.stance === 'string' ? item.stance.trim().toLowerCase() : ''
    if (stanceRaw !== 'approve' && stanceRaw !== 'disapprove') continue

    const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
    if (!reason) continue

    mapped.push({
      ministerId: minister.id,
      ministerName: minister.name,
      stance: stanceRaw as StanceValue,
      reason,
    })
    seen.add(minister.id)
  }
  return mapped
}
