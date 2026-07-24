// ─── Shared style tokens ──────────────────────────────────────────────────────

export const PANEL = {
  background: 'linear-gradient(180deg, #0b1929 0%, #091422 100%)',
  border: '1px solid #1c3652',
  borderRadius: 6,
} as const

export const HDR_LABEL = {
  fontFamily: "'Rajdhani', sans-serif",
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '0.15em',
  color: '#e8a030',
} as const

export const MONO = (color = '#fff') => ({
  fontFamily: "'Share Tech Mono', monospace",
  color,
} as const)
