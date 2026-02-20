import { useMemo, useState } from 'react'

type Props = {
  policyHistory: string[]
  eventHistory: string[]
}

export default function TurnLogPanel({ policyHistory, eventHistory }: Props) {
  const [expanded, setExpanded] = useState(false)
  const all = useMemo(
    () =>
      [
        ...policyHistory.map((text) => ({ text, isEvent: false })),
        ...eventHistory.map((text) => ({ text, isEvent: true })),
      ].reverse(),
    [eventHistory, policyHistory],
  )
  const visibleRows = expanded ? all : all.slice(0, 12)

  return (
    <section className="panel">
      <div className="panel-title">Turn Log</div>
      <div id="turn-log">
        {visibleRows.map(({ text, isEvent }, idx) => {
          const parts = text.split(/(mayor|opposition)/gi)
          return (
            <div key={`${text}-${idx}`} className={`log-line ${isEvent ? 'event-line' : ''}`}>
              {parts.map((part, pidx) => {
                if (/^mayor$/i.test(part)) return <span key={pidx} className="mayor-tag">{part}</span>
                if (/^opposition$/i.test(part)) return <span key={pidx} className="opp-tag">{part}</span>
                return <span key={pidx}>{part}</span>
              })}
            </div>
          )
        })}
      </div>
      {all.length > 12 && (
        <div className="log-actions">
          <button className="btn-log-toggle" onClick={() => setExpanded((current) => !current)}>
            {expanded ? 'Collapse Log' : `Expand Log (${all.length})`}
          </button>
        </div>
      )}
    </section>
  )
}
