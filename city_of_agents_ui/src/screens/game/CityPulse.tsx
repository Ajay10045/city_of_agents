import type { CityPulseSignal } from '../../types'

const BAND = {
  stable: { a: '#22c55e', b: '#86efac', text: 'STABLE' },
  fragile: { a: '#f59e0b', b: '#facc15', text: 'FRAGILE' },
  stressed: { a: '#ef4444', b: '#fb7185', text: 'STRESSED' },
} as const

export default function CityPulse({ signal }: { signal?: CityPulseSignal }) {
  const s = signal ?? { band: 'stable', trend: 'steady', intensity: 20 }
  const cfg = BAND[s.band]
  const pulseClass = s.trend === 'rising' ? 'coa-pulse-fast' : s.trend === 'steady' ? 'coa-pulse-slow' : ''
  return (
    <div className="flex items-center gap-2" aria-label="City Pulse">
      <div
        className={`rounded-full ${pulseClass}`}
        style={{
          width: 34,
          height: 34,
          background: `radial-gradient(circle at 35% 30%, ${cfg.b}, ${cfg.a})`,
          boxShadow: `0 0 ${10 + Math.round(s.intensity / 8)}px ${cfg.a}88`,
          border: `1px solid ${cfg.a}`,
        }}
      />
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.12em', color: '#94a3b8' }}>CITY PULSE</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: cfg.a, letterSpacing: '0.06em' }}>{cfg.text}</div>
      </div>
    </div>
  )
}
