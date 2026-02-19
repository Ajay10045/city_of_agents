import type { StateSnapshot } from '../types'

type Props = {
  state: StateSnapshot
  eventChances?: Record<string, number>
}

function formatLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function CrisesPanel({ state, eventChances = {} }: Props) {
  const topRisk = Object.entries(eventChances).sort((a, b) => b[1] - a[1])[0]

  return (
    <section className="card">
      <h3>Active Crises</h3>
      {state.active_events.length === 0 ? (
        <div className="no-events">No active crises</div>
      ) : (
        state.active_events.map((e) => (
          <div className={`event-item ${e.id.startsWith('llm_') ? 'generated' : ''}`} key={e.id}>
            <div className="event-icon">⚠️</div>
            <div>
              <div className="event-name">
                {e.name}{' '}
                {e.id.startsWith('llm_') && <span className="event-generated-tag">AI-generated</span>}
              </div>
              <div className="event-meta">
                Escalation {e.escalation_level}/{e.max_escalation} • {e.remaining_turns} turns
              </div>
            </div>
          </div>
        ))
      )}
      <div className="crisis-risk">
        {topRisk ? (
          <>
            Next turn risk: <strong>{formatLabel(topRisk[0])} {(topRisk[1] * 100).toFixed(1)}%</strong>
          </>
        ) : null}
      </div>
    </section>
  )
}
