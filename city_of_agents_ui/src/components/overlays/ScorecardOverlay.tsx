import type { GovernanceScorecard } from '../../types'
import { PANEL, HDR_LABEL, MONO } from '../../theme/tokens'

// ─── Scorecard Overlay ────────────────────────────────────────────────────────

export function ScorecardOverlay({ sc }: { sc: GovernanceScorecard }) {
  const rows: [string, number][] = [
    ['Final Approval', sc.final_approval],
    ['Wellbeing Equity', sc.wellbeing_equity],
    ['Institutional Legacy', sc.institutional_legacy],
    ['Budget Health', sc.budget_health],
    ['Crisis Record', sc.crisis_record],
    ['Promise Delivery', sc.promise_delivery],
    ['Cabinet Integrity', sc.cabinet_integrity],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(5,13,27,0.95)', backdropFilter: 'blur(8px)' }}>
      <div style={{ ...PANEL, maxWidth: 480, width: '100%', padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 11, ...MONO('#e8a030'), letterSpacing: '0.2em', marginBottom: 4 }}>GAME OVER</div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 28, color: '#f0c040',
            letterSpacing: '0.06em', textShadow: '0 0 12px rgba(240,192,64,0.5)'
          }}>
            {sc.legacy_title}
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, ...MONO('#22c55e'), marginTop: 8 }}>
            {Math.round(sc.final_score)}
          </div>
          <div style={{ ...HDR_LABEL, marginTop: 2 }}>FINAL SCORE</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {rows.map(([label, val]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 11, color: '#94a3b8' }}>{label}</span>
              <div style={{ width: 100, height: 4, background: '#0a1a30', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${val}%`, background: '#e8a030',
                  borderRadius: 2, boxShadow: '0 0 4px #e8a03080'
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, ...MONO('#f0c040'), width: 28, textAlign: 'right' }}>
                {Math.round(val)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6, textAlign: 'center' }}>
          {sc.summary}
        </div>
      </div>
    </div>
  )
}
