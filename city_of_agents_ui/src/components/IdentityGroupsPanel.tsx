import { useState } from 'react'
import type { StateSnapshot } from '../types'

export type GroupHappening = {
  id: string
  kind: 'pulse' | 'chatter'
  turn: number
  text: string
  meta?: string
}

type Props = {
  state: StateSnapshot
  compact?: boolean
  happeningsByGroup?: Record<string, GroupHappening[]>
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export default function IdentityGroupsPanel({ state, compact = false, happeningsByGroup = {} }: Props) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const orderedGroups = Object.entries(state.identity_groups).sort(
    (a, b) => (state.group_metrics[b[0]]?.population ?? 0) - (state.group_metrics[a[0]]?.population ?? 0),
  )

  return (
    <section className={`card identity-groups-panel ${compact ? 'compact' : ''}`}>
      <h3>Identity Groups</h3>
      <div className={`identity-groups-list ${compact ? 'compact' : ''}`}>
        {orderedGroups.map(([groupId, group]) => {
          const metrics = state.group_metrics[groupId]
          const alignment = metrics?.alignment ?? 0
          const mayorShare = clampPercent((alignment + 100) / 2)
          const oppositionShare = clampPercent(100 - mayorShare)
          const happenings = happeningsByGroup[groupId] ?? []
          const expanded = expandedGroupId === groupId

          return (
            <article className={`group-card group-card-button ${expanded ? 'expanded' : ''}`} key={groupId}>
              <button
                className="group-card-head"
                onClick={() => setExpandedGroupId((current) => (current === groupId ? null : groupId))}
              >
                <div className="group-name">
                  <strong>{group.name}</strong> ({Math.round(group.population_percent * 100)}%)
                </div>
                <div className="group-chevron">{expanded ? '−' : '+'}</div>
              </button>

              <div className="group-sub">{group.caste} • {group.religion} • {group.language}</div>

              <div className="group-metrics">
                <div className="group-metric">
                  <span className="group-metric-label">Happiness</span>
                  <span className="group-metric-value">{Math.round(metrics?.happiness ?? 0)}</span>
                </div>
                <div className="group-metric">
                  <span className="group-metric-label">Radical</span>
                  <span className="group-metric-value">{Math.round(metrics?.radicalization ?? 0)}</span>
                </div>
              </div>

              <div className="group-align-bar-wrap">
                <div className="group-metric-label">Alignment Split</div>
                <div className="group-align-track">
                  <div className="group-align-mayor" style={{ width: `${mayorShare}%` }} />
                  <div className="group-align-opp" style={{ width: `${oppositionShare}%` }} />
                </div>
                <div className="group-align-labels">
                  <span className="align-mayor">Mayor {mayorShare.toFixed(0)}%</span>
                  <span className="align-opp">Opp {oppositionShare.toFixed(0)}%</span>
                </div>
              </div>

              {expanded && (
                <div className="group-happenings">
                  <div className="group-happenings-title">What&apos;s Happening</div>
                  {happenings.length === 0 ? (
                    <div className="muted">No recent group-level updates yet.</div>
                  ) : (
                    happenings.slice(0, 6).map((item) => (
                      <div className="group-happening-item" key={item.id}>
                        <div className="group-happening-text">{item.text}</div>
                        <div className="group-happening-meta">
                          <span>T{item.turn}</span>
                          <span>{item.kind === 'pulse' ? 'Pulse' : 'Chatter'}</span>
                          {item.meta && <span>{item.meta}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

