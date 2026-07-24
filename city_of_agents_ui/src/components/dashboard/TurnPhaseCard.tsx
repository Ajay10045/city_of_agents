import { ChevronRight, ChevronDown } from 'lucide-react'
import type { TurnResult, Minister, TurnChoiceSnapshot } from '../../types'
import { fmtNum, findMinisterForPortfolio } from '../../lib/gameUtils'
import { Avatar } from '../common/Avatar'
import { ExecScoreBadge } from '../common/MiniBar'

export interface TurnEntry {
  turn: number
  result: TurnResult
  expanded: boolean
  voteBreakdown?: { approve: number; disapprove: number; total: number }
  choice?: TurnChoiceSnapshot
}

// ─── TurnPhaseCard ─────────────────────────────────────────────────────────────

export function TurnPhaseCard({
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
        {entry.choice && (
          <span
            style={{
              fontSize: 8,
              color: '#7ba8d1',
              fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: '0.06em',
              marginRight: 6,
              maxWidth: 210,
            }}
            className="truncate"
            title={`Minor: ${entry.choice.minorAction.type} · Counter: ${entry.choice.counterFrame}`}
          >
            {entry.choice.minorAction.type.replace(/_/g, ' ')} · {entry.choice.counterFrame}
          </span>
        )}
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
                  <div style={{ fontSize: 9, color: '#7ba8d1', marginTop: 1 }}>
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
                    fontSize: 10, color: execColor, fontFamily: "'Rajdhani', sans-serif",
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
                  <div style={{ fontSize: 10, color: '#38bdf8', letterSpacing: '0.12em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 4 }}>ON THE GROUND</div>
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
                        <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt(d.key)}</span>
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
                            <span style={{ fontSize: 11, color: '#7bb3d4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt(k)}</span>
                            <span style={{
                              fontSize: 10, fontFamily: "'Share Tech Mono', monospace", fontWeight: 700,
                              color: v < 0 ? '#fca5a5' : '#86efac',
                              minWidth: 32, textAlign: 'right',
                            }}>{v > 0 ? '+' : ''}{Math.round(v * 10) / 10}</span>
                            <span style={{ fontSize: 9, color: '#7bb3d4', width: 10, textAlign: 'center' }}>SE</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Right Column: Spanning Analysis */}
                  {tr.evaluator_reasoning && (
                    <div style={{ paddingLeft: 12, borderLeft: '1px solid #1c3652', height: '100%' }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.12em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 4 }}>IMPLEMENTATION ANALYSIS</div>
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
                  <div style={{ fontSize: 9, color: '#7ba8d1', letterSpacing: '0.08em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>APPROVAL</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 18, fontFamily: "'Share Tech Mono', monospace", color: '#fff', fontWeight: 700 }}>{approvalAfter}%</span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: approvalColor, fontWeight: 700 }}>
                    {approvalDelta > 0 ? '↑' : approvalDelta < 0 ? '↓' : '─'} {Math.abs(approvalDelta)}%
                  </div>
                </div>
              </div>
              {entry.voteBreakdown && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: '#22c55e', fontFamily: "'Share Tech Mono', monospace" }}>✓ {entry.voteBreakdown.approve} approve</span>
                  <span style={{ fontSize: 9, color: '#7ba8d1' }}>·</span>
                  <span style={{ fontSize: 9, color: '#f87171', fontFamily: "'Share Tech Mono', monospace" }}>✗ {entry.voteBreakdown.disapprove} disapprove</span>
                  <span style={{ fontSize: 9, color: '#7ba8d1' }}>·</span>
                  <span style={{ fontSize: 9, color: '#7ba8d1', fontFamily: "'Share Tech Mono', monospace" }}>{entry.voteBreakdown.total} polled</span>
                </div>
              )}
              {(() => {
                if (!tr.ward_report || tr.ward_report.length === 0) return null;
                const sorted = [...tr.ward_report].sort((a, b) => b.avg_wellbeing_delta - a.avg_wellbeing_delta);
                const best = sorted[0];
                const worst = sorted[sorted.length - 1];
                return (
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {best && best.avg_wellbeing_delta > 0 && (
                      <div style={{ flex: 1, padding: '4px 8px', background: 'rgba(34,197,94,0.05)', borderRadius: 4, border: '1px solid rgba(34,197,94,0.1)' }}>
                        <div style={{ fontSize: 10, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Most Excited</div>
                        <div style={{ fontSize: 10, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                          <span>{best.group_name}</span>
                          <span style={{ color: '#4ade80', fontFamily: "'Share Tech Mono', monospace" }}>+{best.avg_wellbeing_delta.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                    {worst && worst.avg_wellbeing_delta < 0 && (
                      <div style={{ flex: 1, padding: '4px 8px', background: 'rgba(248,113,113,0.05)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.1)' }}>
                        <div style={{ fontSize: 10, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Most Angry</div>
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
                            <div style={{ fontSize: 10, color: isCrisis ? '#f87171' : '#4ade80', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
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
                      <div style={{ fontSize: 10, color: '#ef4444', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 6 }}>POLITICAL ATTACK</div>

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
                      <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.1em', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 3 }}>COMMUNAL TENSION</div>
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

            {/* ── OUTCOME DRIVERS ─────────────────────────────────────────── */}
            {(() => {
              const drivers: { icon: string; text: string; color: string }[] = []

              // Minister quality vs delivery
              const execPct = Math.round((tr.execution_score ?? 0) * 100)
              if (execPct >= 70) {
                drivers.push({ icon: '✓', color: '#4ade80', text: `Strong execution (${execPct}%) — policy delivered effectively` })
              } else if (execPct < 50) {
                drivers.push({ icon: '⚠', color: '#f87171', text: `Weak execution (${execPct}%) — minister under-performed or fatigued` })
              }

              // Top positive + worst negative actual delta
              const sortedDeltas = Object.entries(tr.actual_deltas ?? {}).sort((a, b) => b[1] - a[1])
              const topGain = sortedDeltas[0]
              const topLoss = sortedDeltas[sortedDeltas.length - 1]
              if (topGain && topGain[1] > 1) {
                drivers.push({ icon: '↑', color: '#86efac', text: `${topGain[0].replace(/_/g,' ')} gained ${topGain[1] > 0 ? '+' : ''}${topGain[1].toFixed(1)} — biggest positive impact` })
              }
              if (topLoss && topLoss[1] < -1) {
                drivers.push({ icon: '↓', color: '#fca5a5', text: `${topLoss[0].replace(/_/g,' ')} fell ${topLoss[1].toFixed(1)} — largest drag` })
              }

              // Top side effect
              const topSide = Object.entries(tr.side_effect_deltas ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
              if (topSide && Math.abs(topSide[1]) > 0.5) {
                drivers.push({ icon: topSide[1] < 0 ? '⚡' : '⚡', color: '#f59e0b', text: `Side effect: ${topSide[0].replace(/_/g,' ')} ${topSide[1] > 0 ? '+' : ''}${topSide[1].toFixed(1)} from trade-offs` })
              }

              // Active event pressure
              if (tr.events_triggered?.length > 0) {
                drivers.push({ icon: '🔴', color: '#f87171', text: `${tr.events_triggered.map(e => e.name).join(', ')} triggered this turn` })
              }

              if (drivers.length === 0) return null
              return (
                <div style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(56,189,248,0.03)', border: '1px solid rgba(56,189,248,0.12)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', marginBottom: 6 }}>OUTCOME DRIVERS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {drivers.slice(0, 3).map((d, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 10, color: d.color, flexShrink: 0, lineHeight: 1.5 }}>{d.icon}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>{d.text}</span>
                      </div>
                    ))}
                  </div>
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#e8a030', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', marginBottom: 3 }}>ADVISOR DEBRIEF</div>
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
