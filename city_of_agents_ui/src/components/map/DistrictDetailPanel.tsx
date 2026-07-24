import type { WardReportEntry, ActiveEvent } from '../../types'
import { MONO } from '../../theme/tokens'

// ─── District detail slide-in (shown when a district is clicked) ─────────────

export function DistrictDetailPanel({
  entry, events, onClose,
}: {
  entry: WardReportEntry
  events: ActiveEvent[]
  onClose: () => void
}) {
  const wbColor = entry.avg_wellbeing >= 65 ? '#4ade80' : entry.avg_wellbeing >= 40 ? '#f59e0b' : '#f87171'
  const trendGlyph = entry.trend === 'up' ? '▲' : entry.trend === 'down' ? '▼' : '─'
  const trendColor = entry.trend === 'up' ? '#4ade80' : entry.trend === 'down' ? '#f87171' : '#64748b'

  return (
    <div style={{
      position: 'absolute', top: 10, right: 10, width: 224, zIndex: 5,
      background: 'linear-gradient(180deg, rgba(9,20,34,0.96) 0%, rgba(7,16,28,0.96) 100%)',
      border: '1px solid #1c3652', borderRadius: 8, padding: '10px 12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      animation: 'coaPanelIn 0.18s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.25,
            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em',
          }}>{entry.group_name}</div>
          <div style={{ fontSize: 9, color: '#7ba8d1', marginTop: 1 }}>
            {Math.round(entry.population_pct)}% of population
            {entry.hotspot && <span style={{ color: '#f87171', fontWeight: 700 }}> · HOTSPOT</span>}
            {entry.bright_spot && <span style={{ color: '#4ade80', fontWeight: 700 }}> · BRIGHT SPOT</span>}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#7ba8d1', cursor: 'pointer',
          fontSize: 13, lineHeight: 1, padding: 2,
        }}>✕</button>
      </div>

      {/* Wellbeing */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
        <span style={{ ...MONO(wbColor), fontSize: 20, fontWeight: 700 }}>{Math.round(entry.avg_wellbeing)}</span>
        <span style={{ fontSize: 8, color: '#7ba8d1', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>WELLBEING</span>
        <span style={{ fontSize: 10, color: trendColor, fontFamily: "'Share Tech Mono', monospace" }}>
          {trendGlyph}{entry.avg_wellbeing_delta !== 0 ? Math.abs(entry.avg_wellbeing_delta).toFixed(1) : ''}
        </span>
      </div>
      <div style={{ height: 4, background: '#0a1a30', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${entry.avg_wellbeing}%`, height: '100%', background: wbColor, borderRadius: 2, boxShadow: `0 0 6px ${wbColor}70` }} />
      </div>

      {/* Approval */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 8, color: '#7ba8d1', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, width: 52 }}>APPROVAL</span>
        <div style={{ flex: 1, height: 4, background: '#0a1a30', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${entry.approval}%`, height: '100%', background: '#38bdf8', borderRadius: 2 }} />
        </div>
        <span style={{ ...MONO('#7dd3fc'), fontSize: 10, fontWeight: 700 }}>{Math.round(entry.approval)}%</span>
      </div>

      {/* Active events in this district */}
      {events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {events.map(ev => (
            <div key={ev.id} style={{
              fontSize: 9, padding: '4px 7px', borderRadius: 4, lineHeight: 1.35,
              color: ev.type === 'crisis' ? '#fca5a5' : '#86efac',
              background: ev.type === 'crisis' ? 'rgba(248,113,113,0.08)' : 'rgba(34,197,94,0.08)',
              border: `1px solid ${ev.type === 'crisis' ? 'rgba(248,113,113,0.25)' : 'rgba(34,197,94,0.25)'}`,
            }}>
              {ev.type === 'crisis' ? '⚠' : '✦'} <strong>{ev.name}</strong>
              <span style={{ color: '#7ba8d1' }}> · sev {ev.severity} · {ev.turns_remaining}T left</span>
            </div>
          ))}
        </div>
      )}

      {entry.pulse_summary && (
        <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.5, fontStyle: 'italic' }}>
          {entry.pulse_summary}
        </div>
      )}
    </div>
  )
}
