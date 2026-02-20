import type { DebateResult, StreetChatterItem } from '../types'

type Props = {
  debates: DebateResult[]
  streetChatter: StreetChatterItem[]
  visible: boolean
}

export default function DebatesPanel({ debates, streetChatter, visible }: Props) {
  const avatars = ['◉', '◌', '◎', '◍', '◈', '◊']

  return (
    <section className="panel" id="debates-panel">
      <div className="panel-title">What's Happening?</div>
      <div className="pulse-section">
        <div className="pulse-subtitle">Identity Group Pulse</div>
        {!visible || debates.length === 0 ? (
          <div className="muted">No group pulse yet. Play a turn to surface identity-group debates.</div>
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
                <div className="debate-card fade-in" key={`${d.group_name}-${idx}-${d.turn ?? 0}`}>
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
      </div>

      <div className="pulse-section">
        <div className="pulse-subtitle">Street Chatter</div>
        {!visible || streetChatter.length === 0 ? (
          <div className="muted">No street chatter yet. LLM citizens will start talking after turn resolution.</div>
        ) : (
          <div className="street-chatter-list">
            {streetChatter.map((item, idx) => (
              <article className="street-chatter-card fade-in" key={`${item.speaker}-${idx}-${item.turn ?? 0}`}>
                <div className="street-chatter-head">
                  <div className="street-chatter-speaker">
                    <span className="street-chatter-dot" />
                    <span>{item.speaker}</span>
                    <span className="street-role">({item.role})</span>
                  </div>
                  {typeof item.turn === 'number' && <div className="debate-turn-tag">T{item.turn}</div>}
                </div>
                <div className="street-chatter-line">"{item.line}"</div>
                <div className="street-chatter-meta">
                  <span>{item.group_name}</span>
                  <span className={`sent-${item.sentiment.toLowerCase()}`}>{item.sentiment}</span>
                  <span>Heat {(item.heat * 100).toFixed(0)}%</span>
                </div>
                {item.tags.length > 0 && (
                  <div className="street-chatter-tags">
                    {item.tags.map((tag) => (
                      <span key={`${item.speaker}-${tag}`}>#{tag}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
