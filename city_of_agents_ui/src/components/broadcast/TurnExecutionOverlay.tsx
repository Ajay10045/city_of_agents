import { useRef, useEffect } from 'react'
import type { EventResponseOption, Minister } from '../../types'
import { PANEL, HDR_LABEL, MONO } from '../../theme/tokens'
import { fmtNum } from '../../lib/gameUtils'
import { EventResponsePanel } from './EventResponsePanel'
import { PhaseChyron } from './BroadcastChrome'
import { CountUp } from '../common/CountUp'

export type TurnOverlayPhase =
  | 'announcement'
  | 'assignment'
  | 'evaluation'
  | 'reactions'
  | 'poll'
  | 'events'
  | 'debrief'
  | 'complete'

export interface TurnOverlayItem {
  id: number
  phase: TurnOverlayPhase
  kind: 'status' | 'voice' | 'headline' | 'analysis' | 'event' | 'error'
  title: string
  body: string
  accent: string
  typed: boolean
  displayText: string
  done: boolean
}

export function TurnExecutionOverlay({
  open,
  collapsed = false,
  canDismiss,
  phase,
  items,
  policyName,
  executionPct,
  approvalPct,
  treasuryDelta,
  paceMode,
  onPaceModeChange,
  onDismiss,
  accountabilityResolved,
  accountabilityMinister,
  accountabilityBudgetStolen,
  accountabilityLoading,
  onAccountability,
  dilemmaOptions,
  onDilemmaChoice,
  eventResponseOptions,
  onEventResponses,
  ministers,
}: {
  open: boolean
  collapsed?: boolean
  canDismiss: boolean
  phase: TurnOverlayPhase
  items: TurnOverlayItem[]
  policyName: string | null
  executionPct: number | null
  approvalPct: number | null
  treasuryDelta: number | null
  paceMode: 'cinematic' | 'fast' | 'skip'
  onPaceModeChange: (mode: 'cinematic' | 'fast' | 'skip') => void
  onDismiss: () => void
  accountabilityResolved: boolean
  accountabilityMinister: { id: string; name: string } | null
  accountabilityBudgetStolen: number
  accountabilityLoading: boolean
  onAccountability: (action: string) => void
  dilemmaOptions: { situation: string; option_a: { label: string; description: string; effect_key: string; effect_delta: number; ideology_tag?: string }; option_b: { label: string; description: string; effect_key: string; effect_delta: number; ideology_tag?: string } } | null
  onDilemmaChoice: (choice: 'a' | 'b') => void
  eventResponseOptions: EventResponseOption[] | null
  onEventResponses: (responses: { event_id: string; strategy: string; minister_id?: string }[]) => void
  ministers: Minister[]
}) {
  const feedEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [items.length])
  if (!open) return null

  const phases: { id: TurnOverlayPhase; label: string }[] = [
    { id: 'announcement', label: 'Policy Broadcast' },
    { id: 'assignment', label: 'Cabinet Command' },
    { id: 'evaluation', label: 'Field Assessment' },
    { id: 'reactions', label: 'Public Pulse' },
    { id: 'poll', label: 'Mandate Shift' },
    { id: 'events', label: 'City Shockwave' },
    { id: 'debrief', label: 'Debrief' },
    { id: 'complete', label: 'Complete' },
  ]
  const phaseIdx = Math.max(0, phases.findIndex(p => p.id === phase))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9050,
      background: collapsed ? 'transparent' : 'rgba(5,13,27,0.94)',
      backdropFilter: collapsed ? 'none' : 'blur(6px)',
      display: 'flex',
      alignItems: collapsed ? 'flex-end' : 'center',
      justifyContent: 'center',
      padding: collapsed ? '0' : '20px 16px',
      pointerEvents: collapsed ? 'none' : 'auto',
      transition: 'background 0.4s ease',
    }}>
      <div style={{
        width: 1020, maxWidth: '96vw',
        maxHeight: collapsed ? '34vh' : '92vh',
        display: 'flex', flexDirection: 'column', gap: 12,
        pointerEvents: 'auto',
        ...(collapsed ? {
          background: 'linear-gradient(180deg, rgba(5,13,27,0) 0%, rgba(5,13,27,0.95) 22%)',
          padding: '30px 16px 12px', borderTopLeftRadius: 12, borderTopRightRadius: 12,
        } : {}),
        transition: 'max-height 0.4s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 12,
            justifyContent: collapsed ? 'flex-start' : 'center',
          }}>
            {collapsed ? (
              <span style={{
                fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13,
                letterSpacing: '0.12em', color: '#7dd3fc',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ animation: 'overlayPulse 1.2s infinite' }}>●</span>
                LIVE POLL — CITIZENS ARE VOTING
              </span>
            ) : (
              <>
                <span style={{
                  fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 20,
                  letterSpacing: '0.14em', color: '#e8a030',
                }}>◉ CITY BROADCAST</span>
                <PhaseChyron phase={phase} />
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['cinematic', 'fast', 'skip'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => onPaceModeChange(mode)}
                style={{
                  borderRadius: 5,
                  border: `1px solid ${paceMode === mode ? '#e8a03088' : '#1c3652'}`,
                  background: paceMode === mode ? 'rgba(232,160,48,0.14)' : 'rgba(255,255,255,0.03)',
                  color: paceMode === mode ? '#f0c040' : '#7ba8d1',
                  fontSize: 9,
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                  padding: '5px 7px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {mode === 'skip' ? 'Skip To Decision' : mode}
              </button>
            ))}
          </div>
        </div>
        {!collapsed && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: "'Rajdhani', sans-serif", fontSize: 9 }}>
          {phases.map((p, idx) => (
            <div key={p.id} style={{
              color: idx < phaseIdx ? '#e8a030' : idx === phaseIdx ? '#7dd3fc' : '#1c3652',
              fontWeight: 700, letterSpacing: '0.1em',
            }}>
              {idx < phaseIdx ? '✓ ' : idx === phaseIdx ? '● ' : '○ '}{p.label.toUpperCase()}
            </div>
          ))}
        </div>
        )}
        {!collapsed && (
        <div style={{
          height: 3, borderRadius: 2, background: '#0d1f33', overflow: 'hidden',
          border: '1px solid #1c3652',
        }}>
          <div style={{
            width: `${((phaseIdx + 1) / phases.length) * 100}%`, height: '100%',
            background: 'linear-gradient(90deg, #1c3652, #e8a030)', transition: 'width 0.5s ease',
          }} />
        </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: collapsed ? '1fr' : '1fr 250px',
          gap: 12, minHeight: 0, flex: 1,
        }}>
          <div style={{
            ...PANEL,
            padding: '12px 14px', overflowY: 'auto', minHeight: 0,
            maxHeight: collapsed ? 150 : undefined,
            display: 'flex', flexDirection: 'column', gap: 8,
            background: collapsed ? 'rgba(6,14,26,0.9)' : PANEL.background,
          }}>
            {items.length === 0 && (
              <div style={{
                color: '#2d6a8a', fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
                textAlign: 'center', padding: '28px 0', animation: 'overlayPulse 1.8s ease-in-out infinite',
              }}>
                Waiting for stream...
              </div>
            )}
            {items.map(item => (
              <div key={item.id} style={{
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${item.accent}44`,
                borderLeft: `3px solid ${item.accent}`, borderRadius: 6, padding: '9px 10px',
                animation: 'overlayFadeIn 0.25s ease',
              }}>
                <div style={{
                  fontSize: 8, letterSpacing: '0.1em', color: item.accent,
                  fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 3,
                }}>
                  {item.title}
                </div>
                <div style={{
                  fontSize: 11, color: '#dbe7f5', lineHeight: 1.55, whiteSpace: 'pre-wrap',
                  fontFamily: item.kind === 'analysis' || item.kind === 'voice'
                    ? "'Share Tech Mono', monospace"
                    : "'Inter', 'Segoe UI', sans-serif",
                }}>
                  {item.displayText}
                  {item.typed && !item.done && <span style={{ animation: 'overlayPulse 0.9s infinite' }}>▌</span>}
                </div>
              </div>
            ))}
            <div ref={feedEndRef} />
          </div>

          {!collapsed && (
          <div style={{ ...PANEL, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ ...HDR_LABEL, fontSize: 10 }}>LIVE METRICS</div>
            <div style={{ fontSize: 9, color: '#7ba8d1', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>
              POLICY
            </div>
            <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700, lineHeight: 1.3 }}>
              {policyName ?? 'Pending'}
            </div>
            <div style={{ height: 1, background: '#1c3652', margin: '2px 0 4px' }} />
            <div style={{ fontSize: 9, color: '#7ba8d1' }}>Execution</div>
            <div style={{ ...MONO(), fontSize: 22, color: executionPct === null ? '#64748b' : '#7dd3fc' }}>
              {executionPct === null ? '—' : <CountUp value={executionPct} format={v => `${Math.round(v)}%`} />}
            </div>
            <div style={{ fontSize: 9, color: '#7ba8d1' }}>Approval</div>
            <div style={{
              ...MONO(),
              fontSize: 22,
              color: approvalPct === null ? '#64748b' : approvalPct >= 50 ? '#22c55e' : '#f87171',
            }}>
              {approvalPct === null ? '—' : <CountUp value={approvalPct} format={v => `${Math.round(v)}%`} />}
            </div>
            <div style={{ fontSize: 9, color: '#7ba8d1' }}>Treasury Net</div>
            <div style={{
              ...MONO(),
              fontSize: 18,
              color: treasuryDelta === null ? '#64748b' : treasuryDelta >= 0 ? '#22c55e' : '#f87171',
            }}>
              {treasuryDelta === null ? '—' : <CountUp value={treasuryDelta} format={v => `${v >= 0 ? '+' : ''}₹${fmtNum(Math.round(v))} Cr`} />}
            </div>
          </div>
          )}
        </div>

        {/* Mid-Execution Dilemma Choice */}
        {dilemmaOptions && (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px dashed #fbbf2488',
            borderRadius: 8, padding: '10px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12 }}>⚠</span>
              <span style={{
                fontSize: 9, letterSpacing: '0.12em', fontWeight: 700,
                fontFamily: "'Rajdhani', sans-serif", color: '#fbbf24',
              }}>FIELD REPORT — YOUR DECISION REQUIRED</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['option_a', 'option_b'] as const).map((optKey) => {
                const opt = dilemmaOptions[optKey]
                const isPositive = opt.effect_delta >= 0
                return (
                  <button key={optKey} onClick={() => onDilemmaChoice(optKey === 'option_a' ? 'a' : 'b')}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                      border: '1px solid rgba(251,191,36,0.25)',
                      background: 'rgba(251,191,36,0.06)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.14)'; e.currentTarget.style.borderColor = 'rgba(251,191,36,0.5)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.06)'; e.currentTarget.style.borderColor = 'rgba(251,191,36,0.25)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', fontFamily: "'Rajdhani', sans-serif" }}>
                        {opt.label}
                      </span>
                      {opt.ideology_tag && (
                        <span style={{
                          fontSize: 8, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase',
                          padding: '1px 5px', borderRadius: 3,
                          color: ({ pragmatist: '#60a5fa', populist: '#f87171', institutionalist: '#fbbf24', strongman: '#94a3b8' } as Record<string, string>)[opt.ideology_tag] ?? '#94a3b8',
                          background: ({ pragmatist: 'rgba(96,165,250,0.12)', populist: 'rgba(248,113,113,0.12)', institutionalist: 'rgba(251,191,36,0.12)', strongman: 'rgba(148,163,184,0.12)' } as Record<string, string>)[opt.ideology_tag] ?? 'rgba(148,163,184,0.12)',
                          border: `1px solid ${({ pragmatist: 'rgba(96,165,250,0.3)', populist: 'rgba(248,113,113,0.3)', institutionalist: 'rgba(251,191,36,0.3)', strongman: 'rgba(148,163,184,0.3)' } as Record<string, string>)[opt.ideology_tag] ?? 'rgba(148,163,184,0.3)'}`,
                        }}>
                          {opt.ideology_tag}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#cbd5e1', lineHeight: 1.4, marginBottom: 5 }}>
                      {opt.description}
                    </div>
                    <span style={{
                      fontSize: 9, fontFamily: "'Share Tech Mono', monospace",
                      color: isPositive ? '#86efac' : '#fca5a5',
                      background: isPositive ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)',
                      border: `1px solid ${isPositive ? '#14532d' : '#7f1d1d'}44`,
                      borderRadius: 3, padding: '1px 5px',
                    }}>
                      {opt.effect_key.replace(/_/g, ' ')} {isPositive ? '+' : ''}{opt.effect_delta}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Event Response UI */}
        {eventResponseOptions && eventResponseOptions.length > 0 && (
          <EventResponsePanel
            options={eventResponseOptions}
            ministers={ministers}
            onSubmit={onEventResponses}
          />
        )}

        {/* Accountability Review or Continue */}
        {canDismiss && !accountabilityResolved && accountabilityMinister ? (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid #1c3652',
            borderRadius: 8, padding: '10px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize: 9, letterSpacing: '0.12em', fontWeight: 700,
                fontFamily: "'Rajdhani', sans-serif", color: '#e8a030',
              }}>ACCOUNTABILITY REVIEW</span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                {accountabilityMinister.name} delivered {executionPct ?? '—'}% execution
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={accountabilityLoading} onClick={() => onAccountability('praise')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6,
                  border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.08)',
                  cursor: accountabilityLoading ? 'wait' : 'pointer', textAlign: 'left',
                }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', fontFamily: "'Rajdhani', sans-serif" }}>PRAISE</div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Loyalty +5, Fatigue −3</div>
              </button>
              <button disabled={accountabilityLoading} onClick={() => onAccountability('reprimand')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6,
                  border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)',
                  cursor: accountabilityLoading ? 'wait' : 'pointer', textAlign: 'left',
                }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', fontFamily: "'Rajdhani', sans-serif" }}>REPRIMAND</div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Loyalty −5, Scandal −8</div>
              </button>
              {accountabilityBudgetStolen > 5 && (
                <button disabled={accountabilityLoading} onClick={() => onAccountability('investigate')}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 6,
                    border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)',
                    cursor: accountabilityLoading ? 'wait' : 'pointer', textAlign: 'left',
                  }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', fontFamily: "'Rajdhani', sans-serif" }}>INVESTIGATE</div>
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Cost ₹20Cr, recover ₹{Math.round(Math.min(accountabilityBudgetStolen * 0.5, 40))}Cr</div>
                </button>
              )}
              <button disabled={accountabilityLoading} onClick={() => onAccountability('skip')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6,
                  border: '1px solid rgba(100,116,139,0.3)', background: 'rgba(100,116,139,0.08)',
                  cursor: accountabilityLoading ? 'wait' : 'pointer', textAlign: 'left',
                }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', fontFamily: "'Rajdhani', sans-serif" }}>SKIP</div>
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>No action</div>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              disabled={!canDismiss || !accountabilityResolved}
              onClick={onDismiss}
              style={{
                height: 34, padding: '0 18px', borderRadius: 7,
                border: canDismiss && accountabilityResolved ? '1px solid rgba(255,205,96,0.75)' : '1px solid #1c3652',
                background: canDismiss && accountabilityResolved
                  ? 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)'
                  : 'linear-gradient(135deg, #1a2a3a 0%, #152132 100%)',
                color: canDismiss && accountabilityResolved ? '#1a1200' : '#4b6280',
                fontFamily: "'Rajdhani', sans-serif", fontSize: 12, fontWeight: 800,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: canDismiss && accountabilityResolved ? 'pointer' : 'not-allowed',
              }}
            >
              {canDismiss ? 'Continue' : 'Streaming...'}
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes overlayFadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes overlayPulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
      `}</style>
    </div>
  )
}
