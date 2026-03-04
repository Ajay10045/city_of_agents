import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronRight, ChevronDown, HelpCircle, Settings, Clock,
  Zap, Send, AlertTriangle, TrendingDown, Droplets,
  MapPin, Info,
  Newspaper, MessageCircle, TrendingUp, Loader2,
  Volume2, VolumeX
} from 'lucide-react'
import {
  openConsultation, messageMinister, closeConsultation,
  getPolicies, amendPolicy, executeTurnStreamV2, streamTurnBriefing
} from '../api'
import type {
  GameState, TurnResult, Policy, Minister, ActiveEvent,
  MediaHeadline, CitizenVoice, WardReportEntry,
  GovernanceScorecard, AdvisorStance, StanceValue,
} from '../types'

// ─── helpers ──────────────────────────────────────────────────────────────────

const PANEL = {
  background: 'linear-gradient(180deg, #0b1929 0%, #091422 100%)',
  border: '1px solid #1c3652',
  borderRadius: 6,
} as const

const HDR_LABEL = {
  fontFamily: "'Rajdhani', sans-serif",
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '0.15em',
  color: '#e8a030',
} as const

const MONO = (color = '#fff') => ({
  fontFamily: "'Share Tech Mono', monospace",
  color,
} as const)

function avg(vals: number[]) {
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function fmtNum(n: number) {
  return Math.round(n).toLocaleString()
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ seed, size = 28, ring = '#1c3652' }: { seed: string; size?: number; ring?: string }) {
  return (
    <img
      src={`https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1e3a5f,0f2942,1a2f4a`}
      alt={seed}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: `1.5px solid ${ring}`, background: '#0b1929' }}
    />
  )
}

// ─── Agent Avatar (Demographic Match) ────────────────────────────────────────

function getPortraitForMinister(name: string, ministers: Minister[]): string {
  const m = ministers.find(can => can.name === name)
  if (!m) return '/agents/generic/generic_male_mid_1.png'

  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  h = Math.abs(h)

  const isFemale = h % 2 === 0
  const genderStr = isFemale ? 'female' : 'male'

  const ageGroup = m.demographics?.age_group || '36-50'
  let ageStr = 'mid'
  if (ageGroup.includes('18') || ageGroup.includes('25') || ageGroup.includes('26') || ageGroup.includes('35')) {
    ageStr = 'young'
  } else if (ageGroup.includes('51') || ageGroup.includes('65') || ageGroup.includes('+')) {
    ageStr = 'old'
  }

  let variant = 1
  if (ageStr === 'young' || ageStr === 'mid') {
    variant = ((h >> 1) % 2) + 1
  }

  return `/agents/generic/generic_${genderStr}_${ageStr}_${variant}.png`
}

function AgentAvatar({ seed, ministers = [], size = 28, ring = '#1c3652' }: { seed: string; ministers?: Minister[]; size?: number; ring?: string }) {
  const src = getPortraitForMinister(seed, ministers)
  return (
    <img
      src={src}
      alt={seed}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: `1.5px solid ${ring}`, background: '#0b1929' }}
    />
  )
}

// ─── Advisor Stance Chip ─────────────────────────────────────────────────────

