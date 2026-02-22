export type StreamCardItem = {
  kind: 'phase' | 'mayor' | 'opposition' | 'event' | 'impact' | 'media'
  turn?: number
  phase?: string
  label: string
  name: string
  description?: string
  rationale?: string
  meta?: string
  why?: string
  statDeltas?: Record<string, number>
  popularity?: {
    mayor: number
    opposition: number
  }
  cohortShifts?: Array<{
    cohort_id: string
    group_id: string
    role: string
    population: number
    happiness_delta: number
    radicalization_delta: number
    alignment_delta: number
    trust_delta: number
    narrative_shift_delta: number
  }>
  turnSummary?: {
    mayorAction: string
    oppositionAction: string
    dominantFronts: string[]
    keyEvents: string[]
  }
  delivery?: {
    completionPct: number
    implementationGapPct: number
    budgetRequired: number
    budgetSpent: number
    summary?: string
    targets: Array<{
      label: string
      unit: string
      proposed: number
      delivered: number
      completionRatio: number
    }>
  }
  perception?: Array<{
    speaker: string
    sentiment: string
    line: string
  }>
}

type Props = {
  items: StreamCardItem[]
  visible: boolean
}

function fmtSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

function fmtCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toFixed(0)
}

function cardTone(kind: StreamCardItem['kind']): string {
  if (kind === 'mayor') return 'phase-proposed'
  if (kind === 'impact') return 'phase-reception'
  if (kind === 'media') return 'phase-perception'
  if (kind === 'event') return 'phase-finalized'
  return 'phase-generic'
}

export default function StreamFeedPanel({ items, visible }: Props) {
  const ordered = [...items].reverse()

  return (
    <section className="panel stream-feed-raw" id="stream-panel">
      <div className="panel-title">Turn Feed + Log</div>
      {!visible || ordered.length === 0 ? (
        <div className="muted">No streamed updates yet.</div>
      ) : (
        <div className="stream-raw-list">
          {ordered.map((item, index) => {
            const nextTurn = ordered[index + 1]?.turn
            const showTurnDivider = typeof item.turn === 'number' && item.turn !== nextTurn
            const topStats = Object.entries(item.statDeltas ?? {})
              .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
              .slice(0, 6)

            return (
              <div key={`${item.turn ?? 'na'}-${index}-${item.label}`} className="stream-raw-row">
                {showTurnDivider && typeof item.turn === 'number' && (
                  <div className="stream-turn-divider">Turn {item.turn}</div>
                )}

                <article className={`stream-raw-card ${cardTone(item.kind)}`}>
                  <div className="stream-raw-head">
                    <span className="stream-raw-phase">{item.phase ?? 'Update'}</span>
                    <span className="stream-raw-turn">T{item.turn ?? '-'}</span>
                  </div>
                  <div className="stream-raw-label">{item.label}</div>
                  <div className="stream-raw-name">{item.name}</div>
                  {item.description && <div className="stream-raw-description">{item.description}</div>}
                  {item.rationale && <div className="stream-raw-rationale">{item.rationale}</div>}
                  {item.why && <div className="stream-raw-why">Why: {item.why}</div>}
                  {item.meta && <div className="stream-raw-meta">{item.meta}</div>}

                  {item.delivery && (
                    <div className="stream-delivery-block">
                      <div className="stream-delivery-summary">
                        <span>Completion {item.delivery.completionPct.toFixed(1)}%</span>
                        <span>Gap {item.delivery.implementationGapPct.toFixed(1)}%</span>
                        <span>Budget {fmtCompact(item.delivery.budgetSpent)} / {fmtCompact(item.delivery.budgetRequired)}</span>
                      </div>
                      {item.delivery.summary && (
                        <div className="stream-delivery-text">{item.delivery.summary}</div>
                      )}
                      {item.delivery.targets.length > 0 && (
                        <div className="stream-delivery-table">
                          {item.delivery.targets.slice(0, 3).map((target, targetIndex) => (
                            <div className="stream-delivery-row" key={`${item.turn}-${targetIndex}-${target.label}`}>
                              <span>{target.label}</span>
                              <span>
                                {target.delivered.toFixed(1)}/{target.proposed.toFixed(1)} {target.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {item.perception && item.perception.length > 0 && (
                    <div className="stream-perception-block">
                      {item.perception.slice(0, 3).map((row, rowIndex) => (
                        <div className="stream-perception-row" key={`${item.turn}-${rowIndex}-${row.speaker}`}>
                          <span className={`sent-${row.sentiment.toLowerCase()}`}>{row.sentiment}</span>
                          <span>{row.speaker}: {row.line}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {topStats.length > 0 && (
                    <div className="stream-stats-chip-row">
                      {topStats.map(([stat, value]) => (
                        <span key={`${item.turn}-${stat}`} className="stream-stat-chip">
                          {stat} {fmtSigned(value)}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.popularity && (
                    <div className="stream-raw-meta">
                      Mayor {item.popularity.mayor.toFixed(1)}% · Opposition {item.popularity.opposition.toFixed(1)}%
                    </div>
                  )}
                </article>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
