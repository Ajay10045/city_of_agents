// ─── MiniBar ──────────────────────────────────────────────────────────────────

export function MiniBar({ value, color, width = 36 }: { value: number; color: string; width?: number }) {
  return (
    <div style={{ width, height: 4, background: 'rgba(10,26,48,0.8)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.max(0, Math.min(100, value))}%`,
        background: color, borderRadius: 2, boxShadow: `0 0 4px ${color}80`
      }} />
    </div>
  )
}

export function ExecScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? '#22c55e' : pct >= 45 ? '#e8a030' : '#f87171'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace",
      color, background: `${color}18`, border: `1px solid ${color}44`,
      borderRadius: 3, padding: '1px 5px'
    }}>
      {pct}% EXEC
    </span>
  )
}
