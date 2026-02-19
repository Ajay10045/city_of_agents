import type { StateSnapshot } from '../types'

type Props = { state: StateSnapshot }

export default function IdentityGroupsPanel({ state }: Props) {
  return (
    <section className="card">
      <h3>Identity Groups</h3>
      {Object.entries(state.identity_groups).map(([gid, g]) => (
        <div className="group-card" key={gid}>
          <div className="group-name">
            <strong>{g.name}</strong> ({Math.round(g.population_percent * 100)}%)
          </div>
          <div className="group-sub">{g.caste} • {g.religion} • {g.language}</div>
          <div className="group-metrics">
            <div className="group-metric">
              <span className="group-metric-label">Happiness</span>
              <span className="group-metric-value">{Math.round(state.group_metrics[gid]?.happiness ?? 0)}</span>
            </div>
            <div className="group-metric">
              <span className="group-metric-label">Radical</span>
              <span className="group-metric-value">{Math.round(state.group_metrics[gid]?.radicalization ?? 0)}</span>
            </div>
            <div className="group-metric">
              <span className="group-metric-label">Align</span>
              <span className="group-metric-value">
                {(state.group_metrics[gid]?.alignment ?? 0) > 10
                  ? <span className="align-mayor">Mayor</span>
                  : (state.group_metrics[gid]?.alignment ?? 0) < -10
                    ? <span className="align-opp">Opp</span>
                    : <span className="align-neutral">Neutral</span>}
              </span>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}
