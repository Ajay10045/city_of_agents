import { useMemo, useState } from 'react'
import type { TurnResult } from '../../types'
import { PANEL } from '../../theme/tokens'
import { fmtNum } from '../../lib/gameUtils'

// ─── Sparkline ────────────────────────────────────────────────────────────────

const W = 132
const H = 34
const PAD = 3

function Sparkline({
  values, color, format,
}: {
  values: number[]           // one value per turn, in turn order
  color: string
  format: (v: number) => string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const { points, path, areaPath } = useMemo(() => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const stepX = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0
    const pts = values.map((v, i) => ({
      x: PAD + i * stepX,
      y: PAD + (H - PAD * 2) * (1 - (v - min) / span),
    }))
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const area = `${d} L${pts[pts.length - 1].x.toFixed(1)},${H - PAD} L${pts[0].x.toFixed(1)},${H - PAD} Z`
    return { points: pts, path: d, areaPath: area }
  }, [values])

  const active = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={W} height={H}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const stepX = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 1
          const idx = Math.round((x - PAD) / stepX)
          setHoverIdx(Math.max(0, Math.min(values.length - 1, idx)))
        }}
      >
        <path d={areaPath} fill={color} opacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* end-point marker */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5}
          fill={color} stroke="#0b1929" strokeWidth={1.5} />
        {/* hover crosshair + marker */}
        {active && (
          <>
            <line x1={active.x} y1={PAD} x2={active.x} y2={H - PAD} stroke="#7ba8d1" strokeWidth={1} opacity={0.4} />
            <circle cx={active.x} cy={active.y} r={3} fill={color} stroke="#0b1929" strokeWidth={1.5} />
          </>
        )}
      </svg>
      {active && hoverIdx !== null && (
        <div style={{
          position: 'absolute', top: -22, left: Math.min(Math.max(active.x - 24, 0), W - 52),
          background: '#0a1929', border: '1px solid #1c3652', borderRadius: 4,
          padding: '1px 6px', pointerEvents: 'none', whiteSpace: 'nowrap',
          fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: '#dbe7f5',
          boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
        }}>
          T{hoverIdx + 1} · {format(values[hoverIdx])}
        </div>
      )}
    </div>
  )
}

// ─── HistoryCharts panel ──────────────────────────────────────────────────────

export function HistoryCharts({ turns }: { turns: TurnResult[] }) {
  if (turns.length < 2) return null

  const tiles: {
    label: string; color: string
    values: number[]; format: (v: number) => string
  }[] = [
    {
      label: 'APPROVAL', color: '#38bdf8',
      values: turns.map(t => t.interim_approval),
      format: v => `${Math.round(v)}%`,
    },
    {
      label: 'TREASURY', color: '#f0c040',
      values: turns.map(t => t.treasury_after ?? 0),
      format: v => `₹${fmtNum(v)} Cr`,
    },
    {
      label: 'EXECUTION', color: '#a78bfa',
      values: turns.map(t => (t.execution_score ?? 0) * 100),
      format: v => `${Math.round(v)}%`,
    },
    {
      label: 'TENSION', color: '#fb923c',
      values: turns.map(t => t.communal_tension_after ?? 0),
      format: v => `${Math.round(v)}`,
    },
  ]

  return (
    <div style={{ ...PANEL, padding: '10px 12px' }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#e8a030',
        fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
        marginBottom: 8,
      }}>
        ▦ TRENDS <span style={{ color: '#4b6280', fontWeight: 600 }}>· {turns.length} TURNS</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tiles.map(tile => {
          const last = tile.values[tile.values.length - 1]
          const prev = tile.values[tile.values.length - 2]
          const delta = last - prev
          const deltaColor = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#64748b'
          return (
            <div key={tile.label} style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid #14283f',
              borderRadius: 6, padding: '7px 9px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{
                  fontSize: 8, fontWeight: 700, color: '#7ba8d1',
                  fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em',
                }}>{tile.label}</span>
                <span style={{ fontSize: 8, fontFamily: "'Share Tech Mono', monospace", color: deltaColor }}>
                  {delta > 0 ? '▲' : delta < 0 ? '▼' : '─'}{Math.abs(Math.round(delta))}
                </span>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, lineHeight: 1.1, marginBottom: 4,
                fontFamily: "'Share Tech Mono', monospace", color: '#e2e8f0',
              }}>
                {tile.format(last)}
              </div>
              <Sparkline values={tile.values} color={tile.color} format={tile.format} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
