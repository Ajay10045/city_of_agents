import type { DebateResult } from '../types'

type Props = {
  debates: DebateResult[]
  visible: boolean
}

export default function DebatesPanel({ debates, visible }: Props) {
  const avatars = ['◉', '◌', '◎', '◍', '◈', '◊']

  return (
    <section className="panel" id="debates-panel">
      <div className="panel-title">Street-Level Pulse — What Citizens Are Saying</div>
      {!visible || debates.length === 0 ? (
        <div className="muted">No street chatter yet. Play a turn to surface citizen voices.</div>
      ) : (
        <div id="debates-container">
          {debates.map((d, idx) => {
            const avatar = avatars[idx % avatars.length]
            const deltas = [
              { label: 'Align', val: d.alignment_delta },
              { label: 'Morale', val: d.happiness_delta },
              { label: 'Radical', val: d.radicalization_delta },
              { label: 'Trust', val: d.trust_delta },
            ].filter((x) => Math.abs(x.val) >= 0.1)

            return (
              <div className="debate-card fade-in" key={`${d.group_name}-${idx}`}>
                <div className="debate-group-head">
                  <span className="debate-avatar" aria-hidden>{avatar}</span>
                  <div className="debate-group-name">{d.group_name}</div>
                  {typeof d.turn === 'number' && <div className="debate-turn-tag">T{d.turn}</div>}
                </div>
                <div className="debate-summary">{d.debate_summary}</div>
                {d.notable_quote && <div className="debate-quote">"{d.notable_quote}"</div>}
                {deltas.length > 0 && (
                  <div className="debate-deltas">
                    {deltas.map((delta) => (
                      <div className="debate-delta" key={`${d.group_name}-${delta.label}`}>
                        {delta.label}:{' '}
                        <span className={delta.val > 0 ? 'pos' : 'neg'}>
                          {delta.val > 0 ? '+' : ''}
                          {delta.val.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
