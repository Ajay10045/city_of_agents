import { useMemo, useState } from 'react'
import type { StateSnapshot } from '../types'
import type { DebateResult } from '../types'

type Props = {
  state: StateSnapshot
  compact?: boolean
  debates?: DebateResult[]
}

export default function IdentityGroupsPanel({ state, compact = false, debates = [] }: Props) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  const debateByGroupId = useMemo(() => {
    const map: Record<string, DebateResult[]> = {}
    for (const [groupId, group] of Object.entries(state.identity_groups)) {
      const groupName = group.name.toLowerCase()
      map[groupId] = debates.filter((debate) => debate.group_name.toLowerCase() === groupName).slice(0, 5)
    }
    return map
  }, [state.identity_groups, debates])

  return (
    <section className={`card identity-groups-panel ${compact ? 'compact' : ''}`}>
      <h3>Identity Groups</h3>
      <div className={`identity-groups-list ${compact ? 'compact' : ''}`}>
        {Object.entries(state.identity_groups).map(([gid, g]) => (
          <button
            type="button"
            className={`group-card ${expandedGroupId === gid ? 'expanded' : ''}`}
            key={gid}
            aria-expanded={expandedGroupId === gid}
            onClick={() => setExpandedGroupId((current) => (current === gid ? null : gid))}
          >
            <div className="group-head-row">
              <div className="group-name">
                <strong>{g.name}</strong> ({Math.round(g.population_percent * 100)}%)
              </div>
              <span className="group-toggle-symbol" aria-hidden="true">
                {expandedGroupId === gid ? '−' : '+'}
              </span>
            </div>
            <div className="group-sub">{g.caste} • {g.religion} • {g.language}</div>
            <div className="group-metrics">
              <div className="group-metric">
                <span className="group-metric-label">Wealth</span>
                <span className="group-metric-value">{Math.round(state.group_metrics[gid]?.wealth ?? 0)}</span>
              </div>
              <div className="group-metric">
                <span className="group-metric-label">Health</span>
                <span className="group-metric-value">{Math.round(state.group_metrics[gid]?.health ?? 0)}</span>
              </div>
              <div className="group-metric">
                <span className="group-metric-label">Safety</span>
                <span className="group-metric-value">{Math.round(state.group_metrics[gid]?.safety ?? 0)}</span>
              </div>
              <div className="group-metric">
                <span className="group-metric-label">Social</span>
                <span className="group-metric-value">{Math.round(state.group_metrics[gid]?.social ?? 0)}</span>
              </div>
            </div>

            {expandedGroupId === gid && (
              <div className="group-happenings">
                <div className="group-happenings-title">What's happening for {g.name}</div>
                {(debateByGroupId[gid] ?? []).length === 0 ? (
                  <div className="muted">No pulse updates yet for this group. Play a turn to generate discussion.</div>
                ) : (
                  <div className="group-happenings-list">
                    {(debateByGroupId[gid] ?? []).map((debate, idx) => (
                      <article key={`${gid}-${idx}-${debate.turn ?? 0}`} className="group-happening-item">
                        <div className="group-happening-head">
                          <span>{typeof debate.turn === 'number' ? `T${debate.turn}` : 'Turn'}</span>
                        </div>
                        <div className="group-happening-summary">{debate.debate_summary}</div>
                        {debate.notable_quote && <div className="group-happening-quote">"{debate.notable_quote}"</div>}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

