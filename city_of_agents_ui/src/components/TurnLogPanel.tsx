type Props = {
  policyHistory: string[]
  eventHistory: string[]
}

export default function TurnLogPanel({ policyHistory, eventHistory }: Props) {
  const all = [
    ...policyHistory.map((text) => ({ text, isEvent: false })),
    ...eventHistory.map((text) => ({ text, isEvent: true })),
  ].reverse()

  return (
    <section className="panel">
      <div className="panel-title">Turn Log</div>
      <div id="turn-log">
        {all.map(({ text, isEvent }, idx) => {
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
    </section>
  )
}
