import { useMemo } from 'react'
import { AlertTriangle, MessageCircle, Loader2 } from 'lucide-react'
import type { Policy, Minister } from '../../types'
import { PANEL, HDR_LABEL, MONO } from '../../theme/tokens'
import { fmtNum, mapPolicyAdvisorStances } from '../../lib/gameUtils'
import { AdvisorStanceChip } from '../common/AdvisorStanceChip'

// ─── Policy Modal ─────────────────────────────────────────────────────────────

export function PolicyModal({
  options, ministers, onSelect, onDiscuss, onClose, loading, error, treasury,
}: {
  options: Policy[]; ministers: Minister[]; onSelect: (i: number) => void; onDiscuss: (policy: Policy, index: number) => void; onClose: () => void; loading: boolean; error: string | null; treasury: number
}) {
  const PORTFOLIO_COLORS: Record<string, string> = {
    'Health': '#22c55e', 'Infrastructure': '#38bdf8', 'Transport & Roads': '#38bdf8',
    'Education': '#a855f7', 'Housing': '#f97316', 'Security & Law': '#f87171',
    'Environment': '#4ade80', 'Water & Power': '#60a5fa', 'Commerce': '#eab308',
    'Labor & Employment': '#fb923c',
  }
  const stancesByPolicy = useMemo(
    () => options.map(p => mapPolicyAdvisorStances(ministers, p)),
    [options, ministers]
  )
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(5,13,27,0.85)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...PANEL, width: '90%', maxWidth: 860, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={HDR_LABEL}>SELECT POLICY FOR THIS TURN</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', fontFamily: "'Share Tech Mono', monospace", background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 4, padding: '2px 8px' }}>
              TREASURY: ₹{fmtNum(treasury)} Cr
            </span>
          </div>
          <button onClick={onClose} disabled={loading}
            style={{ color: '#7ba8d1', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            background: 'rgba(248,113,113,0.1)', border: '1px solid #7f1d1d', borderRadius: 4,
            marginBottom: 16, fontSize: 11, color: '#f87171'
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {options.map((p, i) => {
            const col = PORTFOLIO_COLORS[p.portfolio] ?? '#e8a030'
            const topEffects = Object.entries(p.target_effects).slice(0, 3)
            const stances = stancesByPolicy[i] ?? []
            const approveCount = stances.filter(s => s.stance === 'approve').length
            const againstCount = stances.filter(s => s.stance === 'disapprove').length
            return (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', border: `1px solid #1c3652`,
                borderRadius: 6, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10
              }}>
                <div>
                  <span style={{
                    fontSize: 8, fontWeight: 700, color: col, background: `${col}22`,
                    border: `1px solid ${col}44`, borderRadius: 3, padding: '1px 6px',
                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em'
                  }}>
                    {p.portfolio}
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 6, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.45 }}>{p.description}</div>
                </div>
                <div style={{ fontSize: 11, ...MONO('#f87171') }}>
                  Budget: ₹{fmtNum(p.budget_cost)} Cr
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {topEffects.map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 9, fontFamily: "'Share Tech Mono', monospace",
                      color: (v as number) >= 0 ? '#4ade80' : '#f87171',
                      background: (v as number) >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                      border: `1px solid ${(v as number) >= 0 ? '#14532d' : '#7f1d1d'}`,
                      borderRadius: 3, padding: '1px 5px'
                    }}>
                      {k.replace(/_/g, ' ')} {(v as number) >= 0 ? '+' : ''}{v as number}
                    </span>
                  ))}
                </div>
                {/* ── Side Effects ── */}
                {Object.keys(p.side_effects ?? {}).length > 0 && (
                  <div>
                    <div style={{
                      fontSize: 8, color: '#f59e0b', fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4
                    }}>SIDE EFFECTS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {Object.entries(p.side_effects).map(([k, v]) => (
                        <span key={k} style={{
                          fontSize: 9, fontFamily: "'Share Tech Mono', monospace",
                          color: (v as number) >= 0 ? '#86efac' : '#fca5a5',
                          background: (v as number) >= 0 ? 'rgba(34,197,94,0.07)' : 'rgba(248,113,113,0.07)',
                          border: `1px solid ${(v as number) >= 0 ? '#14532d' : '#7f1d1d'}44`,
                          borderRadius: 3, padding: '1px 5px'
                        }}>
                          {k.replace(/_/g, ' ')} {(v as number) >= 0 ? '+' : ''}{v as number}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* ── Tradeoffs ── */}
                {p.tradeoffs && (
                  <div style={{
                    fontSize: 10, color: '#94a3b8', lineHeight: 1.45, fontStyle: 'italic',
                    borderLeft: '2px solid #f59e0b44', paddingLeft: 7
                  }}>
                    {p.tradeoffs}
                  </div>
                )}
                {/* ── Advisor Poll ── */}
                {stances.length > 0 && (() => {
                  const consensusBadge = approveCount >= 4
                    ? { label: 'HIGH CONSENSUS', color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)' }
                    : approveCount >= 3
                    ? { label: 'SPLIT CABINET', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' }
                    : { label: 'CABINET RESISTANCE', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' }
                  return (
                    <div style={{ borderTop: '1px solid #1c3652', paddingTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{
                          fontSize: 8, fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 700, letterSpacing: '0.12em', color: '#7ba8d1'
                        }}>ADVISOR POLL</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: '#64748b' }}>
                            <span style={{ color: '#4ade80' }}>{approveCount} For</span>
                            {' · '}
                            <span style={{ color: '#f87171' }}>{againstCount} Against</span>
                          </span>
                          <span style={{
                            fontSize: 7, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                            letterSpacing: '0.08em', padding: '1px 5px', borderRadius: 3,
                            color: consensusBadge.color,
                            background: consensusBadge.bg,
                            border: `1px solid ${consensusBadge.border}`,
                          }}>{consensusBadge.label}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {stances.map(s => (
                          <AdvisorStanceChip key={s.ministerId} stance={s} ministers={ministers} />
                        ))}
                      </div>
                    </div>
                  )
                })()}
                <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => onDiscuss(p, i)}
                    disabled={loading}
                    style={{
                      flex: 1, background: 'transparent',
                      border: '1px solid rgba(232,160,48,0.4)', borderRadius: 4, padding: '8px 0',
                      color: loading ? '#4b6280' : '#e8a030',
                      fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11,
                      letterSpacing: '0.08em', cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                    }}>
                    <MessageCircle size={11} /> DISCUSS
                  </button>
                  <button
                    onClick={() => onSelect(i)}
                    disabled={loading}
                    style={{
                      flex: 1, background: loading ? '#1a2a3a' : 'linear-gradient(135deg, #c47d10, #e8a030)',
                      border: 'none', borderRadius: 4, padding: '8px 0', color: loading ? '#4b6280' : '#040d1b',
                      fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11,
                      letterSpacing: '0.08em', cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                    }}>
                    {loading ? <><Loader2 size={13} className="animate-spin" /> EXECUTING...</> : 'EXECUTE POLICY'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