function AdvisorStanceChip({ stance, ministers }: { stance: AdvisorStance; ministers: Minister[] }) {
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
            <span style={{ color: '#4b6280', fontWeight: 400 }}> {stance.stance.toUpperCase()}</span>
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

// ─── WelfareCard ──────────────────────────────────────────────────────────────

interface WelfareStat {
  label: string; score: number; delta: number
  color: string; icon: string
}

function WelfareCard({ stat }: { stat: WelfareStat }) {
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

// ─── MiniBar ──────────────────────────────────────────────────────────────────

function MiniBar({ value, color, width = 36 }: { value: number; color: string; width?: number }) {
  return (
    <div style={{ width, height: 4, background: 'rgba(10,26,48,0.8)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.max(0, Math.min(100, value))}%`,
        background: color, borderRadius: 2, boxShadow: `0 0 4px ${color}80`
      }} />
    </div>
  )
}

// ─── Scorecard Overlay ────────────────────────────────────────────────────────

function ScorecardOverlay({ sc }: { sc: GovernanceScorecard }) {
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

// ─── Minister Picker Modal ────────────────────────────────────────────────────

function MinisterPickerModal({
  policy, ministers, onSelect, onBack,
}: {
  policy: Policy
  ministers: Minister[]
  onSelect: (ministerId: string) => void
  onBack: () => void
}) {
  const MINISTER_COLORS = ['#38bdf8', '#22c55e', '#f59e0b', '#a855f7', '#f87171', '#34d399']

  // Sort: portfolio match first, then by competence desc
  const sorted = [...ministers].sort((a, b) => {
    const aMatch = a.portfolio === policy.portfolio || (a.extra_portfolios ?? []).includes(policy.portfolio)
    const bMatch = b.portfolio === policy.portfolio || (b.extra_portfolios ?? []).includes(policy.portfolio)
    if (aMatch && !bMatch) return -1
    if (!aMatch && bMatch) return 1
    return (b.capability?.competence ?? 50) - (a.capability?.competence ?? 50)
  })
  const recommended = sorted[0]?.id

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #071320 0%, #050d1b 100%)',
        border: '1px solid #1c3652',
        borderRadius: 10, width: 420,
        boxShadow: '0 0 60px rgba(56,189,248,0.08)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid #1c3652' }}>
          <div style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', color: '#4b6280', marginBottom: 4 }}>
            ASSIGN MINISTER
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{policy.name}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{policy.portfolio} · ₹{policy.budget_cost} Cr</div>
        </div>

        {/* Minister list */}
        <div style={{ padding: '10px 14px', maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((m, idx) => {
            const col = MINISTER_COLORS[idx % MINISTER_COLORS.length]
            const competence = m.capability?.competence ?? 50
            const loyalty = m.loyalty ?? 50
            const scandalRisk = m.scandal_exposure ?? 0
            const isRecommended = m.id === recommended
            const portfolioMatch = m.portfolio === policy.portfolio || (m.extra_portfolios ?? []).includes(policy.portfolio)

            return (
              <div key={m.id} style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${isRecommended ? col + '55' : '#1c3652'}`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar seed={m.name} size={36} ring={col} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{m.name}</span>
                      {isRecommended && (
                        <span style={{
                          fontSize: 8, padding: '1px 5px', borderRadius: 10,
                          background: `${col}22`, border: `1px solid ${col}44`, color: col,
                          fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.06em',
                        }}>★ BEST FIT</span>
                      )}
                      {!portfolioMatch && (
                        <span style={{
                          fontSize: 8, padding: '1px 5px', borderRadius: 10,
                          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                          color: '#f59e0b', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                        }}>OUT OF PORTFOLIO</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: '#475569' }}>{m.portfolio}</div>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Competence', value: competence, color: '#38bdf8' },
                    { label: 'Loyalty', value: loyalty, color: '#22c55e' },
                    { label: 'Scandal Risk', value: scandalRisk, color: scandalRisk > 50 ? '#f87171' : '#475569' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, minWidth: 80 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 8, color: '#475569', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.06em' }}>{s.label.toUpperCase()}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: s.color, fontFamily: "'Share Tech Mono', monospace" }}>{Math.round(s.value)}</span>
                      </div>
                      <div style={{ height: 3, background: '#0b1929', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${s.value}%`, background: s.color, borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Personality hint */}
                {m.personality && (
                  <div style={{ marginTop: 8, fontSize: 9, color: '#334155', lineHeight: 1.4, fontStyle: 'italic' }}>
                    {[
                      m.personality.integrity < 35 && 'Low integrity — watch for leakage',
                      m.personality.corruption_tolerance > 65 && 'High corruption tolerance',
                      m.personality.empathy > 65 && 'High empathy — community-focused',
                      competence < 40 && 'May underdeliver',
                      loyalty < 40 && 'Loyalty risk — may defect',
                    ].filter(Boolean).slice(0, 2).join(' · ')}
                  </div>
                )}

                <button
                  onClick={() => onSelect(m.id)}
                  style={{
                    marginTop: 10, width: '100%',
                    background: `linear-gradient(90deg, ${col}22, ${col}11)`,
                    border: `1px solid ${col}44`, borderRadius: 5,
                    color: col, fontSize: 10, fontWeight: 700,
                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em',
                    padding: '6px 0', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${col}33` }}
                  onMouseLeave={e => { e.currentTarget.style.background = `linear-gradient(90deg, ${col}22, ${col}11)` }}
                >
                  ASSIGN {m.name.split(' ')[0].toUpperCase()}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid #1c3652' }}>
          <button onClick={onBack} style={{
            background: 'none', border: '1px solid #1c3652', borderRadius: 5,
            color: '#475569', fontSize: 10, fontFamily: "'Rajdhani', sans-serif",
            letterSpacing: '0.08em', padding: '5px 14px', cursor: 'pointer',
          }}>← BACK TO POLICIES</button>
        </div>
      </div>
    </div>
  )
}

// ─── Policy Modal ─────────────────────────────────────────────────────────────

function PolicyModal({
  options, ministers, onSelect, onDiscuss, onClose, loading, error,
}: {
  options: Policy[]; ministers: Minister[]; onSelect: (i: number) => void; onDiscuss: (policy: Policy, index: number) => void; onClose: () => void; loading: boolean; error: string | null
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
          <span style={HDR_LABEL}>SELECT POLICY FOR THIS TURN</span>
          <button onClick={onClose} disabled={loading}
            style={{ color: '#4b6280', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
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
                {/* ── Advisor Poll ── */}
                {stances.length > 0 && (
                  <div style={{ borderTop: '1px solid #1c3652', paddingTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 8, fontFamily: "'Rajdhani', sans-serif",
                        fontWeight: 700, letterSpacing: '0.12em', color: '#4b6280'
                      }}>ADVISOR POLL</span>
                      <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace", color: '#64748b' }}>
                        <span style={{ color: '#4ade80' }}>{approveCount} For</span>
                        {' · '}
                        <span style={{ color: '#f87171' }}>{againstCount} Against</span>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {stances.map(s => (
                        <AdvisorStanceChip key={s.ministerId} stance={s} ministers={ministers} />
                      ))}
                    </div>
                  </div>
                )}
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

// ─── Types used internally ────────────────────────────────────────────────────

interface ChatMsg {
  isMayor: boolean
  sender: string
  senderRole: string
  text: string
  time: string
  ringColor: string
  seed: string
  isSystem?: boolean
  isSystemFallback?: boolean
}

interface RoundReply {
  name: string
  portfolio: string
  text: string
}

interface TurnEntry {
  turn: number
  result: TurnResult
  expanded: boolean
}

// ─── Portfolio image map ───────────────────────────────────────────────────────

const PORTFOLIO_IMG: Record<string, string> = {
  'Infrastructure': 'https://images.unsplash.com/photo-1544621531-97b77ab684cb?q=80&w=1200&auto=format&fit=crop',
  'Health & Education': 'https://images.unsplash.com/photo-1551076805-e1869033e561?q=80&w=1200&auto=format&fit=crop',
  'Finance & Economy': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200&auto=format&fit=crop',
  'Home Affairs': 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=1200&auto=format&fit=crop',
  'Housing & Community': 'https://images.unsplash.com/photo-1580216643062-cf460548a66a?q=80&w=1200&auto=format&fit=crop',
  'Environment': 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1200&auto=format&fit=crop',
  'Governance Reform': 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=1200&auto=format&fit=crop',

  // Fallbacks
  'Transport & Roads': 'https://images.unsplash.com/photo-1544621531-97b77ab684cb?q=80&w=1200&auto=format&fit=crop',
  'Health': 'https://images.unsplash.com/photo-1551076805-e1869033e561?q=80&w=1200&auto=format&fit=crop',
  'Education': 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=1200&auto=format&fit=crop',
  'Housing': 'https://images.unsplash.com/photo-1580216643062-cf460548a66a?q=80&w=1200&auto=format&fit=crop',
  'Security & Law': 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=1200&auto=format&fit=crop',
  'Water & Power': 'https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1200&auto=format&fit=crop',
  'Commerce': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200&auto=format&fit=crop',
  'Labor & Employment': 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop',
}
const DEFAULT_IMG = 'https://images.unsplash.com/photo-1596430212278-7f7b1d0c9a4e?q=80&w=1200&auto=format&fit=crop'

// ─── Welfare score helpers ────────────────────────────────────────────────────

function deriveWelfare(cp: GameState['city_params']) {
  return {
    health: avg([cp.hospitals_and_clinics, cp.air_quality_and_pollution]),
    wealth: avg([cp.jobs_and_commerce, cp.affordable_housing]),
    safety: avg([cp.police_and_emergency, cp.courts_and_legal]),
    social: avg([cp.community_and_spaces, cp.schools_and_universities]),
  }
}

function welfareDelta(after: Record<string, number>, before: Record<string, number>) {
  const avgBefore = (keys: string[]) => avg(keys.map(k => before[k] ?? 50))
  const avgAfter = (keys: string[]) => avg(keys.map(k => after[k] ?? 50))
  return {
    health: avgAfter(['hospitals_and_clinics', 'air_quality_and_pollution']) - avgBefore(['hospitals_and_clinics', 'air_quality_and_pollution']),
    wealth: avgAfter(['jobs_and_commerce', 'affordable_housing']) - avgBefore(['jobs_and_commerce', 'affordable_housing']),
    safety: avgAfter(['police_and_emergency', 'courts_and_legal']) - avgBefore(['police_and_emergency', 'courts_and_legal']),
    social: avgAfter(['community_and_spaces', 'schools_and_universities']) - avgBefore(['community_and_spaces', 'schools_and_universities']),
  }
}

function severityLabel(s: number): { label: string; bg: string; border: string; color: string } {
  if (s >= 70) return { label: 'HIGH', bg: 'rgba(239,68,68,0.15)', border: '#7f1d1d', color: '#f87171' }
  if (s >= 40) return { label: 'MEDIUM', bg: 'rgba(249,115,22,0.15)', border: '#7c2d12', color: '#fb923c' }
  return { label: 'LOW', bg: 'rgba(34,197,94,0.1)', border: '#14532d', color: '#4ade80' }
}

const MINISTER_COLORS = ['#7c3aed', '#2563eb', '#0d9488', '#d97706', '#be185d']

// Detect @mention or direct name reference in a message.
// ─── Portfolio → keywords that signal relevance to this minister ──────────────
const PORTFOLIO_KEYWORDS: Record<string, string[]> = {
  'Finance & Economy': ['budget', 'tax', 'revenue', 'economy', 'jobs', 'commerce', 'trade', 'fiscal', 'debt', 'spend', 'cost', 'money', 'treasury', 'finance'],
  'Infrastructure': ['road', 'transit', 'metro', 'water', 'power', 'sanitation', 'transport', 'infrastructure', 'grid', 'highway', 'bridge', 'rail'],
  'Health & Education': ['hospital', 'clinic', 'health', 'school', 'university', 'education', 'doctor', 'teacher', 'student', 'medical', 'healthcare'],
  'Housing & Community': ['housing', 'house', 'home', 'community', 'park', 'space', 'affordable', 'rent', 'slum', 'neighbourhood', 'neighborhood'],
  'Home Affairs': ['police', 'crime', 'law', 'court', 'legal', 'security', 'enforcement', 'emergency', 'justice', 'arrest', 'order'],
  'Environment': ['air', 'pollution', 'environment', 'climate', 'green', 'emission', 'waste', 'clean', 'ecological'],
  'Governance Reform': ['corruption', 'reform', 'efficiency', 'media', 'transparency', 'admin', 'governance', 'bureaucracy', 'press', 'freedom'],
}

// Score how relevant a minister is to the message (higher = more relevant)
function relevanceScore(minister: Minister, msgLower: string): number {
  let score = 0

  // Portfolio keyword match — primary signal
  const keywords = PORTFOLIO_KEYWORDS[minister.portfolio] ?? []
  for (const kw of keywords) {
    if (msgLower.includes(kw)) score += 3
  }
  // Extra portfolios also count but weighted less
  for (const ep of (minister.extra_portfolios ?? [])) {
    const epKws = PORTFOLIO_KEYWORDS[ep] ?? []
    for (const kw of epKws) {
      if (msgLower.includes(kw)) score += 1.5
    }
  }

  // Personality: high ambition → more eager to chime in
  const ambition = (minister.personality?.['ambition'] ?? 50) / 100
  score += ambition * 0.8

  // Low loyalty → more likely to speak up / push back
  const loyalty = minister.loyalty ?? 50
  if (loyalty < 40) score += 0.6

  // Tiny random jitter so same-score ministers don't always respond in the same order
  score += Math.random() * 0.4

  return score
}

function normaliseName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function mapPolicyAdvisorStances(ministers: Minister[], policy: Policy): AdvisorStance[] {
  const raw = Array.isArray(policy.advisor_stances) ? policy.advisor_stances : []
  if (raw.length === 0) return []

  const byName = new Map<string, Minister>()
  for (const minister of ministers) {
    byName.set(normaliseName(minister.name), minister)
  }

  const seen = new Set<string>()
  const mapped: AdvisorStance[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rawName = typeof item.minister_name === 'string'
      ? item.minister_name
      : (typeof item.ministerName === 'string' ? item.ministerName : '')
    const minister = byName.get(normaliseName(rawName))
    if (!minister) continue
    if (seen.has(minister.id)) continue

    const stanceRaw = typeof item.stance === 'string' ? item.stance.trim().toLowerCase() : ''
    if (stanceRaw !== 'approve' && stanceRaw !== 'disapprove') continue

    const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
    if (!reason) continue

    mapped.push({
      ministerId: minister.id,
      ministerName: minister.name,
      stance: stanceRaw as StanceValue,
      reason,
    })
    seen.add(minister.id)
  }
  return mapped
}

// Parse direct @name mentions — returns indices of ministers explicitly addressed
function parseMentioned(msg: string, ministers: Minister[]): number[] {
  const lower = msg.toLowerCase()
  const mentioned: number[] = []
  ministers.forEach((m, idx) => {
    const parts = m.name.toLowerCase().split(' ')
    if (
      lower.includes(`@${parts[0]}`) ||
      lower.includes(`@${m.name.toLowerCase().replace(/ /g, '')}`)
    ) {
      mentioned.push(idx)
    }
  })
  return mentioned
}

const BROADCAST_RE = /(?:^|\s)@\s*(?:all|everyone)(?:\s|$)/i

/**
 * Select which ministers should respond.
 *
 * Modes:
 *  - Direct @name  → only that minister replies (ends cabinet session)
 *  - @all / @everyone  → all ministers respond, ordered by relevance
 *  - Cabinet in session (cabinetHot) → top 2-3 relevant ministers jump in
 *  - No session, no mention → most relevant minister; 40% chance second joins
 */
function selectResponders(msg: string, ministers: Minister[], cabinetHot = false): number[] {
  const lower = msg.toLowerCase()
  const directMentions = parseMentioned(msg, ministers)
  const isBroadcast = BROADCAST_RE.test(msg)

  // Score everyone
  const scored = ministers.map((m, i) => ({ i, score: relevanceScore(m, lower) }))
  scored.sort((a, b) => b.score - a.score)

  // Direct @name → only that minister (closes cabinet session)
  if (directMentions.length > 0) {
    return [...new Set(directMentions)]
  }

  // @all → everyone speaks
  if (isBroadcast) {
    return scored.map(s => s.i)
  }

  // Cabinet still in session from a prior @all → relevant ministers stay engaged
  if (cabinetHot) {
    // Always include the top scorer; others join if score ≥ 2 (loosely relevant)
    const result = [scored[0].i]
    for (let k = 1; k < scored.length && result.length < 3; k++) {
      if (scored[k].score >= 2) result.push(scored[k].i)
    }
    // Guarantee at least 2 so the room feels active
    if (result.length < 2 && scored.length > 1) result.push(scored[1].i)
    return result
  }

  // No session, no mention → most relevant minister; second joins rarely
  const first = scored[0]
  if (!first) return []
  const result = [first.i]
  const second = scored[1]
  if (second && second.score >= 3 && Math.random() < 0.4) {
    result.push(second.i)
  }
  return result
}


function ExecScoreBadge({ score }: { score: number }) {
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

// ─── TurnPhaseCard helpers ──────────────────────────────────────────────────────

function findMinisterForPortfolio(ministers: Minister[], portfolio: string): Minister | undefined {
  return ministers.find(m => m.portfolio === portfolio || m.extra_portfolios?.includes(portfolio))
}

// ─── TurnPhaseCard ─────────────────────────────────────────────────────────────

function TurnPhaseCard({
  entry, ministers, onToggle,
}: {
  entry: TurnEntry; ministers: Minister[]; onToggle: () => void
}) {
  const tr = entry.result
  const paramDeltas = tr.city_params_after && tr.city_params_before
    ? Object.entries(tr.city_params_after)
      .map(([k, v]) => ({ key: k, diff: Math.round(v - (tr.city_params_before[k] ?? v)) }))
      .filter(d => Math.abs(d.diff) >= 1)
    : []

  return (
    <div style={{ borderBottom: '1px solid #1c3652' }}>
      {/* Header — always visible */}
      <div
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all"
        style={{ background: entry.expanded ? 'rgba(255,255,255,0.02)' : '' }}
        onMouseEnter={e => { if (!entry.expanded) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
        onMouseLeave={e => { if (!entry.expanded) e.currentTarget.style.background = '' }}
      >
        <div className="shrink-0">
          {entry.expanded
            ? <ChevronDown size={12} color="#4b6280" />
            : <ChevronRight size={12} color="#4b6280" />}
        </div>
        <div className="shrink-0 px-2 py-0.5 rounded"
          style={{
            background: 'rgba(232,160,48,0.12)', border: '1px solid rgba(232,160,48,0.3)',
            fontSize: 9, fontWeight: 700, color: '#e8a030',
            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em'
          }}>
          TURN {tr.turn}
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', flex: 1, minWidth: 0 }} className="truncate">
          {tr.major_policy?.name ?? 'Policy Executed'}
        </span>
        <ExecScoreBadge score={tr.execution_score} />
      </div>

      {/* Expanded — narrative-first v2 layout */}
      {entry.expanded && (() => {
        const execPct = Math.round(tr.execution_score * 100)
        const execColor = tr.execution_score >= 0.7 ? '#22c55e' : tr.execution_score >= 0.45 ? '#e8a030' : '#f87171'
        const execLabel = tr.execution_score >= 0.7 ? 'STRONG DELIVERY' : tr.execution_score >= 0.45 ? 'PARTIAL DELIVERY' : 'POOR DELIVERY'
        const execMinister = findMinisterForPortfolio(ministers, tr.major_policy?.portfolio ?? '')
        const fmt = (k: string) => k.replace(/_/g, ' ')
        const netTreasury = (tr.tax_revenue ?? 0) - (tr.major_policy?.budget_cost ?? 0) - (tr.interest_paid ?? 0) - (tr.budget_stolen ?? 0)
        const sideEffectEntries = Object.entries(tr.side_effect_deltas ?? {}).filter(([, v]) => Math.abs(v) >= 0.5)
        const approvalBefore = Math.round(tr.approval_before ?? tr.interim_approval)
        const approvalAfter = Math.round(tr.interim_approval)
        const approvalDelta = approvalAfter - approvalBefore
        const approvalColor = approvalDelta > 0 ? '#22c55e' : approvalDelta < 0 ? '#f87171' : '#64748b'

        const SLabel = ({ text, color = '#4b6280' }: { text: string; color?: string }) => (
          <div style={{
            fontSize: 8, fontWeight: 700, color, fontFamily: "'Rajdhani', sans-serif",
            letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 5,
          }}>{text}</div>
        )

        return (
          <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ── EXECUTION HERO ─────────────────────────────────────────── */}
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: `linear-gradient(135deg, ${execColor}0d, transparent)`,
              border: `1px solid ${execColor}33`,
            }}>
              {/* Top row: minister avatar + name (prominent) + exec % */}
              <div className="flex items-center gap-3" style={{ marginBottom: 6 }}>
                {execMinister && <Avatar seed={execMinister.name} size={30} ring={execColor} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700, lineHeight: 1.2 }}>
                    {execMinister?.name ?? 'Minister'}
                  </div>
                  <div style={{ fontSize: 9, color: '#4b6280', marginTop: 1 }}>
                    {tr.major_policy?.portfolio}
                  </div>
                </div>
                {/* Execution % */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 24, fontFamily: "'Share Tech Mono', monospace",
                    color: execColor, fontWeight: 700, lineHeight: 1,
                  }}>{execPct}%</div>
                  <div style={{
                    fontSize: 7, color: execColor, fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: '0.12em', fontWeight: 700,
                  }}>{execLabel}</div>
                </div>
              </div>
              {/* Execution bar */}
              <div style={{ height: 4, background: '#0a1a30', borderRadius: 2, overflow: 'hidden', marginBottom: 7 }}>
                <div style={{
                  width: `${execPct}%`, height: '100%', background: execColor,
                  borderRadius: 2, boxShadow: `0 0 8px ${execColor}88`,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              {/* On The Ground Narrative */}
              {tr.delivery_narrative && (
                <div style={{ padding: '8px 10px', background: 'rgba(56,189,248,0.06)', borderRadius: 4, border: '1px solid rgba(56,189,248,0.15)', marginTop: 8 }}>
                  <div style={{ fontSize: 7, color: '#38bdf8', letterSpacing: '0.12em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 4 }}>ON THE GROUND</div>
                  <div style={{ fontSize: 10, color: '#e0f2fe', lineHeight: 1.6, fontStyle: 'italic' }}>
                    "{tr.delivery_narrative}"
                  </div>
                </div>
              )}
            </div>

            {/* ── CITY IMPACT ─────────────────────────────────────────────── */}
            {(paramDeltas.length > 0 || sideEffectEntries.length > 0) && (
              <div>
                <SLabel text="City Impact" />
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 3fr) minmax(200px, 4fr)', gap: 16, alignItems: 'flex-start' }}>

                  {/* Left Column: Parameter Deltas */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {paramDeltas.map(d => (
                      <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                        <span style={{ fontSize: 9, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt(d.key)}</span>
                        <span style={{
                          fontSize: 10, fontFamily: "'Share Tech Mono', monospace", fontWeight: 700,
                          color: d.diff > 0 ? '#86efac' : '#fca5a5',
                          minWidth: 32, textAlign: 'right',
                        }}>{d.diff > 0 ? '+' : ''}{d.diff}</span>
                        <span style={{ fontSize: 8, color: d.diff > 0 ? '#22c55e' : '#ef4444', width: 10, textAlign: 'center' }}>{d.diff > 0 ? '↑' : '↓'}</span>
                      </div>
                    ))}
                    {sideEffectEntries.length > 0 && (
                      <>
                        <div style={{ height: 1, background: '#1c3652', margin: '2px 0' }} />
                        {sideEffectEntries.map(([k, v]) => (
                          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                            <span style={{ fontSize: 9, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt(k)}</span>
                            <span style={{
                              fontSize: 10, fontFamily: "'Share Tech Mono', monospace", fontWeight: 700,
                              color: v < 0 ? '#fca5a5' : '#86efac',
                              minWidth: 32, textAlign: 'right',
                            }}>{v > 0 ? '+' : ''}{Math.round(v * 10) / 10}</span>
                            <span style={{ fontSize: 7, color: '#475569', width: 10, textAlign: 'center' }}>SE</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Right Column: Spanning Analysis */}
                  {tr.evaluator_reasoning && (
                    <div style={{ paddingLeft: 12, borderLeft: '1px solid #1c3652', height: '100%' }}>
                      <div style={{ fontSize: 7, color: '#94a3b8', letterSpacing: '0.12em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 4 }}>IMPLEMENTATION ANALYSIS</div>
                      <div style={{ fontSize: 9, color: '#cbd5e1', lineHeight: 1.5, fontStyle: 'italic' }}>
                        "{tr.evaluator_reasoning}"
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── APPROVAL VERDICT ─────────────────────────────────────────── */}
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(255,255,255,0.02)', border: '1px solid #1c3652',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 9, color: '#4b6280', letterSpacing: '0.08em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>APPROVAL</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 18, fontFamily: "'Share Tech Mono', monospace", color: '#fff', fontWeight: 700 }}>{approvalAfter}%</span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: approvalColor, fontWeight: 700 }}>
                    {approvalDelta > 0 ? '↑' : approvalDelta < 0 ? '↓' : '─'} {Math.abs(approvalDelta)}%
                  </div>
                </div>
              </div>
              {(() => {
                if (!tr.ward_report || tr.ward_report.length === 0) return null;
                const sorted = [...tr.ward_report].sort((a, b) => b.avg_wellbeing_delta - a.avg_wellbeing_delta);
                const best = sorted[0];
                const worst = sorted[sorted.length - 1];
                return (
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {best && best.avg_wellbeing_delta > 0 && (
                      <div style={{ flex: 1, padding: '4px 8px', background: 'rgba(34,197,94,0.05)', borderRadius: 4, border: '1px solid rgba(34,197,94,0.1)' }}>
                        <div style={{ fontSize: 7, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Most Excited</div>
                        <div style={{ fontSize: 10, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                          <span>{best.group_name}</span>
                          <span style={{ color: '#4ade80', fontFamily: "'Share Tech Mono', monospace" }}>+{best.avg_wellbeing_delta.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                    {worst && worst.avg_wellbeing_delta < 0 && (
                      <div style={{ flex: 1, padding: '4px 8px', background: 'rgba(248,113,113,0.05)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.1)' }}>
                        <div style={{ fontSize: 7, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Most Angry</div>
                        <div style={{ fontSize: 10, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                          <span>{worst.group_name}</span>
                          <span style={{ color: '#f87171', fontFamily: "'Share Tech Mono', monospace" }}>{worst.avg_wellbeing_delta.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* ── BUDGET SNAPSHOT ─────────────────────────────────────────── */}
            <div>
              <SLabel text="Treasury Ledger" />
              <div style={{ background: 'rgba(15,23,42,0.4)', borderRadius: 6, padding: '8px 12px', border: '1px solid #1e293b', fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#cbd5e1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
                  <span style={{ color: '#94a3b8' }}>Starting Treasury</span>
                  <span>₹{fmtNum((tr.treasury_after ?? 0) - netTreasury)} Cr</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
                  <span style={{ color: '#4ade80' }}>(+) Tax Revenue</span>
                  <span style={{ color: '#4ade80' }}>+₹{fmtNum(tr.tax_revenue ?? 0)} Cr</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
                  <span style={{ color: '#f87171' }}>(-) Policy Cost</span>
                  <span style={{ color: '#f87171' }}>-₹{fmtNum(tr.major_policy?.budget_cost ?? 0)} Cr</span>
                </div>
                {tr.budget_stolen > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4, fontSize: 9, fontStyle: 'italic' }}>
                    <span style={{ color: '#fb923c', paddingLeft: 12 }}>↳ Includes Leakage</span>
                    <span style={{ color: '#fb923c' }}>₹{fmtNum(tr.budget_stolen)} Cr</span>
                  </div>
                )}
                {tr.interest_paid > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
                    <span style={{ color: '#f87171' }}>(-) Debt Interest</span>
                    <span style={{ color: '#f87171' }}>-₹{fmtNum(tr.interest_paid ?? 0)} Cr</span>
                  </div>
                )}
                <div style={{ height: 1, background: '#334155', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2, fontWeight: 700, fontSize: 13, color: '#f0c040' }}>
                  <span>Final Treasury</span>
                  <span>₹{fmtNum(tr.treasury_after ?? 0)} Cr</span>
                </div>
              </div>
            </div>

            {/* ── EVENTS ──────────────────────────────────────────────────── */}
            {tr.events_triggered?.length > 0 && (
              <div>
                <SLabel text="Events" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {tr.events_triggered.map(ev => {
                    const isCrisis = ev.type === 'crisis'
                    return (
                      <div key={ev.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 4,
                        background: isCrisis ? 'rgba(248,113,113,0.07)' : 'rgba(34,197,94,0.07)',
                        border: `1px solid ${isCrisis ? '#7f1d1d55' : '#14532d55'}`,
                      }}>
                        <div style={{ fontSize: 14, color: isCrisis ? '#ef4444' : '#22c55e', alignSelf: 'flex-start', marginTop: 2 }}>{isCrisis ? '⚠' : '✦'}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: isCrisis ? '#fca5a5' : '#86efac' }}>{ev.name}</div>
                            <div style={{ fontSize: 7, color: isCrisis ? '#f87171' : '#4ade80', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                              {isCrisis ? 'CRISIS' : 'OPPORTUNITY'}
                            </div>
                          </div>
                          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>
                            {isCrisis ? `Severity ${ev.severity} · Due to poor city metrics · ${ev.turns_remaining} turn${ev.turns_remaining !== 1 ? 's' : ''} remaining` : `A positive momentum event in ${ev.portfolio ?? 'the city'}`}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── OPPOSITION & TENSION ────────────────────────────────────── */}
            {(() => {
              const oppositionHeadline = (tr.media_headlines ?? [])
                .find(h => h.lean === 'opposition')
                ?.headline ?? null
              const hasOpposition = !!(tr.opposition_attack || oppositionHeadline)
              const hasTension = (tr.communal_tension_after ?? 0) > 0
              if (!hasOpposition && !hasTension) return null
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hasOpposition && (
                    <div style={{ padding: '8px 10px', borderRadius: 6, background: 'linear-gradient(135deg, rgba(248,113,113,0.08), rgba(248,113,113,0.02))', border: '1px solid rgba(248,113,113,0.2)' }}>
                      <div style={{ fontSize: 7, color: '#ef4444', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 6 }}>POLITICAL ATTACK</div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ fontSize: 20, color: '#7f1d1d', lineHeight: 1 }}>"</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: '#cbd5e1', lineHeight: 1.5, fontStyle: 'italic', marginBottom: 6 }}>
                            {oppositionHeadline || tr.opposition_attack}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(248,113,113,0.1)', paddingTop: 6 }}>
                            <div style={{ fontSize: 8, color: '#f87171', fontWeight: 600 }}>— Opposition Quote</div>
                            {tr.counter_frame && (
                              <div style={{ fontSize: 8, color: '#94a3b8' }}>
                                Mayor's PR Defense: <span style={{ color: '#60a5fa', fontWeight: 600 }}>{tr.counter_frame}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {hasTension && (
                    <div style={{ padding: '5px 8px', borderRadius: 4, background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)' }}>
                      <div style={{ fontSize: 7, color: '#64748b', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 3 }}>COMMUNAL TENSION</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: '#0a1a30', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, tr.communal_tension_after ?? 0)}%`, height: '100%', background: '#fb923c', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 9, color: '#fb923c', fontFamily: "'Share Tech Mono', monospace", fontWeight: 700 }}>{Math.round(tr.communal_tension_after ?? 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── ADVISOR DEBRIEF ─────────────────────────────────────────── */}
            {tr.advisor_summary && (
              <div style={{
                padding: '8px 10px', borderRadius: 5,
                background: 'rgba(232,160,48,0.05)', border: '1px solid rgba(232,160,48,0.18)',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <div style={{ fontSize: 16, marginTop: -1 }}>📋</div>
                <div>
                  <div style={{ fontSize: 7, fontWeight: 700, color: '#e8a030', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', marginBottom: 3 }}>ADVISOR DEBRIEF</div>
                  <div style={{ fontSize: 10, color: '#b8924a', lineHeight: 1.6 }}>{tr.advisor_summary}</div>
                </div>
              </div>
            )}

          </div>
        )
      })()}
    </div>
  )
}

// ─── Live Milestone Feed ───────────────────────────────────────────────────────

function LiveMilestoneFeed({ milestones, policyName, approvalVotes, evalReasoning }: {
  milestones: Record<string, unknown>[]
  policyName: string
  approvalVotes?: { sentiment: string; weight: number }[]
  evalReasoning?: string | null
}) {
  const feedEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [milestones.length])

  const dot = (color: string) => (
    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, marginRight: 5, flexShrink: 0 }} />
  )

  function renderMilestone(m: Record<string, unknown>, i: number) {
    const base = { display: 'flex', flexDirection: 'column' as const, gap: 2 }

    if (m.type === 'policy_start') {
      const effects = m.target_effects as Record<string, number> | undefined
      const topEffect = effects ? Object.entries(effects).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] : null
      return (
        <div key={i} style={base}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {dot('#4ade80')}
            <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em' }}>
              {m.policy_name as string}
            </span>
            <span style={{ fontSize: 9, color: '#64748b', marginLeft: 2 }}>· {m.portfolio as string}</span>
          </div>
          <div style={{ paddingLeft: 11, fontSize: 9, color: '#4b6280', display: 'flex', gap: 8 }}>
            <span>₹{m.budget_cost as number} Cr</span>
            {topEffect && <span style={{ color: topEffect[1] >= 0 ? '#4ade80' : '#f87171' }}>{topEffect[0].replace(/_/g, ' ')} {topEffect[1] >= 0 ? '+' : ''}{topEffect[1]}</span>}
          </div>
        </div>
      )
    }

    if (m.type === 'implementation') {
      const score = (m.execution_score as number) * 100
      const stolen = m.budget_stolen as number
      const color = score >= 70 ? '#4ade80' : score >= 40 ? '#f59e0b' : '#f87171'
      return (
        <div key={i} style={base}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {dot(color)}
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Implementation · <span style={{ color: '#7dd3fc' }}>{m.minister_name as string}</span></span>
          </div>
          <div style={{ paddingLeft: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 60, height: 4, background: '#1c3652', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9, color }}>  {Math.round(score)}% exec</span>
            {stolen > 0 && <span style={{ fontSize: 9, color: '#f87171' }}>· ₹{stolen.toFixed(1)} Cr leaked</span>}
          </div>
        </div>
      )
    }

    if (m.type === 'events') {
      const triggered = m.events_triggered as { name: string; type: string; severity: number }[]
      if (triggered.length === 0) {
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {dot('#334155')}
            <span style={{ fontSize: 9, color: '#4b6280', fontStyle: 'italic' }}>No new events</span>
          </div>
        )
      }
      return (
        <div key={i} style={base}>
          {triggered.map((ev, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: ev.type === 'crisis' ? '#f87171' : '#4ade80' }}>
                {ev.type === 'crisis' ? '⚠' : '✦'}
              </span>
              <span style={{ fontSize: 9, color: ev.type === 'crisis' ? '#fca5a5' : '#86efac' }}>{ev.name}</span>
              <span style={{ fontSize: 8, color: '#4b6280' }}>sev {ev.severity}</span>
            </div>
          ))}
        </div>
      )
    }

    if (m.type === 'wellbeing_update') {
      const ward = (m.ward_report ?? []) as { group_type: string; avg_wellbeing: number; trend: string }[]
      const avgWb = ward.length > 0
        ? Math.round(ward.reduce((s, w) => s + w.avg_wellbeing, 0) / ward.length)
        : null
      const upCount = ward.filter(w => w.trend === 'up').length
      const downCount = ward.filter(w => w.trend === 'down').length
      const netTrend = upCount > downCount ? '↑' : upCount < downCount ? '↓' : '─'
      const trendColor = netTrend === '↑' ? '#4ade80' : netTrend === '↓' ? '#f87171' : '#64748b'
      return (
        <div key={i} style={{
          background: 'rgba(255,255,255,0.02)', borderRadius: 4,
          padding: '5px 8px', border: '1px solid #1c3652',
        }}>
          <div style={{ fontSize: 8, color: '#4b6280', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", marginBottom: 4 }}>WELLBEING UPDATE</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {avgWb !== null && (
              <span style={{ fontSize: 11, color: trendColor, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace" }}>
                {netTrend} avg {avgWb}
              </span>
            )}
            <span style={{ fontSize: 9, color: '#22c55e' }}>↑ {upCount} groups</span>
            <span style={{ fontSize: 9, color: '#f87171' }}>↓ {downCount} groups</span>
          </div>
        </div>
      )
    }

    if (m.type === 'politics') {
      const aBefore = Math.round(m.approval_before as number)
      const aAfter = Math.round(m.approval_after as number)
      const delta = aAfter - aBefore
      const color = delta >= 0 ? '#4ade80' : '#f87171'
      return (
        <div key={i} style={base}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {dot('#38bdf8')}
            <span style={{ fontSize: 9, color: '#94a3b8' }}>Politics · <span style={{ color: '#fbbf24' }}>{m.attack as string}</span> vs <span style={{ color: '#34d399' }}>{m.counter as string}</span></span>
          </div>
          <div style={{ paddingLeft: 11, fontSize: 9, color }}>
            Approval {aBefore}% → {aAfter}% ({delta >= 0 ? '+' : ''}{delta}%)
          </div>
        </div>
      )
    }

    if (m.type === 'narrative_chunk') {
      const key = m.key as string
      if (key === 'delivery') {
        const text = m.value as string
        return (
          <div key={i} style={{ padding: '8px 10px', background: 'rgba(56,189,248,0.06)', borderRadius: 4, border: '1px solid rgba(56,189,248,0.15)', marginTop: 8 }}>
            <div style={{ fontSize: 7, color: '#38bdf8', letterSpacing: '0.12em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 4 }}>ON THE GROUND</div>
            <div style={{ fontSize: 10, color: '#e0f2fe', lineHeight: 1.6, fontStyle: 'italic' }}>
              "{text}"
            </div>
          </div>
        )
      }
      if (key === 'headlines') {
        const hs = m.value as { outlet: string; headline: string }[]
        return (
          <div key={i} style={base}>
            {hs.slice(0, 2).map((h, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <Newspaper size={8} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: '#94a3b8' }}><span style={{ color: '#64748b' }}>{h.outlet || (h as any).outlet_name}:</span> {h.headline}</span>
              </div>
            ))}
          </div>
        )
      }
      if (key === 'advisor') {
        const text = m.value as string
        return (
          <div key={i} style={{ paddingLeft: 2, borderLeft: '2px solid #92400e' }}>
            <div style={{ fontSize: 9, color: '#d97706', fontStyle: 'italic' }}>
              ★ {text.slice(0, 100)}{text.length > 100 ? '…' : ''}
            </div>
          </div>
        )
      }
      return null
    }

    return null
  }

  return (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Loader2 size={10} className="animate-spin" color="#4ade80" />
        TURN IN PROGRESS
        {policyName && <span style={{ color: '#4b6280', fontWeight: 400, fontSize: 9 }}>· {policyName}</span>}
      </div>
      {milestones.length === 0 && (
        <div style={{ color: '#4b6280', fontSize: 9, fontStyle: 'italic' }}>Initialising...</div>
      )}
      {milestones.map((m, i) => renderMilestone(m, i))}

      {/* AI Evaluation reasoning */}
      {evalReasoning && (
        <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: '2px solid #334155', marginTop: 8 }}>
          <div style={{ fontSize: 7, color: '#94a3b8', letterSpacing: '0.12em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 2 }}>IMPLEMENTATION ANALYSIS</div>
          <div style={{ fontSize: 10, color: '#cbd5e1', lineHeight: 1.5 }}>
            {evalReasoning}
          </div>
        </div>
      )}

      {/* Live approval bar */}
      {approvalVotes && approvalVotes.length > 0 && (() => {
        const total = approvalVotes.length
        const approveW = approvalVotes.filter(v => v.sentiment === 'approve').reduce((s, v) => s + v.weight, 0)
        const totalW = approvalVotes.reduce((s, v) => s + v.weight, 0)
        const approvalPct = totalW > 0 ? Math.round((approveW / totalW) * 100) : 50
        const approveCt = approvalVotes.filter(v => v.sentiment === 'approve').length
        const disapproveCt = approvalVotes.filter(v => v.sentiment === 'disapprove').length
        const col = approvalPct >= 50 ? '#22c55e' : '#f87171'
        return (
          <div style={{ marginTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em', color: '#4b6280' }}>CITIZEN POLL ({total} voted)</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: col, fontFamily: "'Share Tech Mono', monospace" }}>{approvalPct}%</span>
            </div>
            <div style={{ height: 6, background: '#0b1929', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${approvalPct}%`, background: col, borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
              <span style={{ fontSize: 9, color: '#22c55e' }}>✓ {approveCt}</span>
              <span style={{ fontSize: 9, color: '#f87171' }}>✗ {disapproveCt}</span>
            </div>
          </div>
        )
      })()}

      <div ref={feedEndRef} />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GameDashboard({ gameId, initialState }: { gameId: string; initialState: GameState }) {
  const [gameState, setGameState] = useState<GameState>(initialState)
  const [lastTurn, setLastTurn] = useState<TurnResult | null>(initialState.last_turn)
  const [turnHistory, setTurnHistory] = useState<TurnEntry[]>([])
  const initialTreasury = useRef(initialState.treasury)

  // Unified council chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [consultLoading, setConsultLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  // Track who is open in backend (one at a time)
  const activeConsultRef = useRef<string | null>(null)

  // Minister expand
  const [expandedMinisterId, setExpandedMinisterId] = useState<string | null>(null)

  // All parameters panel
  const [showAllParams, setShowAllParams] = useState(false)

  // Minor Action


  // Policy modal
  const [policyOptions, setPolicyOptions] = useState<Policy[] | null>(null)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [fetchingPolicies, setFetchingPolicies] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [discussingPolicyIndex, setDiscussingPolicyIndex] = useState<number | null>(null)

  // Minister picker (v2 flow)
  const [pendingPolicyIndex, setPendingPolicyIndex] = useState<number | null>(null)
  const [showMinisterPicker, setShowMinisterPicker] = useState(false)

  // Turn execution
  const [isTurnExecuting, setIsTurnExecuting] = useState(false)
  const [executingPolicyName, setExecutingPolicyName] = useState<string | null>(null)
  const [executingPolicy, setExecutingPolicy] = useState<Policy | null>(null)
  const [turnError, setTurnError] = useState<string | null>(null)
  const [liveMilestones, setLiveMilestones] = useState<Record<string, unknown>[]>([])

  // Live approval poll tracking
  const [liveApprovalVotes, setLiveApprovalVotes] = useState<{ sentiment: string; weight: number }[]>([])
  const [liveEvalReasoning, setLiveEvalReasoning] = useState<string | null>(null)
  // Live approval — updated from approval_final event so top bar updates before complete
  const [liveApproval, setLiveApproval] = useState<number | null>(null)

  // Accumulated feed: voices + media accumulate turn-over-turn with a turn number tag
  const [allVoices, setAllVoices] = useState<(CitizenVoice & { turnNum: number })[]>([])
  const [allHeadlines, setAllHeadlines] = useState<(MediaHeadline & { turnNum: number; isBreaking?: boolean })[]>([])

  // Turn-start briefing
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [briefingStage, setBriefingStage] = useState(0) // 0-4 progress steps
  const [briefingStatus, setBriefingStatus] = useState('Initializing...')
  const [briefingItems, setBriefingItems] = useState<{ type: string; text: string }[]>([])
  const [briefingThinking, setBriefingThinking] = useState('')
  const briefingFetchedForTurn = useRef<number>(0)
  const briefingFeedEndRef = useRef<HTMLDivElement>(null)
  const briefingThinkingRef = useRef<HTMLDivElement>(null)
  const briefingQueueRef = useRef<{ type: string; text: string; delayMs: number }[]>([])
  const briefingQueueRunningRef = useRef(false)
  const briefingQueueCancelledRef = useRef(false)

  // Game over
  const [gameOver, setGameOver] = useState(false)
  const [scorecard, setScorecard] = useState<GovernanceScorecard | null>(null)

  // Identity groups filter + expansion
  const [identityFilter, setIdentityFilter] = useState<string>('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const mediaScrollRef = useRef<HTMLDivElement>(null)
  const chatterScrollRef = useRef<HTMLDivElement>(null)
  const hasChatThisTurnRef = useRef(false)
  // Cabinet is "in session" after @all — stays open until mayor addresses someone directly
  const cabinetInSessionRef = useRef(false)

  // Theme music
  const TRACKS = ['/theme.mp3', '/theme2.mp3']
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isMuted, setIsMuted] = useState(false)

  // Initialize with a random track
  const [currentTrackIndex, setCurrentTrackIndex] = useState(() => Math.floor(Math.random() * TRACKS.length))
  const musicStartedRef = useRef(false)

  // Start music on first user interaction (browser autoplay policy)
  useEffect(() => {
    const startMusic = () => {
      if (musicStartedRef.current) return
      const audio = audioRef.current
      if (audio) {
        audio.volume = 0.3
        audio.play().then(() => {
          musicStartedRef.current = true
          setIsMuted(false)
        }).catch(() => { })
      }
    }
    document.addEventListener('click', startMusic, { once: true })
    return () => document.removeEventListener('click', startMusic)
  }, [])

  const toggleMusic = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isMuted) {
      audio.play().then(() => setIsMuted(false)).catch(() => { })
    } else {
      audio.pause()
      setIsMuted(true)
    }
  }

  const nextTrack = () => {
    // Pick a random track that isn't the current one
    let nextIdx;
    if (TRACKS.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * TRACKS.length)
      } while (nextIdx === currentTrackIndex)
    } else {
      nextIdx = 0
    }

    setCurrentTrackIndex(nextIdx)
    const audio = audioRef.current
    if (audio) {
      audio.src = TRACKS[nextIdx]
      if (!isMuted && musicStartedRef.current) {
        audio.play().catch(() => { })
      }
    }
  }

  // ── Auto-briefing + auto-policies on turn start ──────────────────────────
  const processBriefingQueue = useCallback(async () => {
    if (briefingQueueRunningRef.current) return
    briefingQueueRunningRef.current = true
    try {
      while (!briefingQueueCancelledRef.current && briefingQueueRef.current.length > 0) {
        const next = briefingQueueRef.current.shift()
        if (!next) continue
        setBriefingItems(prev => [...prev, { type: next.type, text: next.text }])
        briefingFeedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        await new Promise(r => setTimeout(r, next.delayMs))
      }
    } finally {
      briefingQueueRunningRef.current = false
    }
  }, [])

  const enqueueBriefingItems = useCallback((
    items: { type: string; text: string }[],
    delayMs = 600,
  ) => {
    for (const item of items) {
      briefingQueueRef.current.push({ ...item, delayMs })
    }
    void processBriefingQueue()
  }, [processBriefingQueue])

  const waitForBriefingQueueDrain = useCallback(async (maxWaitMs = 6000) => {
    const started = Date.now()
    while (Date.now() - started < maxWaitMs) {
      const pending = briefingQueueRef.current.length
      const running = briefingQueueRunningRef.current
      if (!running && pending === 0) return
      await new Promise(r => setTimeout(r, 50))
    }
  }, [])

  useEffect(() => {
    // Keep queue active even if this effect returns early (important for React StrictMode double-invoke).
    briefingQueueCancelledRef.current = false

    const turn = gameState.current_turn
    if (briefingFetchedForTurn.current >= turn) return
    if (isTurnExecuting) return
    if (gameOver) return

    briefingQueueRef.current = []
    briefingQueueRunningRef.current = false
    briefingFetchedForTurn.current = turn
    setBriefingLoading(true)
    setBriefingStage(0)
    setBriefingStatus('Initializing...')
    setBriefingThinking('')
    setBriefingItems([])

    const run = async () => {
      try {
        for await (const event of streamTurnBriefing(gameId)) {
          const type = event.type as string

          if (type === 'city_snapshot') {
            setBriefingStage(1)
            setBriefingStatus('City snapshot loaded')
            const worst = (event.worst_3 as { key: string; value: number }[]) || []
            const best = (event.best_3 as { key: string; value: number }[]) || []
            const items: { type: string; text: string }[] = []
            for (const w of worst) {
              items.push({ type: 'alert', text: `⚠ ${w.key.replace(/_/g, ' ')} at ${w.value}` })
            }
            for (const b of best) {
              items.push({ type: 'good', text: `✓ ${b.key.replace(/_/g, ' ')} at ${b.value}` })
            }
            const activeEvents = (event.active_events as { name: string }[]) || []
            for (const e of activeEvents) {
              items.push({ type: 'crisis', text: `🔴 Active crisis: ${e.name}` })
            }
            enqueueBriefingItems(items, 500)
          }

          if (type === 'status') {
            setBriefingStatus(event.message as string)
          }

          if (type === 'headlines') {
            setBriefingStage(2)
            const headlines = (event.headlines as MediaHeadline[]) || []
            setAllHeadlines(prev => [
              ...prev,
              ...headlines.map(h => ({ ...h, turnNum: turn })),
            ])
            enqueueBriefingItems(
              headlines.map(h => ({ type: 'headline', text: `📰 ${h.outlet}: ${h.headline}` })),
              500,
            )
          }

          if (type === 'voices') {
            setBriefingStage(3)
            const voices = (event.voices as CitizenVoice[]) || []
            setAllVoices(prev => [
              ...prev,
              ...voices.map(v => ({ ...v, turnNum: turn })),
            ])
            enqueueBriefingItems(
              voices.map(v => ({ type: 'voice', text: `💬 ${v.name}: "${v.reaction}"` })),
              500,
            )
          }

          if (type === 'thinking') {
            setBriefingThinking(prev => prev + (event.chunk as string))
            briefingThinkingRef.current?.scrollTo({ top: briefingThinkingRef.current.scrollHeight, behavior: 'smooth' })
          }

          if (type === 'policies') {
            setBriefingStage(4)
            setBriefingStatus('Briefing complete — policy options ready')
            setPolicyOptions((event.options as Policy[]) || [])
          }

          if (type === 'complete') {
            await waitForBriefingQueueDrain(6000)
            await new Promise(r => setTimeout(r, 300))
            setBriefingLoading(false)
            setShowPolicyModal(true)
          }

          if (type === 'error') {
            console.error('Briefing stream error:', event.message)
            setBriefingLoading(false)
          }
        }
      } catch (err) {
        console.error('Briefing stream failed:', err)
        setBriefingLoading(false)
      }
    }
    void run()
    return () => {
      briefingQueueCancelledRef.current = true
      briefingQueueRef.current = []
    }
  }, [gameState.current_turn, isTurnExecuting, gameOver, gameId, enqueueBriefingItems, waitForBriefingQueueDrain])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])
  const mediaHoveredRef = useRef(false)
  const chatterHoveredRef = useRef(false)
  const mediaInnerRef = useRef<HTMLDivElement>(null)
  const chatterInnerRef = useRef<HTMLDivElement>(null)

  // Seamless marquee scroll for Media — content is rendered twice;
  // when scroll passes the first copy, snap back invisibly
  useEffect(() => {
    const id = setInterval(() => {
      const el = mediaScrollRef.current
      const inner = mediaInnerRef.current
      if (!el || !inner || mediaHoveredRef.current) return
      const oneHeight = inner.offsetHeight
      if (oneHeight === 0) return
      if (el.scrollTop >= oneHeight) {
        el.scrollTop -= oneHeight
      } else {
        el.scrollTop += 1
      }
    }, 40)
    return () => clearInterval(id)
  }, [])

  // When new headlines arrive, snap to just before the end of the first copy
  // so the newest item scrolls into view quickly (marquee will carry it forward)
  useEffect(() => {
    const el = mediaScrollRef.current
    const inner = mediaInnerRef.current
    if (!el || !inner || mediaHoveredRef.current) return
    // Snap to near-end of first copy so new item is immediately visible
    requestAnimationFrame(() => {
      if (el && inner) el.scrollTop = inner.offsetHeight - el.clientHeight - 4
    })
  }, [allHeadlines.length])

  // Seamless marquee scroll for City Chatter
  useEffect(() => {
    const id = setInterval(() => {
      const el = chatterScrollRef.current
      const inner = chatterInnerRef.current
      if (!el || !inner || chatterHoveredRef.current) return
      const oneHeight = inner.offsetHeight
      if (oneHeight === 0) return
      if (el.scrollTop >= oneHeight) {
        el.scrollTop -= oneHeight
      } else {
        el.scrollTop += 1
      }
    }, 40)
    return () => clearInterval(id)
  }, [])

  // When new voices arrive, snap to near-end of first copy
  useEffect(() => {
    const el = chatterScrollRef.current
    const inner = chatterInnerRef.current
    if (!el || !inner || chatterHoveredRef.current) return
    requestAnimationFrame(() => {
      if (el && inner) el.scrollTop = inner.offsetHeight - el.clientHeight - 4
    })
  }, [allVoices.length])

  // Auto-select first filterable identity type when ward report loads
  const wardReportKey = (gameState.ward_report ?? []).map(e => `${e.group_type}:${e.group_name}`).join(',')
  useEffect(() => {
    const source = lastTurn?.ward_report ?? gameState.ward_report ?? []
    const counts: Record<string, Set<string>> = {}
    for (const entry of source) {
      if (!counts[entry.group_type]) counts[entry.group_type] = new Set()
      counts[entry.group_type].add(entry.group_name)
    }
    const types = Object.entries(counts)
      .filter(([, names]) => names.size >= 2 && names.size <= 8)
      .map(([type]) => type)
    if (types.length > 0 && !types.includes(identityFilter)) {
      setIdentityFilter(types[0])
    }
  }, [wardReportKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Consultation helpers ─────────────────────────────────────────────────

  // Send message through one minister's consultation, get reply.
  // priorRoundReplies: replies already collected in THIS send-round (so each minister
  // can genuinely build on what their colleagues just said, not hallucinate).
  async function getMinisterReply(
    m: Minister,
    mayorMsg: string,
    isBroadcast: boolean = false,
    priorRoundReplies: RoundReply[] = []
  ): Promise<string> {
    // Close any different minister that's currently open
    if (activeConsultRef.current && activeConsultRef.current !== m.id) {
      console.log(`[getMinisterReply] Closing consultation with ${activeConsultRef.current} before opening ${m.name}`)
      await closeConsultation(gameId).catch((e) => { console.warn('[getMinisterReply] Close failed:', e) })
      activeConsultRef.current = null
    }
    // Open this minister's consultation if not already open.
    // For broadcast @all: skip the LLM opening statement (silent=true) — saves
    // one full LLM call per minister and avoids serial timeout chains.
    if (activeConsultRef.current !== m.id) {
      console.log(`[getMinisterReply] Opening consultation with ${m.name} (silent=${isBroadcast})`)
      await openConsultation(gameId, m.id, isBroadcast)
      activeConsultRef.current = m.id
      console.log(`[getMinisterReply] Opened. Sending message...`)
    }
    // Build context: only include messages from current turn (after last system separator)
    const lastSysIdx = [...chatMessages].reverse().findIndex(m => m.isSystem)
    const msgsThisTurn = lastSysIdx >= 0
      ? chatMessages.slice(chatMessages.length - lastSysIdx)
      : chatMessages
    // stale React state — only used for minister 1 (when no round replies yet)
    const recentContext = msgsThisTurn.slice(-6)
      .filter(msg => !msg.isMayor && !msg.isSystem)
      .map(msg => `${msg.sender} (${msg.senderRole}): ${msg.text}`)
      .join('\n')
    // Only include last-turn summary if player has actually chatted this turn
    const turnCtx = (lastTurn && hasChatThisTurnRef.current)
      ? `[Last turn: "${lastTurn.major_policy?.name}" · ${Math.round(lastTurn.execution_score * 100)}% exec · approval ${Math.round((lastTurn as any).approval_before ?? 0)}%→${Math.round(lastTurn.interim_approval)}%]\n`
      : ''
    const mediaCtx = allHeadlines.slice(-3)
      .map(h => `[${h.outlet}: "${h.headline}"]`)
      .join('\n')
    const cityChatterCtx = allVoices.slice(-5)
      .map(v => `[${v.name} (${v.sentiment ?? 'neutral'}): "${v.reaction}"]`)
      .join('\n')

    // Replies already collected THIS round — always fresh, no React state staleness
    // Frame as a live discussion thread so each minister feels they're jumping into a debate
    const thisRoundCtx = priorRoundReplies.length > 0
      ? priorRoundReplies.map(r => `${r.name} (${r.portfolio}): "${r.text}"`).join('\n')
      : ''
    // Only fall back to stale React context for the first minister (when no round replies yet)
    const priorSessionCtx = priorRoundReplies.length === 0 ? recentContext : ''
    // Label the mayor's message differently for cabinet-wide questions
    const mayorBlock = isBroadcast
      ? `[Cabinet Meeting, Turn ${gameState.current_turn} — The Mayor addresses the full cabinet:]\nMayor: ${mayorMsg}`
      : `Mayor: ${mayorMsg}`

    const fullMsg = turnCtx
      + (mediaCtx ? `[Recent media coverage:\n${mediaCtx}]\n` : '')
      + (cityChatterCtx ? `[What citizens are saying:\n${cityChatterCtx}]\n` : '')
      + (priorSessionCtx ? `[Council room — earlier this session:\n${priorSessionCtx}]\n\n` : '')
      + (thisRoundCtx ? `[Cabinet discussion so far — respond to these colleagues, don't just agree:\n${thisRoundCtx}]\n\n` : '')
      + mayorBlock
    const res = await messageMinister(gameId, fullMsg)
    return res.reply
  }

  // ── Main send handler ────────────────────────────────────────────────────

  async function handleSendMessage() {
    if (!chatInput.trim() || consultLoading) return

    const msg = chatInput.trim()
    setChatInput('')
    setChatError(null)
    hasChatThisTurnRef.current = true
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Add mayor's message
    setChatMessages(prev => [...prev, {
      isMayor: true, sender: 'Mayor', senderRole: '', text: msg,
      time: now, ringColor: '#d97706', seed: 'mayor',
    }])
    setConsultLoading(true)

    try {
      const ministers = gameState.ministers
      const isBroadcast = BROADCAST_RE.test(msg)
      const directMentions = parseMentioned(msg, ministers)

      // Cabinet session state:
      // - @all opens the session → all ministers engage
      // - Follow-up generic messages (no @name) → top 2-3 relevant ministers stay engaged
      // - @name closes the session → only addressed minister responds
      if (isBroadcast) {
        cabinetInSessionRef.current = true
      } else if (directMentions.length > 0) {
        cabinetInSessionRef.current = false
      }

      const cabinetHot = cabinetInSessionRef.current && !isBroadcast
      const responderIndices = selectResponders(msg, ministers, cabinetHot)

      console.log(`[Advisory Chat] Broadcast=${isBroadcast}, CabinetSession=${cabinetInSessionRef.current}, Responders=${responderIndices.length}:`, responderIndices.map(i => ministers[i]?.name))

      // Accumulate replies from this round so each minister genuinely sees
      // what colleagues already said — prevents hallucination of prior remarks
      const roundReplies: RoundReply[] = []

      for (let ri = 0; ri < responderIndices.length; ri++) {
        const idx = responderIndices[ri]
        const m = ministers[idx]
        if (!m) { console.warn(`[Advisory Chat] No minister at index ${idx}`); continue }
        const mColor = MINISTER_COLORS[idx % MINISTER_COLORS.length]

        // Staggered delay between ministers (skipped for the first one)
        if (roundReplies.length > 0) {
          const delay = 600 + Math.floor(Math.random() * 900) // 600–1500ms
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        console.log(`[Advisory Chat] Requesting reply ${ri + 1}/${responderIndices.length} from ${m.name} (${m.portfolio})`)

        try {
          const reply = await getMinisterReply(m, msg, isBroadcast, roundReplies)

          // Push BEFORE next iteration so the next minister sees this reply
          roundReplies.push({ name: m.name, portfolio: m.portfolio, text: reply })

          const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setChatMessages(prev => [...prev, {
            isMayor: false, sender: m.name, senderRole: m.portfolio,
            text: reply, time: replyTime,
            ringColor: mColor, seed: m.name,
          }])
          console.log(`[Advisory Chat] Got reply from ${m.name}`)
        } catch (e) {
          console.error(`[Advisory Chat] Reply from ${m.name} failed:`, e)
          // Show a subtle "unavailable" message so user knows this minister tried
          const failTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setChatMessages(prev => [...prev, {
            isMayor: false, sender: m.name, senderRole: m.portfolio,
            text: '(unavailable right now)', time: failTime,
            ringColor: '#334155', seed: m.name,
            isSystemFallback: true,
          }])
          // Don't push to roundReplies — next minister must not reference a ghost reply
        }
      }
      console.log(`[Advisory Chat] Loop complete. ${roundReplies.length} replies collected.`)
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error(`[Advisory Chat] OUTER catch:`, e)
      setChatError(`Chat failed: ${errMsg}`)
    } finally {
      setConsultLoading(false)
    }
  }

  // ── Draft Policy → close consult → get policies ──────────────────────────

  async function handleDraftPolicy() {
    if (fetchingPolicies) return
    setFetchingPolicies(true)
    setPolicyError(null)
    try {
      // Close any open consultation so the transcript is sealed
      if (activeConsultRef.current) {
        await closeConsultation(gameId).catch(() => { })
        activeConsultRef.current = null
      }

      if (discussingPolicyIndex !== null && policyOptions) {
        // Amend only the discussed policy — collect chat messages since the discussion started as transcript
        const discussStartIdx = chatMessages.findLastIndex(m => m.isSystem && m.senderRole === 'POLICY REVIEW')
        const discussionMsgs = discussStartIdx >= 0 ? chatMessages.slice(discussStartIdx + 1) : []
        const transcript = discussionMsgs
          .map(m => `${m.sender}: ${m.text}`)
          .join('\n')
        const res = await amendPolicy(gameId, discussingPolicyIndex, transcript)
        setPolicyOptions(res.options)
        setDiscussingPolicyIndex(null)
      } else {
        // Fresh policy generation
        const res = await getPolicies(gameId)
        setPolicyOptions(res.options)
      }
      setShowPolicyModal(true)
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setPolicyError(`Failed to load policies: ${errMsg}`)
    } finally {
      setFetchingPolicies(false)
    }
  }


  // ── Execute Turn ─────────────────────────────────────────────────────────

  // Policy selected from modal → open minister picker
  function handleSelectPolicy(index: number) {
    if (isTurnExecuting) return
    setPendingPolicyIndex(index)
    setShowPolicyModal(false)
    setDiscussingPolicyIndex(null)
    setShowMinisterPicker(true)
  }

  // Policy selected for discussion → close modal, inject system message, return to chat
  function handleDiscussPolicy(policy: Policy, index: number) {
    setShowPolicyModal(false)
    setDiscussingPolicyIndex(index)
    // Keep policyOptions so we can amend in-place later
    const effectsSummary = Object.entries(policy.target_effects)
      .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v >= 0 ? '+' : ''}${v}`)
      .join(', ')
    const sideEffectsSummary = Object.entries(policy.side_effects)
      .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v >= 0 ? '+' : ''}${v}`)
      .join(', ')
    const summaryText = [
      `POLICY UNDER DISCUSSION: ${policy.name}`,
      `Portfolio: ${policy.portfolio} | Budget: ₹${fmtNum(policy.budget_cost)} Cr`,
      effectsSummary ? `Effects: ${effectsSummary}` : '',
      sideEffectsSummary ? `Side effects: ${sideEffectsSummary}` : '',
      policy.description,
      '',
      'Discuss this policy with your cabinet. When ready, click "Draft Policy" to get an amended version.',
    ].filter(Boolean).join('\n')

    setChatMessages(prev => [...prev, {
      isMayor: false, sender: 'System', senderRole: 'POLICY REVIEW',
      text: summaryText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ringColor: '#e8a030', seed: 'system', isSystem: true,
    }])
  }

  // Minister chosen → execute turn v2
  async function handleSelectMinister(ministerId: string) {
    console.log('[handleSelectMinister] called', { ministerId, isTurnExecuting, pendingPolicyIndex })
    if (isTurnExecuting || pendingPolicyIndex === null) {
      console.warn('[handleSelectMinister] blocked — isTurnExecuting:', isTurnExecuting, 'pendingPolicyIndex:', pendingPolicyIndex)
      return
    }
    const index = pendingPolicyIndex
    setShowMinisterPicker(false)
    setPendingPolicyIndex(null)
    setIsTurnExecuting(true)
    setTurnError(null)
    setLiveMilestones([])
    setLiveApprovalVotes([])
    setLiveEvalReasoning(null)
    setLiveApproval(null)
    hasChatThisTurnRef.current = false

    const selectedPolicy = policyOptions?.[index] ?? null
    setExecutingPolicyName(selectedPolicy?.name || 'Policy Execution')
    setExecutingPolicy(selectedPolicy)

    try {
      for await (const event of executeTurnStreamV2(gameId, index, ministerId, { type: 'governance_upkeep', budget: 0 })) {
        if (event.type === 'complete') {
          const tr = event.turn_result as TurnResult
          const newState = event.state as GameState

          setGameState(newState)
          setLastTurn(tr)
          const newEntry: TurnEntry = { turn: tr.turn, result: tr, expanded: true }
          setTurnHistory(prev => [newEntry, ...prev.map(e => ({ ...e, expanded: false }))])
          setPolicyOptions(null)
          setDiscussingPolicyIndex(null)
          setExecutingPolicyName(null)
          setExecutingPolicy(null)
          setPolicyError(null)
          setLiveApprovalVotes([])
          setLiveEvalReasoning(null)

          // Add turn separator to chat
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setChatMessages(prev => [...prev, {
            isMayor: false, sender: 'SYSTEM', senderRole: '',
            text: `── Turn ${tr.turn} complete · ${tr.major_policy?.name ?? 'Policy'} · Approval ${Math.round((tr as any).approval_before ?? 0)}% → ${Math.round(tr.interim_approval)}% ──`,
            time: now, ringColor: '#1c3652', seed: 'system', isSystem: true,
          }])
          activeConsultRef.current = null
          // NOTE: liveMilestones are NOT cleared here — they persist until the next turn starts
          // (cleared on turn start at line ~1407). This prevents the flash-disappear issue.

          // For v2: citizen_voices come in via streaming events, not the complete payload
          // Only accumulate media headlines from complete (voices already streamed)
          const turnNum = tr.turn
          if ((tr.media_headlines ?? []).length > 0) {
            setAllHeadlines(prev => [...prev, ...(tr.media_headlines ?? []).map(h => ({ ...h, turnNum }))])
          }
          if ((tr.citizen_voices ?? []).length > 0 && allVoices.filter(v => (v as any).turnNum === turnNum).length === 0) {
            setAllVoices(prev => [...prev, ...(tr.citizen_voices ?? []).map(v => ({ ...v, turnNum }))])
          }

          if (event.game_over) {
            setGameOver(true)
            if (event.scorecard) setScorecard(event.scorecard as GovernanceScorecard)
          }
          break
        }
        if (event.type === 'error') {
          setTurnError(`Turn error: ${event.message}`)
          break
        }
        if (event.type === 'game_over') {
          setGameState(event.state as GameState)
          setGameOver(true)
          break
        }

        // ── V2 agentic events ─────────────────────────────────────────────────
        const turnNum = gameState.current_turn

        if (event.type === 'announcement') {
          const pol = event.policy as Policy
          setAllHeadlines(prev => [...prev, {
            outlet: "MAYOR'S OFFICE",
            lean: 'mayor' as const,
            headline: `BREAKING: Mayor announces "${pol.name}" — led by ${event.minister_name}`,
            turnNum,
            isBreaking: true,
          }])
        }

        if (event.type === 'announcement_voices' || event.type === 'implementation_voices') {
          const voices = event.voices as (CitizenVoice & { turnNum?: number })[]
          setAllVoices(prev => [...prev, ...voices.map(v => ({ ...v, turnNum }))])
        }

        if (event.type === 'evaluation') {
          setLiveEvalReasoning(event.reasoning as string)
          setAllHeadlines(prev => [...prev, {
            outlet: 'WIRE SERVICE',
            lean: 'neutral' as const,
            headline: `Implementation: ${event.execution_pct}% delivered${(event.leakage_cr as number) > 1 ? ` · ₹${(event.leakage_cr as number).toFixed(1)}Cr leaked` : ''}`,
            turnNum,
          }])
        }

        if (event.type === 'approval_vote') {
          const voice = event.voice as CitizenVoice
          const weight = event.population_weight as number
          setAllVoices(prev => [...prev, { ...voice, turnNum }])
          setLiveApprovalVotes(prev => [...prev, { sentiment: voice.sentiment, weight }])
        }

        if (event.type === 'approval_final') {
          const before = Math.round(event.approval_before as number)
          const after = Math.round(event.approval as number)
          const dir = after >= before ? '↑' : '↓'
          const bd = event.breakdown as { approve: number; disapprove: number; total: number }
          // Update live approval so top bar reflects result before complete event fires
          setLiveApproval(after)
          setAllHeadlines(prev => [...prev, {
            outlet: 'PULSE',
            lean: after >= before ? 'mayor' as const : 'opposition' as const,
            headline: `Approval ${dir} ${before}% → ${after}% | ${bd.approve} approve · ${bd.disapprove} disapprove (${bd.total} polled)`,
            turnNum,
          }])
        }

        if (event.type === 'events') {
          const evts = event.events_triggered as { name: string; type: string }[]
          if (evts.length > 0) {
            setAllHeadlines(prev => [...prev, {
              outlet: 'ALERT',
              lean: 'opposition' as const,
              headline: `${evts.length} event(s): ${evts.map(e => e.name).join(', ')}`,
              turnNum,
            }])
          }
        }

        if (event.type === 'narrative_chunk' && event.key === 'headlines') {
          const headlines = event.value as { outlet: string; lean: string; headline: string }[]
          setAllHeadlines(prev => [...prev, ...headlines.map(h => ({ ...h, lean: h.lean as 'mayor' | 'opposition' | 'neutral', turnNum }))])
        }

        // Accumulate live milestone for display
        setLiveMilestones(prev => [...prev, event])
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[handleSelectMinister] Turn failed:', e)
      setTurnError(`Turn execution failed: ${errMsg}`)
    } finally {
      setIsTurnExecuting(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const cp = gameState.city_params
  const wf = deriveWelfare(cp)
  const wd = lastTurn?.city_params_after && lastTurn?.city_params_before
    ? welfareDelta(lastTurn.city_params_after, lastTurn.city_params_before)
    : { health: 0, wealth: 0, safety: 0, social: 0 }

  const welfareStats: WelfareStat[] = [
    { label: 'Health', score: wf.health, delta: wd.health, color: '#22c55e', icon: '♥' },
    { label: 'Wealth', score: wf.wealth, delta: wd.wealth, color: '#38bdf8', icon: '◈' },
    { label: 'Safety', score: wf.safety, delta: wd.safety, color: '#f59e0b', icon: '⬡' },
    { label: 'Society', score: wf.social, delta: wd.social, color: '#f87171', icon: '✦' },
  ]

  const treasury = gameState.treasury
  const initTreasury = initialTreasury.current
  const spent = Math.max(0, initTreasury - treasury)
  const spentPct = initTreasury > 0 ? Math.min(100, (spent / initTreasury) * 100) : 0

  // Use liveApproval (from approval_final event) when available for real-time top bar update
  const approval = liveApproval ?? gameState.interim_approval
  const prevApproval = lastTurn ? lastTurn.approval_before : gameState.interim_approval
  const approvalDelta = approval - prevApproval
  const crises = gameState.active_events.filter(e => e.type === 'crisis')
  const opportunities = gameState.active_events.filter(e => e.type === 'opportunity')
  const allCrises: ActiveEvent[] = [...crises, ...opportunities]

  const streamImg = lastTurn?.major_policy
    ? (PORTFOLIO_IMG[lastTurn.major_policy.portfolio] ?? DEFAULT_IMG)
    : DEFAULT_IMG
  const streamTitle = lastTurn?.major_policy?.name ?? (crises[0]?.name ?? 'City Overview')
  const streamLocation = lastTurn?.major_policy?.portfolio ?? crises[0]?.portfolio ?? ''

  const streamEffects = lastTurn?.actual_deltas
    ? Object.entries(lastTurn.actual_deltas)
      .filter(([, v]) => Math.abs(v as number) >= 1)
      .sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))
      .slice(0, 3)
      .map(([k, v]) => ({
        label: `${k.replace(/_/g, ' ')} ${(v as number) >= 0 ? '+' : ''}${Math.round(v as number)}`,
        color: (v as number) >= 0 ? '#22c55e' : '#f87171',
        up: (v as number) >= 0,
      }))
    : []

  // Use last turn's ward report if available, fall back to state snapshot (no-delta baseline)
  const wardReport: WardReportEntry[] = lastTurn?.ward_report ?? gameState.ward_report ?? []

  // Compute which group types have 2–8 unique values (meaningful to filter on)
  const groupTypeCounts: Record<string, Set<string>> = {}
  for (const entry of wardReport) {
    if (!groupTypeCounts[entry.group_type]) groupTypeCounts[entry.group_type] = new Set()
    groupTypeCounts[entry.group_type].add(entry.group_name)
  }
  const filterableTypes = Object.entries(groupTypeCounts)
    .filter(([, names]) => names.size >= 2 && names.size <= 8)
    .map(([type]) => type)

  const leanColor = (lean: string) =>
    lean === 'mayor' ? '#22c55e' : lean === 'opposition' ? '#f87171' : '#60a5fa'
  const leanBg = (lean: string) =>
    lean === 'mayor' ? '#991b1b' : lean === 'opposition' ? '#1e40af' : '#065f46'
  const sentimentRing = (s: string) =>
    s === 'approve' ? '#22c55e' : s === 'disapprove' ? '#f87171' : '#e8a030'

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden"
      style={{ background: '#050d1b', color: '#fff', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* Modals */}

      {/* Briefing loading overlay */}
      {briefingLoading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(5,13,27,0.95)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 480, maxWidth: '90vw' }}>
            {/* Title */}
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              fontSize: 22, letterSpacing: '0.12em', color: '#e8a030',
              textAlign: 'center', marginBottom: 16,
            }}>
              CITY BRIEFING — TURN {gameState.current_turn}
            </div>

            {/* Progress bar */}
            <div style={{
              width: '100%', height: 6, background: '#1c3652',
              borderRadius: 3, marginBottom: 8, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'linear-gradient(90deg, #e8a030, #f59e0b)',
                width: `${(briefingStage / 4) * 100}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>

            {/* Stage labels */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginBottom: 20,
              fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#475569',
            }}>
              {['Snapshot', 'Media', 'Chatter', 'Policies'].map((label, i) => (
                <span key={label} style={{
                  color: briefingStage > i ? '#e8a030' : briefingStage === i ? '#94a3b8' : '#334155',
                  fontWeight: briefingStage === i ? 700 : 400,
                }}>
                  {briefingStage > i ? '✓ ' : ''}{label}
                </span>
              ))}
            </div>

            {/* Current status */}
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 12, color: '#94a3b8', textAlign: 'center',
              marginBottom: 16, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
            }}>
              {briefingStage < 4 && (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid #1c3652', borderTopColor: '#e8a030',
                  animation: 'spin 1s linear infinite',
                }} />
              )}
              {briefingStatus}
            </div>

            {/* Live feed of items */}
            <div style={{
              ...PANEL, padding: '12px 16px',
              maxHeight: 360, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {briefingItems.length === 0 && (
                <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: 12 }}>
                  Connecting to city feeds...
                </div>
              )}
              {briefingItems.map((item, i) => (
                <div key={i} style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 13, lineHeight: 1.6,
                  color: item.type === 'alert' ? '#f59e0b'
                    : item.type === 'crisis' ? '#f87171'
                    : item.type === 'good' ? '#22c55e'
                    : item.type === 'headline' ? '#60a5fa'
                    : item.type === 'voice' ? '#a78bfa'
                    : '#94a3b8',
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(28,54,82,0.3)',
                  animation: 'briefingFadeIn 0.5s ease',
                }}>
                  {item.text}
                </div>
              ))}
              <div ref={briefingFeedEndRef} />
            </div>

            {/* Model thinking / reasoning stream */}
            {briefingThinking && (
              <div ref={briefingThinkingRef} style={{
                ...PANEL, padding: '10px 14px', marginTop: 10,
                maxHeight: 160, overflowY: 'auto',
              }}>
                <div style={{
                  ...HDR_LABEL, fontSize: 10, marginBottom: 6,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {briefingStage < 4 && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#e8a030',
                      animation: 'pulse 1s ease-in-out infinite',
                    }} />
                  )}
                  MODEL REASONING
                </div>
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 11, color: '#64748b', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {briefingThinking}
                </div>
              </div>
            )}
          </div>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg) } }
            @keyframes briefingFadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
            @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
          `}</style>
        </div>
      )}

      {gameOver && scorecard && <ScorecardOverlay sc={scorecard} />}

      {/* Minister Info Popup — rendered as fixed overlay but visually near left panel */}
      {expandedMinisterId && (() => {
        const mIdx = gameState.ministers.findIndex(m => m.id === expandedMinisterId)
        const m = gameState.ministers[mIdx]
        if (!m) return null
        const col = MINISTER_COLORS[mIdx % MINISTER_COLORS.length]
        return (
          <div
            onClick={() => setExpandedMinisterId(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              // No full backdrop — just a very subtle dim so the panel stays visible
              background: 'rgba(5,13,27,0.35)',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                // Anchor left panel width (380px) + 8px gap + 8px outer padding
                left: 396, top: 60,
                width: 300, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                background: '#0a1929', border: `1px solid ${col}55`,
                borderTop: `3px solid ${col}`, borderRadius: 8,
                boxShadow: `0 0 40px ${col}25, 0 12px 40px rgba(0,0,0,0.7)`,
                padding: '14px 16px 16px',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              {/* Header: avatar + name + close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AgentAvatar seed={m.name} ministers={gameState?.ministers || []} size={44} ring={col} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.01em', lineHeight: 1.2 }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: col, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.06em', marginTop: 2 }}>{m.portfolio}</div>
                  {m.extra_portfolios?.map(p => (
                    <span key={p} style={{ fontSize: 8, color: '#e8a030', marginRight: 4, background: 'rgba(232,160,48,0.1)', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(232,160,48,0.25)' }}>+{p}</span>
                  ))}
                </div>
                <button
                  onClick={() => setExpandedMinisterId(null)}
                  style={{ fontSize: 16, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}
                >✕</button>
              </div>

              {/* Demographics */}
              {m.demographics && (
                <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.6, background: 'rgba(255,255,255,0.02)', borderRadius: 5, padding: '7px 10px', border: '1px solid #1c3652' }}>
                  {[m.demographics.profession, m.demographics.age_group, m.demographics.location, m.demographics.income_bracket].filter(Boolean).join('  ·  ')}
                </div>
              )}

              {/* ── CORE STATS ── */}
              <div>
                <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', fontWeight: 700, color: col, marginBottom: 8 }}>CORE ATTRIBUTES</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { label: 'COMPETENCE', value: m.capability?.competence != null ? Math.round(m.capability.competence) : '—', color: '#38bdf8' },
                    { label: 'ALIGNMENT', value: (m.mayor_alignment > 0 ? '+' : '') + Math.round(m.mayor_alignment), color: m.mayor_alignment > 20 ? '#22c55e' : m.mayor_alignment < -20 ? '#f87171' : '#94a3b8' },
                    { label: 'INTEGRITY', value: m.personality?.['integrity'] != null ? Math.round(m.personality['integrity']) : '—', color: '#a78bfa' },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '8px 4px', border: '1px solid #1c3652' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Share Tech Mono', monospace", color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 7, color: '#475569', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── DERIVED STATUS ── */}
              <div>
                <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>POLITICAL STATUS</div>
                {[
                  { label: 'Loyalty', value: m.loyalty, color: '#22c55e' },
                  { label: 'Political Capital', value: m.political_capital ?? 50, color: '#38bdf8' },
                  { label: 'Scandal Exposure', value: m.scandal_exposure, color: m.scandal_exposure > 50 ? '#f87171' : '#fb923c' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', width: 120, flexShrink: 0, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>{s.label}</span>
                    <div style={{ flex: 1, height: 5, background: '#071422', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, s.value))}%`, background: s.color, borderRadius: 3, transition: 'width 0.3s ease', boxShadow: `0 0 8px ${s.color}50` }} />
                    </div>
                    <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: s.color, width: 26, textAlign: 'right', fontWeight: 700 }}>{Math.round(s.value)}</span>
                  </div>
                ))}
              </div>

              {/* ── PERSONALITY TRAITS ── */}
              {m.personality && Object.keys(m.personality).length > 0 && (
                <div>
                  <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>PERSONALITY</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {Object.entries(m.personality).filter(([t]) => t !== 'integrity').map(([trait, val]) => {
                      const v = Math.round(val as number)
                      const barColor = v > 65 ? '#22c55e' : v < 35 ? '#f87171' : '#60a5fa'
                      return (
                        <div key={trait} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 10, color: '#94a3b8', width: 120, flexShrink: 0, textTransform: 'capitalize' }}>{trait.replace(/_/g, ' ')}</span>
                          <div style={{ flex: 1, height: 4, background: '#071422', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${v}%`, background: barColor, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: barColor, width: 26, textAlign: 'right', fontWeight: 700 }}>{v}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 9, color: '#334155', textAlign: 'center', fontStyle: 'italic' }}>Click outside to close</div>
            </div>
          </div>
        )
      })()}
      {showPolicyModal && policyOptions && (
        <PolicyModal
          options={policyOptions}
          ministers={gameState.ministers}
          onSelect={handleSelectPolicy}
          onDiscuss={handleDiscussPolicy}
          onClose={() => { if (!isTurnExecuting) { setShowPolicyModal(false); setPolicyOptions(null); setPolicyError(null); setDiscussingPolicyIndex(null) } }}
          loading={isTurnExecuting}
          error={turnError}
        />
      )}
      {showMinisterPicker && pendingPolicyIndex !== null && policyOptions && (
        <MinisterPickerModal
          policy={policyOptions[pendingPolicyIndex]}
          ministers={gameState.ministers}
          onSelect={handleSelectMinister}
          onBack={() => { setShowMinisterPicker(false); setShowPolicyModal(true) }}
        />
      )}

      {/* ── TOP BAR ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 shrink-0"
        style={{
          height: 52, background: 'linear-gradient(90deg, #071320 0%, #0a1828 40%, #071320 100%)',
          borderBottom: '1px solid #1c3652', boxShadow: '0 2px 20px rgba(0,0,0,0.5)', zIndex: 10
        }}>

        {/* Emblem + City */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center justify-center rounded-full shrink-0" style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #92400e 100%)',
            boxShadow: '0 0 12px rgba(217,119,6,0.5), inset 0 1px 1px rgba(255,255,255,0.2)',
            border: '1.5px solid #f59e0b', fontSize: 16,
          }}>🏛</div>
          <div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15,
              color: '#f0c040', letterSpacing: '0.06em', textShadow: '0 0 12px rgba(240,192,64,0.5)'
            }}>
              City of {gameState.city_name}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0 rounded" style={{
                fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                letterSpacing: '0.1em', color: '#e8a030',
                background: 'rgba(232,160,48,0.12)', border: '1px solid rgba(232,160,48,0.25)',
              }}>TERM 1</span>
              <ChevronRight size={9} color="#4b6280" />
              <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#4b6280' }}>
                Turn {gameState.current_turn} / {gameState.total_turns}
              </span>
            </div>
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Budget */}
        <div className="flex-1 max-w-md">
          <div className="flex items-center justify-between mb-1">
            <span style={{
              fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              letterSpacing: '0.2em', color: '#4b6280'
            }}>BUDGET</span>
            <span style={{
              fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              letterSpacing: '0.12em', color: '#4b6280'
            }}>FISCAL YEAR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <span style={{ fontSize: 12, fontWeight: 700, ...MONO('#f87171') }}>
                ₹{fmtNum(spent)} Cr
              </span>
              <span style={{ fontSize: 9, color: '#64748b' }}>Spent</span>
            </div>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: '#071018' }}>
              <div className="h-full rounded-full" style={{
                width: `${spentPct}%`,
                background: 'linear-gradient(90deg, #dc2626, #f59e0b)',
                boxShadow: '0 0 6px rgba(245,158,11,0.5)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span style={{ fontSize: 9, color: '#64748b' }}>Left</span>
              <span style={{ fontSize: 12, fontWeight: 700, ...MONO('#4ade80') }}>
                ₹{fmtNum(Math.max(0, treasury))} Cr
              </span>
            </div>
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Mayor Approval */}
        <div className="flex flex-col gap-1 shrink-0" style={{ minWidth: 120 }}>
          <div style={{
            fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
            color: '#4b6280', fontWeight: 700,
          }}>MAYOR APPROVAL</div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 20, fontWeight: 700, ...MONO('#f0c040'), lineHeight: 1 }}>
              {Math.round(approval)}%
            </span>
            {approvalDelta !== 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: approvalDelta >= 0 ? '#4ade80' : '#f87171',
                fontFamily: "'Share Tech Mono', monospace",
              }}>
                {approvalDelta >= 0 ? '▲+' : '▼'}{Math.round(approvalDelta)}%
              </span>
            )}
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, approval))}%`,
              background: approval >= 50 ? '#22c55e' : approval >= 35 ? '#f59e0b' : '#f87171',
              borderRadius: 2,
              transition: 'width 0.7s ease',
            }} />
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Controls */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {[{ Icon: Clock, label: 'History' }, { Icon: HelpCircle, label: 'Help' }, { Icon: Settings, label: 'Settings' }]
            .map(({ Icon, label }) => (
              <button key={label} title={label}
                className="flex items-center justify-center rounded transition-all"
                style={{
                  width: 30, height: 30, background: 'rgba(255,255,255,0.04)', border: '1px solid #1c3652',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#e8a030'; e.currentTarget.style.background = 'rgba(232,160,48,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1c3652'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}>
                <Icon size={13} color="#4b6280" />
              </button>
            ))}
          <button title={isMuted ? 'Play Music' : 'Mute Music'} onClick={toggleMusic}
            className="flex items-center justify-center rounded transition-all"
            style={{
              width: 30, height: 30,
              background: isMuted ? 'rgba(255,255,255,0.04)' : 'rgba(232,160,48,0.15)',
              border: isMuted ? '1px solid #1c3652' : '1px solid rgba(232,160,48,0.4)',
              cursor: 'pointer'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#e8a030'; e.currentTarget.style.background = 'rgba(232,160,48,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = isMuted ? '#1c3652' : 'rgba(232,160,48,0.4)'; e.currentTarget.style.background = isMuted ? 'rgba(255,255,255,0.04)' : 'rgba(232,160,48,0.15)' }}>
            {isMuted ? <VolumeX size={13} color="#4b6280" /> : <Volume2 size={13} color="#e8a030" />}
          </button>
          <audio ref={audioRef} src={TRACKS[currentTrackIndex]} onEnded={nextTrack} preload="auto" />
        </div>
      </div>

      {/* Policy error bar (outside modal, e.g. if modal closed before error) */}
      {policyError && !showPolicyModal && (
        <div style={{
          background: 'rgba(248,113,113,0.1)', borderBottom: '1px solid #7f1d1d',
          padding: '6px 16px', fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertTriangle size={13} />
          {policyError}
          <button onClick={() => setPolicyError(null)} style={{
            marginLeft: 'auto', background: 'none',
            border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14
          }}>✕</button>
        </div>
      )}

      {/* ── MAIN 3-COLUMN ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-2 p-2 overflow-hidden min-h-0">

        {/* ── LEFT: Advisory Chat + Crises ───────────────────────────────── */}
        <div className="w-[380px] flex flex-col gap-2 shrink-0" style={{ position: 'relative' }}>

          {/* Advisory Chat Panel */}
          <div className="flex flex-col" style={{ ...PANEL, minHeight: 500 }}>

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: '1px solid #1c3652', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-2">
                <Zap size={12} color="#e8a030" />
                <span style={HDR_LABEL}>SC ADVISORY CHAT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px #22c55e' }} />
                <span className="text-green-400" style={{ fontSize: 10 }}>Online</span>
              </div>
            </div>

            {/* Minister List */}
            <div style={{ borderBottom: '1px solid #1c3652' }}>
              {/* Minister grid — 3 per row, max 2 rows */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
              }}>
                {gameState.ministers.slice(0, 6).map((m, idx) => {
                  const col = MINISTER_COLORS[idx % MINISTER_COLORS.length]
                  const isExpanded = expandedMinisterId === m.id
                  return (
                    <div
                      key={m.id}
                      onClick={() => setExpandedMinisterId(isExpanded ? null : m.id)}
                      className="flex flex-col items-center cursor-pointer transition-colors"
                      style={{
                        padding: '10px 8px 8px',
                        gap: 4,
                        background: isExpanded ? 'rgba(255,255,255,0.05)' : '',
                        borderBottom: isExpanded ? `2px solid ${col}` : '2px solid transparent',
                        borderRight: (idx % 3 < 2) ? '1px solid rgba(28,54,82,0.3)' : 'none',
                      }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '' }}
                    >
                      <AgentAvatar seed={m.name} ministers={gameState?.ministers || []} size={36} ring={col} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: isExpanded ? '#fff' : '#94a3b8', textAlign: 'center', lineHeight: 1.2, width: '100%' }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: 9, color: col, textAlign: 'center', lineHeight: 1.1, opacity: 0.85, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
                        {m.portfolio}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Council hint */}
            <div style={{
              padding: '5px 12px', fontSize: 10, color: '#475569',
              background: 'rgba(232,160,48,0.03)', borderBottom: '1px solid rgba(28,54,82,0.4)',
              fontStyle: 'italic', lineHeight: 1.4
            }}>
              Click a minister to view their full profile. Use @name to address someone directly.
            </div>

            {/* Chat Messages */}
            <div className="overflow-y-auto space-y-2.5" style={{ height: 320, padding: '10px' }}>
              {chatMessages.map((msg, i) => msg.isSystem ? (
                <div key={i} style={{
                  textAlign: 'center', fontSize: 9, color: '#334155', fontStyle: 'italic',
                  padding: '4px 0', borderTop: '1px solid #1c3652', borderBottom: '1px solid #1c3652',
                  letterSpacing: '0.04em', margin: '2px 0',
                }}>{msg.text}</div>
              ) : (
                <div key={i} className="flex gap-2">
                  <div className="shrink-0 mt-0.5" style={{ width: 26, height: 26 }}>
                    {msg.isMayor ? (
                      <div className="rounded-full flex items-center justify-center text-white"
                        style={{
                          width: 26, height: 26,
                          background: `linear-gradient(135deg, ${msg.ringColor}, ${msg.ringColor}88)`,
                          fontSize: 9, fontWeight: 700, border: `1.5px solid ${msg.ringColor}`
                        }}>M</div>
                    ) : (
                      <AgentAvatar seed={msg.seed} ministers={gameState?.ministers || []} size={26} ring={msg.ringColor} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: 10, fontWeight: 700, color: msg.isMayor ? '#e8a030' : '#7dd3fc' }}>
                        {msg.sender}
                      </span>
                      {msg.senderRole && <span style={{ fontSize: 10, color: '#475569' }}>· {msg.senderRole}</span>}
                      <span style={{ fontSize: 9, color: '#334155', marginLeft: 'auto' }}>{msg.time}</span>
                    </div>
                    <div className="mt-1 px-2 py-1.5 rounded-lg" style={{
                      fontSize: 11,
                      color: msg.isSystemFallback ? '#475569' : '#c0cfe0',
                      fontStyle: msg.isSystemFallback ? 'italic' : undefined,
                      background: msg.isMayor ? 'rgba(216,160,48,0.1)' : 'rgba(255,255,255,0.05)',
                      borderLeft: `2px solid ${msg.ringColor}44`, lineHeight: 1.5,
                    }}>{msg.text}</div>
                  </div>
                </div>
              ))}
              {consultLoading && (
                <div className="flex gap-2 items-center">
                  <Loader2 size={14} color="#4b6280" className="animate-spin" />
                  <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                    Ministers are responding...
                  </div>
                </div>
              )}
              {chatError && (
                <div style={{
                  fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', background: 'rgba(248,113,113,0.08)', border: '1px solid #7f1d1d',
                  borderRadius: 4
                }}>
                  <AlertTriangle size={11} />
                  {chatError}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-2 py-2 flex gap-1.5" style={{ borderTop: '1px solid #1c3652' }}>
              <input
                type="text" value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !consultLoading && chatInput.trim() && handleSendMessage()}
                placeholder="Message the council... (@name to address directly)"
                disabled={consultLoading}
                className="flex-1 text-white placeholder-gray-600 focus:outline-none"
                style={{
                  background: '#071018', border: '1px solid #1c3652', borderRadius: 4,
                  padding: '5px 8px', fontSize: 11
                }}
                onFocus={e => (e.target.style.borderColor = '#e8a030')}
                onBlur={e => (e.target.style.borderColor = '#1c3652')}
              />
              <button onClick={handleSendMessage}
                disabled={!chatInput.trim() || consultLoading}
                className="shrink-0 flex items-center justify-center transition-all"
                style={{
                  background: 'linear-gradient(135deg, #c47d10, #e8a030)', borderRadius: 4,
                  width: 30, height: 30, boxShadow: '0 0 8px rgba(232,160,48,0.4)',
                  opacity: (!chatInput.trim() || consultLoading) ? 0.4 : 1,
                  cursor: (!chatInput.trim() || consultLoading) ? 'not-allowed' : 'pointer',
                  border: 'none'
                }}>
                {consultLoading ? <Loader2 size={13} color="white" className="animate-spin" /> : <Send size={13} color="white" />}
              </button>
              <button onClick={handleDraftPolicy} disabled={fetchingPolicies}
                className="shrink-0 text-xs px-2 transition-all"
                style={{
                  background: 'rgba(59,130,246,0.15)', border: '1px solid #1e40af', borderRadius: 4,
                  color: '#60a5fa', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                  fontFamily: "'Rajdhani', sans-serif",
                  opacity: fetchingPolicies ? 0.5 : 1, cursor: fetchingPolicies ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={e => { if (!fetchingPolicies) e.currentTarget.style.background = 'rgba(59,130,246,0.25)' }}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}>
                {fetchingPolicies ? <Loader2 size={10} className="animate-spin" /> : 'Draft Policy'}
              </button>
            </div>
          </div>

          {/* Active Crises */}
          <div className="shrink-0" style={PANEL}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={11} color="#e8a030" />
                <span style={HDR_LABEL}>ACTIVE CRISES</span>
              </div>
              <ChevronRight size={14} color="#4b6280" />
            </div>
            <div className="p-2 space-y-1.5">
              {allCrises.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '8px 0' }}>No active crises</div>
              )}
              {allCrises.slice(0, 3).map((crisis) => {
                const sv = severityLabel(crisis.severity)
                const CrisisIcon = crisis.type === 'crisis' ? (crisis.severity >= 60 ? AlertTriangle : TrendingDown) : Droplets
                return (
                  <div key={crisis.id}
                    className="flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(28,54,82,0.6)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                    <CrisisIcon size={14} color={sv.color} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-white truncate" style={{ fontSize: 11, fontWeight: 600 }}>{crisis.name}</div>
                      {crisis.portfolio && <div style={{ fontSize: 10, color: '#64748b' }}>{crisis.portfolio}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded" style={{
                        fontSize: 9, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif",
                        letterSpacing: '0.08em', color: sv.color, background: sv.bg, border: `1px solid ${sv.border}`,
                      }}>{sv.label}</span>
                      <span style={{ fontSize: 10, color: '#64748b' }}>{crisis.turns_remaining}T</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── CENTER: Welfare + Game Stream ──────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">

          {/* Welfare Indicators */}
          <div style={PANEL} className="shrink-0">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-amber-400" style={{ boxShadow: '0 0 6px #f59e0b' }} />
                <span style={HDR_LABEL}>WELFARE INDICATORS</span>
              </div>
              <button
                onClick={() => setShowAllParams(p => !p)}
                className="flex items-center gap-1.5 px-2 py-1 rounded transition-all"
                style={{
                  border: '1px solid #1c3652', fontSize: 10, color: showAllParams ? '#e8a030' : '#4b6280',
                  fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em', background: showAllParams ? 'rgba(232,160,48,0.08)' : 'none', cursor: 'pointer'
                }}>
                {showAllParams ? 'Hide' : 'View All Parameters'} {showAllParams ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            </div>
            <div className="p-3 flex gap-3">
              {welfareStats.map(stat => <WelfareCard key={stat.label} stat={stat} />)}
            </div>
            {/* All Parameters Grid */}
            {showAllParams && (() => {
              const paramDeltas: Record<string, number> = {}
              if (lastTurn?.city_params_after && lastTurn?.city_params_before) {
                for (const [k, v] of Object.entries(lastTurn.city_params_after)) {
                  paramDeltas[k] = v - (lastTurn.city_params_before[k] ?? v)
                }
              }
              const barColor = (v: number) => v > 65 ? '#22c55e' : v > 35 ? '#f59e0b' : '#f87171'
              const groups: { label: string; params: [string, string][] }[] = [
                { label: 'HEALTH', params: [['hospitals_and_clinics', 'Hospitals & Clinics'], ['air_quality_and_pollution', 'Air Quality']] },
                { label: 'WEALTH', params: [['jobs_and_commerce', 'Jobs & Commerce'], ['affordable_housing', 'Affordable Housing']] },
                { label: 'SAFETY', params: [['police_and_emergency', 'Police & Emergency'], ['courts_and_legal', 'Courts & Legal']] },
                { label: 'SOCIETY', params: [['community_and_spaces', 'Community & Spaces'], ['schools_and_universities', 'Schools & Universities']] },
                { label: 'INFRASTRUCTURE', params: [['transit_and_roads', 'Transit & Roads'], ['water_power_sanitation', 'Water & Sanitation']] },
                { label: 'GOVERNANCE', params: [['admin_efficiency', 'Admin Efficiency'], ['anti_corruption', 'Anti-Corruption'], ['media_freedom', 'Media Freedom']] },
              ]
              return (
                <div style={{ borderTop: '1px solid #1c3652', padding: '8px 12px 10px' }}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                    {groups.map(g => (
                      <div key={g.label} className="mb-2">
                        <div style={{ ...HDR_LABEL, fontSize: 8, marginBottom: 4, color: '#6b7280' }}>{g.label}</div>
                        {g.params.map(([key, label]) => {
                          const val = (cp as unknown as Record<string, number>)[key] ?? 0
                          const delta = paramDeltas[key] ?? 0
                          const roundDelta = Math.round(delta)
                          return (
                            <div key={key} className="flex items-center gap-2 mb-1" style={{ height: 18 }}>
                              <span style={{ fontSize: 9, color: '#94a3b8', width: 90, flexShrink: 0 }} className="truncate">{label}</span>
                              <MiniBar value={val} color={barColor(val)} width={50} />
                              <span style={{ fontSize: 9, ...MONO('#fff'), width: 20, textAlign: 'right' }}>{Math.round(val)}</span>
                              {roundDelta !== 0 && (
                                <span style={{
                                  fontSize: 8, fontFamily: "'Share Tech Mono', monospace",
                                  color: roundDelta > 0 ? '#4ade80' : '#f87171'
                                }}>
                                  {roundDelta > 0 ? `▲+${roundDelta}` : `▼${roundDelta}`}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Game Stream */}
          <div style={PANEL} className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ background: 'rgba(232,160,48,0.15)', border: '1px solid #92400e' }}>
                  <span style={{ color: '#e8a030', fontSize: 10 }}>▶</span>
                </div>
                <span style={HDR_LABEL}>GAME STREAM</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
                style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #991b1b' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ boxShadow: '0 0 4px #f87171' }} />
                <span style={{
                  color: '#f87171', fontSize: 9, fontWeight: 700,
                  fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em'
                }}>LIVE</span>
              </div>
            </div>

            {/* Stream Image Banner */}
            <div className="relative shrink-0 overflow-hidden" style={{ height: 185, background: '#050d1b' }}>
              {(isTurnExecuting || turnError) ? (
                <div className="absolute inset-0 overflow-y-auto" style={{ background: 'rgba(5,13,27,0.95)' }}>
                  <div className="absolute inset-0 z-0 bg-cover bg-center opacity-15 saturate-50" style={{
                    backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop")',
                  }} />
                  <div className="relative z-10">
                    {turnError ? (
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ color: '#f87171', fontSize: 11, marginBottom: 6 }}>
                          ⚠ {turnError}
                        </div>
                        <button
                          onClick={() => setTurnError(null)}
                          style={{
                            fontSize: 9, color: '#64748b', background: 'rgba(255,255,255,0.05)',
                            border: '1px solid #1c3652', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                          }}
                        >
                          DISMISS
                        </button>
                      </div>
                    ) : (
                      <LiveMilestoneFeed
                        milestones={liveMilestones}
                        policyName={executingPolicyName ?? ''}
                        approvalVotes={liveApprovalVotes}
                        evalReasoning={liveEvalReasoning}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <img src={streamImg} alt={streamTitle} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(5,13,27,0.97) 0%, rgba(5,13,27,0.3) 55%, transparent 100%)' }} />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="text-white uppercase tracking-wide"
                      style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>
                      {streamTitle}
                    </div>
                    {streamLocation && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin size={10} color="#94a3b8" />
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{streamLocation}</span>
                      </div>
                    )}
                    {streamEffects.length > 0 && (
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {streamEffects.map((effect, i) => (
                          <span key={i} className="flex items-center gap-1"
                            style={{
                              fontSize: 10, fontWeight: 700, color: effect.color,
                              fontFamily: "'Share Tech Mono', monospace"
                            }}>
                            <span style={{ fontSize: 8 }}>{effect.up ? '▲' : '▼'}</span>
                            {effect.label}
                          </span>
                        ))}
                        <button className="ml-auto flex items-center justify-center rounded transition-all"
                          style={{
                            width: 20, height: 20, background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
                          }}>
                          <Info size={11} color="#94a3b8" />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Turn History */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {turnHistory.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '16px' }}>
                  No turns yet. Draft a policy to begin.
                </div>
              )}
              {turnHistory.map((entry, i) => (
                <TurnPhaseCard
                  key={entry.turn}
                  entry={entry}
                  ministers={gameState.ministers}
                  onToggle={() => setTurnHistory(prev =>
                    prev.map((e, j) => j === i ? { ...e, expanded: !e.expanded } : e)
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Identity + Media + City Chatter ──────────────────────── */}
        <div className="w-[340px] flex flex-col gap-2 shrink-0 overflow-hidden min-h-0">

          {/* Identity Groups */}
          <div style={{ ...PANEL, maxHeight: 380 }} className="shrink-0 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 6px #a855f7' }} />
                <span style={HDR_LABEL}>IDENTITY GROUPS</span>
              </div>
            </div>
            {/* Pill filter tabs */}
            <div className="px-3 py-1.5 shrink-0 flex gap-1 flex-wrap" style={{ borderBottom: '1px solid rgba(28,54,82,0.4)' }}>
              {filterableTypes.map(t => (
                <button
                  key={t}
                  onClick={() => { setIdentityFilter(t); setExpandedGroup(null) }}
                  style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    fontFamily: "'Rajdhani', sans-serif",
                    padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: 'none',
                    background: identityFilter === t ? '#a855f7' : 'rgba(168,85,247,0.12)',
                    color: identityFilter === t ? '#fff' : '#a855f7',
                    transition: 'all 0.15s',
                  }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="px-2 py-1.5 overflow-y-auto flex-1" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {wardReport
                .filter(e => e.group_type === identityFilter)
                .slice(0, 12)
                .map((entry, i) => {
                  const wb = Math.min(100, Math.max(0, entry.avg_wellbeing ?? 50))
                  const appr = Math.min(100, Math.max(0, entry.approval ?? 50))
                  const scoreColor = entry.hotspot ? '#f87171'
                    : entry.bright_spot ? '#a855f7'
                      : wb >= 65 ? '#22c55e'
                        : wb >= 45 ? '#f59e0b'
                          : '#f87171'
                  const apprColor = appr >= 60 ? '#22c55e' : appr >= 40 ? '#f59e0b' : '#f87171'
                  const trendIcon = entry.trend === 'up' ? '↑' : entry.trend === 'down' ? '↓' : '─'
                  const trendColor = entry.trend === 'up' ? '#22c55e' : entry.trend === 'down' ? '#f87171' : '#475569'
                  const groupKey = `${entry.group_type}:${entry.group_name}`
                  const isExpanded = expandedGroup === groupKey

                  // Per-turn history for this group from turnHistory
                  const groupHistory = isExpanded ? turnHistory.map(te => {
                    const wr = te.result.ward_report?.find(
                      e => e.group_type === entry.group_type && e.group_name === entry.group_name
                    )
                    return wr ? { turn: te.turn, wb: wr.avg_wellbeing, appr: wr.approval ?? 50, pulse: wr.pulse_summary || '' } : null
                  }).filter(Boolean) as { turn: number; wb: number; appr: number; pulse: string }[] : []

                  return (
                    <div key={i}
                      onClick={() => setExpandedGroup(isExpanded ? null : groupKey)}
                      style={{
                        background: isExpanded ? 'rgba(30,41,59,0.7)' : 'rgba(15,23,42,0.4)',
                        borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                        border: `1px solid ${entry.hotspot ? 'rgba(248,113,113,0.3)' : entry.bright_spot ? 'rgba(168,85,247,0.3)' : 'rgba(51,65,85,0.5)'}`,
                        boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
                        transition: 'all 0.2s ease',
                      }}>
                      {/* Row 1: name + wellbeing score + trend */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span className="flex-1 truncate" style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1' }}>{entry.group_name}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Share Tech Mono', monospace", color: scoreColor }}>{Math.round(wb)}</span>
                        <span style={{ fontSize: 8, color: '#4b6280', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em', fontWeight: 600 }}>WB</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: trendColor, width: 14, textAlign: 'center' }}>{trendIcon}</span>
                      </div>
                      {/* Row 2: wellbeing bar */}
                      <div style={{ height: 4, background: '#071422', borderRadius: 3, overflow: 'hidden', marginBottom: 5 }}>
                        <div style={{
                          height: '100%', width: `${wb}%`, borderRadius: 3,
                          background: `linear-gradient(90deg, ${scoreColor}88, ${scoreColor})`,
                          boxShadow: `0 0 6px ${scoreColor}40`,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      {/* Row 3: population + approval */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                        <span style={{ color: '#64748b', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.02em' }}>
                          Representing {Math.round(entry.population_pct ?? 0)}% of population
                        </span>
                        <span style={{ marginLeft: 'auto', fontFamily: "'Share Tech Mono', monospace", fontWeight: 800, color: apprColor, letterSpacing: '0.05em' }}>
                          {Math.round(appr)}%
                        </span>
                        <span style={{ color: '#4b6280', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em', fontWeight: 700, fontSize: 9 }}>APPR</span>
                      </div>
                      {/* Expanded: per-turn history */}
                      {isExpanded && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(51,65,85,0.6)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {groupHistory.length > 0 ? groupHistory.map(h => {
                            const twbColor = h.wb >= 65 ? '#22c55e' : h.wb >= 45 ? '#f59e0b' : '#f87171'
                            const taColor = h.appr >= 60 ? '#22c55e' : h.appr >= 40 ? '#f59e0b' : '#f87171'
                            return (
                              <div key={h.turn} style={{ background: 'rgba(15,23,42,0.3)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid #3b82f6' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, marginBottom: 4 }}>
                                  <span style={{
                                    fontSize: 9, fontWeight: 800, color: '#3b82f6',
                                    background: 'rgba(59,130,246,0.15)',
                                    borderRadius: 3, padding: '1px 5px',
                                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.06em',
                                  }}>TURN {h.turn}</span>
                                  <span style={{ color: '#64748b', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: 9 }}>WB</span>
                                  <span style={{ fontFamily: "'Share Tech Mono', monospace", color: twbColor, fontWeight: 700 }}>{Math.round(h.wb)}</span>
                                  <span style={{ color: '#334155' }}>│</span>
                                  <span style={{ color: '#64748b', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: 9 }}>APPR</span>
                                  <span style={{ fontFamily: "'Share Tech Mono', monospace", color: taColor, fontWeight: 700 }}>{Math.round(h.appr)}%</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.4, fontStyle: 'italic' }}>
                                  "{h.pulse || 'Sentiment remains stable amid policy adjustments.'}"
                                </div>
                              </div>
                            )
                          }) : (
                            <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>Run a turn to see this group's reaction history.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              {wardReport.filter(e => e.group_type === identityFilter).length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', paddingTop: 16 }}>No data yet — run a turn to see group welfare</div>
              )}
            </div>
          </div>

          {/* Media */}
          <div style={PANEL} className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <Newspaper size={11} color="#e8a030" />
                <span style={HDR_LABEL}>MEDIA</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={10} color="#22c55e" />
                <span style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", color: '#4b6280' }}>Campaign Rate</span>
              </div>
            </div>
            <div ref={mediaScrollRef} className="p-2 overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'none' }}
              onMouseEnter={() => { mediaHoveredRef.current = true }}
              onMouseLeave={() => { mediaHoveredRef.current = false }}
            >
              {allHeadlines.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '8px 0' }}>
                  {briefingLoading ? 'Loading city briefing...' : 'No headlines yet'}
                </div>
              )}
              {allHeadlines.length > 0 && [0, 1].map(copy => (
                <div key={copy} ref={copy === 0 ? mediaInnerRef : undefined} className="space-y-2" style={copy === 1 ? { paddingTop: 8 } : undefined}>
                  {allHeadlines.map((item, i) => {
                    const col = leanColor(item.lean)
                    const bg = leanBg(item.lean)
                    const initials = item.outlet.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    const itemBg = item.isBreaking ? 'rgba(232,160,48,0.06)' : 'rgba(255,255,255,0.02)'
                    const itemBorder = item.isBreaking ? '1px solid rgba(232,160,48,0.25)' : '1px solid transparent'
                    return (
                      <div key={`${copy}-${i}`} className="flex gap-2 p-1.5 rounded"
                        style={{ background: itemBg, border: itemBorder }}>
                        <div className="shrink-0 rounded flex items-center justify-center"
                          style={{
                            width: 32, height: 32, background: bg,
                            border: `1px solid ${col}44`, fontSize: 9, fontWeight: 700, color: col,
                            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
                          }}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: 10, fontWeight: 700, color: col }}>{item.outlet}</span>
                            <span style={{
                              fontSize: 8, fontWeight: 700, color: '#4b6280',
                              background: '#0b1929', border: '1px solid #1c3652',
                              borderRadius: 3, padding: '0 3px', fontFamily: "'Rajdhani', sans-serif"
                            }}>T{item.turnNum}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.45 }}>
                            {item.headline}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* City Chatter */}
          <div style={PANEL} className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={11} color="#e8a030" />
                <span style={HDR_LABEL}>CITY CHATTER</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingDown size={10} color="#f87171" />
                <span style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", color: '#4b6280' }}>Sentiment</span>
              </div>
            </div>
            <div ref={chatterScrollRef} className="p-2 overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'none' }}
              onMouseEnter={() => { chatterHoveredRef.current = true }}
              onMouseLeave={() => { chatterHoveredRef.current = false }}
            >
              {allVoices.length === 0 && (
                <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', padding: '8px 0' }}>
                  {briefingLoading ? 'Loading city briefing...' : 'No citizen voices yet'}
                </div>
              )}
              {allVoices.length > 0 && [0, 1].map(copy => (
                <div key={copy} ref={copy === 0 ? chatterInnerRef : undefined} className="space-y-2.5" style={copy === 1 ? { paddingTop: 10 } : undefined}>
                  {allVoices.filter(v => !v.citizen_id.startsWith('politics-')).map((v, i) => {
                    const ring = sentimentRing(v.sentiment)
                    return (
                      <div key={`${copy}-${i}`} className="flex gap-1.5">
                        <div className="shrink-0" style={{ position: 'relative', width: 26, height: 26, marginTop: 2 }}>
                          <Avatar seed={v.name} size={26} ring={ring} />
                          <div className="absolute bottom-0 right-0 rounded-full"
                            style={{
                              width: 6, height: 6,
                              background: v.sentiment === 'approve' ? '#22c55e' : v.sentiment === 'disapprove' ? '#f87171' : '#e8a030',
                              border: '1px solid #050d1b',
                            }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1" style={{ marginBottom: 2 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>{v.name.split(' ')[0]}</span>
                            <span style={{ fontSize: 8, color: '#334155' }}>· {v.demographics_summary.split(',')[0]}</span>
                            {(v as any).turnNum != null && (
                              <span style={{
                                fontSize: 7, fontWeight: 700, color: '#f59e0b',
                                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                                borderRadius: 3, padding: '0 3px',
                                fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.06em',
                              }}>T{(v as any).turnNum}</span>
                            )}
                          </div>
                          {/* Speech bubble */}
                          <div style={{
                            background: v.sentiment === 'approve'
                              ? 'rgba(34,197,94,0.06)'
                              : v.sentiment === 'disapprove'
                                ? 'rgba(248,113,113,0.06)'
                                : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${ring}22`,
                            borderRadius: '0 8px 8px 8px',
                            padding: '5px 8px',
                            fontSize: 10,
                            color: '#cbd5e1',
                            lineHeight: 1.55,
                            fontStyle: 'normal',
                          }}>
                            {v.reaction}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
