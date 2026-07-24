// ─── Map color helpers ────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  return rgbToHex([ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t])
}

// dim-navy (struggling) → amber (strained) → green (thriving)
const RAMP: [number, string][] = [
  [0, '#131c30'],
  [30, '#27314a'],
  [50, '#4a4226'],
  [70, '#20503c'],
  [100, '#2b7050'],
]

/** District fill from avg wellbeing (0-100). */
export function wellbeingFill(wb: number): string {
  const v = Math.max(0, Math.min(100, wb))
  for (let i = 1; i < RAMP.length; i++) {
    const [t0, c0] = RAMP[i - 1]
    const [t1, c1] = RAMP[i]
    if (v <= t1) return mix(c0, c1, (v - t0) / (t1 - t0))
  }
  return RAMP[RAMP.length - 1][1]
}

/** Window glow intensity from wellbeing. */
export function windowOpacity(wb: number): number {
  return 0.25 + 0.65 * Math.max(0, Math.min(1, wb / 100))
}
