import type {
  Policy, Minister, MinorActionInput, MinorActionType, CounterFrameStrategy,
} from '../../types'
import { MINOR_ACTION_CHOICES, COUNTER_FRAME_CHOICES } from '../../lib/gameConstants'
import { Avatar } from '../common/Avatar'

// ─── Minister Picker Modal ────────────────────────────────────────────────────

export function MinisterPickerModal({
  policy, ministers, onSelect, onBack,
  agencyEnabled,
  minorAction,
  onMinorActionChange,
  counterFrame,
  onCounterFrameChange,
  politicalCapital,
  activeEvents,
  selectedPowerMove,
  onPowerMoveChange,
}: {
  policy: Policy
  ministers: Minister[]
  onSelect: (ministerId: string, minorAction: MinorActionInput, counterFrame: CounterFrameStrategy, powerMove: { type: string; target_event_id?: string }) => void
  onBack: () => void
  agencyEnabled: boolean
  minorAction: MinorActionInput
  onMinorActionChange: (minorAction: MinorActionInput) => void
  counterFrame: CounterFrameStrategy
  onCounterFrameChange: (counterFrame: CounterFrameStrategy) => void
  politicalCapital: number
  activeEvents: { id: string; name: string; type: string }[]
  selectedPowerMove: { type: string; target_event_id?: string }
  onPowerMoveChange: (pm: { type: string; target_event_id?: string }) => void
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
          <div style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', color: '#7ba8d1', marginBottom: 4 }}>
            ASSIGN MINISTER
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{policy.name}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{policy.portfolio} · ₹{policy.budget_cost} Cr</div>
        </div>

        {agencyEnabled && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #1c3652', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 8, color: '#7ba8d1', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>MINOR ACTION</span>
              <select
                value={minorAction.type}
                onChange={e => {
                  const selected = MINOR_ACTION_CHOICES.find(opt => opt.type === e.target.value as MinorActionType)
                  if (!selected) return
                  onMinorActionChange({
                    type: selected.type,
                    target: selected.defaultTarget,
                    budget: selected.defaultBudget,
                  })
                }}
                style={{
                  background: '#081624',
                  color: '#d9e8f8',
                  border: '1px solid #1c3652',
                  borderRadius: 5,
                  padding: '6px 8px',
                  fontSize: 10,
                }}
              >
                {MINOR_ACTION_CHOICES.map(opt => (
                  <option key={opt.type} value={opt.type}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 8, color: '#7ba8d1', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>COUNTER FRAME</span>
              <select
                value={counterFrame}
                onChange={e => onCounterFrameChange(e.target.value as CounterFrameStrategy)}
                style={{
                  background: '#081624',
                  color: '#d9e8f8',
                  border: '1px solid #1c3652',
                  borderRadius: 5,
                  padding: '6px 8px',
                  fontSize: 10,
                }}
              >
                {COUNTER_FRAME_CHOICES.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 8, color: '#7ba8d1', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>ACTION TARGET</span>
              <input
                value={minorAction.target ?? ''}
                onChange={e => onMinorActionChange({ ...minorAction, target: e.target.value || undefined })}
                placeholder="optional target"
                style={{
                  background: '#081624',
                  color: '#d9e8f8',
                  border: '1px solid #1c3652',
                  borderRadius: 5,
                  padding: '6px 8px',
                  fontSize: 10,
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 8, color: '#7ba8d1', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>ACTION BUDGET (Cr)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={minorAction.budget}
                onChange={e => onMinorActionChange({ ...minorAction, budget: Math.max(0, Number(e.target.value || 0)) })}
                style={{
                  background: '#081624',
                  color: '#d9e8f8',
                  border: '1px solid #1c3652',
                  borderRadius: 5,
                  padding: '6px 8px',
                  fontSize: 10,
                }}
              />
            </label>
          </div>
        )}

        {/* Power Moves */}
        {agencyEnabled && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #1c3652' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 8, color: '#a78bfa', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em', fontWeight: 700 }}>POWER MOVE (OPTIONAL)</span>
              <span style={{ fontSize: 9, color: '#a78bfa', fontFamily: "'Share Tech Mono', monospace" }}>🛡 {Math.round(politicalCapital)} PC</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {([
                { type: 'none', label: 'None', cost: 0, desc: 'No power move' },
                { type: 'media_blitz', label: 'Media Blitz', cost: 8, desc: '2× mayor media reach' },
                { type: 'crisis_intervention', label: 'Crisis Aid', cost: 12, desc: '−1 turn, block escalation' },
                { type: 'opposition_discredit', label: 'Discredit Opp.', cost: 10, desc: 'Opp. credibility −15' },
                { type: 'rally_the_base', label: 'Rally Base', cost: 6, desc: '+8 alignment, poorest 25%' },
                { type: 'fast_track', label: 'Fast-Track', cost: 15, desc: 'Collapse future deltas' },
              ] as const).map(pm => {
                const selected = selectedPowerMove.type === pm.type
                const affordable = politicalCapital >= pm.cost
                const disabled = pm.type !== 'none' && !affordable
                const hasCrisis = activeEvents.some(e => e.type === 'crisis')
                const hidden = pm.type === 'crisis_intervention' && !hasCrisis
                if (hidden) return null
                return (
                  <button key={pm.type}
                    disabled={disabled}
                    onClick={() => onPowerMoveChange(pm.type === 'none' ? { type: 'none' } : { type: pm.type })}
                    style={{
                      padding: '3px 7px', borderRadius: 4, fontSize: 9,
                      fontFamily: "'Rajdhani', sans-serif", fontWeight: 600,
                      border: selected ? '1px solid #a78bfa' : '1px solid #1c3652',
                      background: selected ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.02)',
                      color: disabled ? '#475569' : selected ? '#a78bfa' : '#94a3b8',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                    }}
                    title={`${pm.desc}${pm.cost > 0 ? ` (${pm.cost} PC)` : ''}`}
                  >
                    {pm.label}{pm.cost > 0 && <span style={{ fontSize: 8, marginLeft: 2, color: '#a78bfa' }}>({pm.cost})</span>}
                  </button>
                )
              })}
            </div>
            {selectedPowerMove.type === 'crisis_intervention' && activeEvents.filter(e => e.type === 'crisis').length > 1 && (
              <select
                value={selectedPowerMove.target_event_id ?? ''}
                onChange={e => onPowerMoveChange({ ...selectedPowerMove, target_event_id: e.target.value })}
                style={{
                  marginTop: 4, width: '100%', background: '#0b1929', border: '1px solid #1c3652',
                  borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '3px 6px',
                }}
              >
                {activeEvents.filter(e => e.type === 'crisis').map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

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
                    <div style={{ fontSize: 9, color: '#7bb3d4' }}>{m.portfolio}</div>
                  </div>
                </div>

                {/* Stats */}
                {(() => {
                  const fatigue = m.fatigue ?? 0
                  const fatigueColor = fatigue > 70 ? '#f87171' : fatigue > 40 ? '#f59e0b' : '#6b9cc9'
                  return (
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Competence', value: competence, color: '#38bdf8' },
                        { label: 'Loyalty', value: loyalty, color: '#22c55e' },
                        { label: 'Scandal Risk', value: scandalRisk, color: scandalRisk > 50 ? '#f87171' : '#6b9cc9' },
                        { label: 'Fatigue', value: fatigue, color: fatigueColor },
                      ].map(s => (
                        <div key={s.label} style={{ flex: 1, minWidth: 75 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 8, color: '#7bb3d4', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.06em' }}>{s.label.toUpperCase()}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: s.color, fontFamily: "'Share Tech Mono', monospace" }}>{Math.round(s.value)}</span>
                          </div>
                          <div style={{ height: 3, background: '#0b1929', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${s.value}%`, background: s.color, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Personality hint */}
                {m.personality && (
                  <div style={{ marginTop: 8, fontSize: 9, color: '#6b9cc9', lineHeight: 1.4, fontStyle: 'italic' }}>
                    {[
                      (m.fatigue ?? 0) > 70 && '⚠ High fatigue — reduced delivery quality',
                      m.personality.integrity < 35 && 'Low integrity — watch for leakage',
                      m.personality.corruption_tolerance > 65 && 'High corruption tolerance',
                      m.personality.empathy > 65 && 'High empathy — community-focused',
                      competence < 40 && 'May underdeliver',
                      loyalty < 40 && 'Loyalty risk — may defect',
                    ].filter(Boolean).slice(0, 2).join(' · ')}
                  </div>
                )}

                <button
                  onClick={() => onSelect(m.id, minorAction, counterFrame, selectedPowerMove)}
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
            color: '#7bb3d4', fontSize: 10, fontFamily: "'Rajdhani', sans-serif",
            letterSpacing: '0.08em', padding: '5px 14px', cursor: 'pointer',
          }}>← BACK TO POLICIES</button>
        </div>
      </div>
    </div>
  )
}
