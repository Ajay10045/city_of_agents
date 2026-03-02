import { useEffect, useMemo, useState } from 'react'
import type { MediaClimateSignal, MediaHeadline } from '../../types'

const STYLES = {
  Calm: { color: '#22c55e', label: 'CALM' },
  Scrutiny: { color: '#f59e0b', label: 'SCRUTINY' },
  Frenzy: { color: '#ef4444', label: 'FRENZY' },
} as const

export default function MediaClimate({
  signal,
  headlines,
}: {
  signal?: MediaClimateSignal
  headlines: MediaHeadline[]
}) {
  const climate = signal ?? { state: 'Calm', animation: 'none', intensity: 10 }
  const cfg = STYLES[climate.state]
  const [idx, setIdx] = useState(0)
  const top = useMemo(() => headlines.slice(-6).reverse(), [headlines])

  useEffect(() => {
    if (top.length <= 1) return
    const id = setInterval(() => setIdx(i => (i + 1) % top.length), 3500)
    return () => clearInterval(id)
  }, [top.length])

  const wrapClass = climate.animation === 'shake' ? 'coa-shake-soft' : climate.animation === 'pulse' ? 'coa-pulse-slow' : ''
  const first = top[idx]
  const second = top[(idx + 1) % Math.max(1, top.length)]

  return (
    <div className={wrapClass} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${cfg.color}55`, borderRadius: 8, padding: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#94a3b8' }}>MEDIA CLIMATE</div>
        <div style={{ fontSize: 11, color: cfg.color, fontWeight: 700 }}>{cfg.label}</div>
      </div>
      {first && <div style={{ fontSize: 11, color: '#e2e8f0', marginBottom: 6 }}>{first.headline}</div>}
      {second && second !== first && <div style={{ fontSize: 10, color: '#94a3b8' }}>{second.headline}</div>}
      {!first && <div style={{ fontSize: 10, color: '#64748b' }}>Headlines will appear after your first turn.</div>}
    </div>
  )
}
