// ─── WelfareCard ──────────────────────────────────────────────────────────────

export interface WelfareStat {
  label: string; score: number; delta: number
  color: string; icon: string
}

export function WelfareCard({ stat }: { stat: WelfareStat }) {
  const deltaColor = stat.delta > 0 ? '#4ade80' : stat.delta < 0 ? '#f87171' : '#64748b'
  const scoreColor = stat.score >= 65 ? '#4ade80' : stat.score >= 40 ? '#f59e0b' : '#f87171'
  return (
    <div style={{
      flex: 1, padding: '12px 14px', borderRadius: 8,
      background: 'rgba(255,255,255,0.025)',
      border: `1px solid ${stat.color}28`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Header row: icon + label + delta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#64748b',
          fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>{stat.icon} {stat.label}</span>
        {stat.delta !== 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: deltaColor, fontFamily: "'Share Tech Mono', monospace" }}>
            {stat.delta > 0 ? `▲+${Math.round(stat.delta)}` : `▼${Math.round(stat.delta)}`}
          </span>
        )}
      </div>
      {/* Score number */}
      <div style={{
        fontSize: 36, fontWeight: 700, lineHeight: 1,
        fontFamily: "'Share Tech Mono', monospace", color: scoreColor,
      }}>{Math.round(stat.score)}</div>
      {/* Bar */}
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.max(0, Math.min(100, stat.score))}%`,
          background: scoreColor, borderRadius: 3,
          boxShadow: `0 0 6px ${scoreColor}60`,
          transition: 'width 0.7s ease',
        }} />
      </div>
    </div>
  )
}
