import { useState } from 'react'
import type { AdvisorStance, Minister } from '../../types'
import { AgentAvatar } from './Avatar'

// ─── Advisor Stance Chip ─────────────────────────────────────────────────────

export function AdvisorStanceChip({ stance, ministers }: { stance: AdvisorStance; ministers: Minister[] }) {
  const [showTip, setShowTip] = useState(false)
  const stanceColor = stance.stance === 'approve' ? '#22c55e' : '#f87171'
  const stanceSymbol = stance.stance === 'approve' ? '✓' : '✗'
  return (
    <div style={{ position: 'relative', cursor: 'default' }}
      onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      <AgentAvatar seed={stance.ministerName} ministers={ministers} size={22} ring={stanceColor} />
      <div style={{
        position: 'absolute', bottom: -2, right: -2, width: 10, height: 10,
        background: stanceColor, border: '1.5px solid #0b1929', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 6, color: '#0b1929', fontWeight: 900, lineHeight: 1,
      }}>{stanceSymbol}</div>
      {showTip && (
        <div style={{
          position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, background: '#0a1929', border: `1px solid ${stanceColor}55`,
          borderRadius: 5, padding: '6px 8px', pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.8)', minWidth: 160, maxWidth: 220,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif",
            color: stanceColor, letterSpacing: '0.06em', marginBottom: 2,
          }}>
            {stance.ministerName}
            <span style={{ color: '#7ba8d1', fontWeight: 400 }}> {stance.stance.toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.4 }}>{stance.reason}</div>
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent', borderTop: `5px solid ${stanceColor}55`,
          }} />
        </div>
      )}
    </div>
  )
}
