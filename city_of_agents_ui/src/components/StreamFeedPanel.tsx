export type StreamCardItem = {
  kind: 'mayor' | 'opposition' | 'event' | 'impact' | 'media'
  turn?: number
  label: string
  name: string
  description?: string
  rationale?: string
  meta?: string
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
}

type Props = {
  items: StreamCardItem[]
  visible: boolean
  identityGroups?: Record<string, { name: string }>
}

type GroupImpact = {
  groupId: string
  groupName: string
  population: number
  happiness: number
  radicalization: number
  alignment: number
  trust: number
}

function fmtSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

export default function StreamFeedPanel({ items, visible, identityGroups = {} }: Props) {
  const turns = new Map<number, StreamCardItem[]>()
  for (const item of items) {
    if (typeof item.turn !== 'number') continue
    const bucket = turns.get(item.turn) ?? []
    bucket.push(item)
    turns.set(item.turn, bucket)
  }
  const orderedTurns = [...turns.keys()].sort((a, b) => b - a)

  return (
    <section className="panel" id="stream-panel">
      <div className="panel-title">Turn Feed + Log</div>
      {!visible || orderedTurns.length === 0 ? (
        <div className="muted">No streamed updates yet.</div>
      ) : (
        <div className="turn-log-list">
          {orderedTurns.map((turn) => {
            const entries = turns.get(turn) ?? []
            const mayor = entries.find((entry) => entry.kind === 'mayor')
            const opposition = entries.find((entry) => entry.kind === 'opposition')
            const stats = entries.find((entry) => entry.statDeltas && Object.keys(entry.statDeltas).length > 0)
            const popularity = entries.find((entry) => entry.popularity)
            const closed = entries.find((entry) => entry.turnSummary)

            const statDeltas = stats?.statDeltas ?? {}
            const orderedStats = Object.entries(statDeltas).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            const majorStat = orderedStats[0]

            const cohortRows = entries.flatMap((entry) => entry.cohortShifts ?? [])
            const groupImpactMap = new Map<string, GroupImpact>()
            for (const row of cohortRows) {
              const existing = groupImpactMap.get(row.group_id)
              if (!existing) {
                groupImpactMap.set(row.group_id, {
                  groupId: row.group_id,
                  groupName: identityGroups[row.group_id]?.name ?? row.group_id,
                  population: row.population,
                  happiness: row.happiness_delta,
                  radicalization: row.radicalization_delta,
                  alignment: row.alignment_delta,
                  trust: row.trust_delta,
                })
                continue
              }
              const combinedPopulation = existing.population + row.population
              if (combinedPopulation <= 0) continue
              const mergeAvg = (left: number, right: number) =>
                (left * existing.population + right * row.population) / combinedPopulation
              existing.happiness = mergeAvg(existing.happiness, row.happiness_delta)
              existing.radicalization = mergeAvg(existing.radicalization, row.radicalization_delta)
              existing.alignment = mergeAvg(existing.alignment, row.alignment_delta)
              existing.trust = mergeAvg(existing.trust, row.trust_delta)
              existing.population = combinedPopulation
            }
            const groupImpacts = [...groupImpactMap.values()].sort((a, b) => Math.abs(b.alignment) - Math.abs(a.alignment))
            const groupAgainst = groupImpacts.reduce<GroupImpact | null>(
              (picked, current) => (!picked || current.alignment < picked.alignment ? current : picked),
              null,
            )

            const summaryMayor = closed?.turnSummary?.mayorAction ?? mayor?.label.replace(/^🏛\s*Mayor:\s*/i, '') ?? '—'
            const summaryOpp =
              closed?.turnSummary?.oppositionAction ?? opposition?.label.replace(/^⚔\s*Opposition:\s*/i, '') ?? '—'
            const summaryPopularity = popularity?.popularity
            return (
              <details key={turn} className="turn-log-card" open={turn === orderedTurns[0]}>
                <summary className="turn-log-summary">
                  <div className="turn-log-summary-top">
                    <div className="turn-log-summary-left">
                      <span className="turn-log-toggle-symbol" aria-hidden="true" />
                      <div className="stream-turn-tag">T{turn}</div>
                    </div>
                    <div className="turn-log-major-driver">
                      {majorStat
                        ? `Driver: ${majorStat[0]} ${fmtSigned(majorStat[1])}`
                        : 'Driver: n/a'}
                    </div>
                  </div>
                  <div className="turn-log-summary-line"><strong>Mayor</strong>: {summaryMayor}</div>
                  <div className="turn-log-summary-line"><strong>Opposition</strong>: {summaryOpp}</div>
                  <div className="turn-log-summary-line">
                    <strong>Popularity</strong>: {summaryPopularity
                      ? `Mayor ${summaryPopularity.mayor.toFixed(1)}% · Opp ${summaryPopularity.opposition.toFixed(1)}%`
                      : 'n/a'}
                  </div>
                  <div className="turn-log-summary-line">
                    <strong>Group Against</strong>: {groupAgainst ? `${groupAgainst.groupName} (${fmtSigned(groupAgainst.alignment)} align)` : 'n/a'}
                  </div>
                </summary>

                <div className="turn-log-details">
                  <div className="turn-log-section-title">City Stat Changes</div>
                  {orderedStats.length === 0 ? (
                    <div className="muted">No stat delta details for this turn.</div>
                  ) : (
                    <div className="turn-log-stat-grid">
                      {orderedStats.map(([stat, delta]) => (
                        <div key={`${turn}-${stat}`} className="turn-log-stat-item">
                          <span>{stat}</span>
                          <span className={delta >= 0 ? 'stat-pos' : 'stat-neg'}>{fmtSigned(delta)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="turn-log-section-title">Identity Group Impacts</div>
                  {groupImpacts.length === 0 ? (
                    <div className="muted">No group impact details captured for this turn.</div>
                  ) : (
                    <div className="turn-log-group-grid">
                      {groupImpacts.map((group) => (
                        <div key={`${turn}-${group.groupId}`} className="turn-log-group-item">
                          <div className="turn-log-group-name">{group.groupName}</div>
                          <div>Align {fmtSigned(group.alignment)}</div>
                          <div>Happy {fmtSigned(group.happiness)}</div>
                          <div>Radical {fmtSigned(group.radicalization)}</div>
                          <div>Trust {fmtSigned(group.trust)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </section>
  )
}
