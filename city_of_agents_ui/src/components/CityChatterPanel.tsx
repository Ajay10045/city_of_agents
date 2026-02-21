import type { StreetChatterItem } from '../types'

type Props = {
  items: StreetChatterItem[]
}

export default function CityChatterPanel({ items }: Props) {
  return (
    <section className="panel" id="city-chatter-panel">
      <div className="panel-title">City Chatter</div>
      {items.length === 0 ? (
        <div className="muted">No city chatter yet. It will appear after turn resolution.</div>
      ) : (
        <div className="street-chatter-list">
          {items.map((item, idx) => (
            <article className="street-chatter-card fade-in" key={`${item.speaker}-${idx}-${item.turn ?? 0}`}>
              <div className="street-chatter-head">
                <div className="street-chatter-speaker">
                  <span className="street-chatter-dot" />
                  <span>{item.speaker}</span>
                  <span className="street-role">({item.role})</span>
                </div>
                {typeof item.turn === 'number' && <div className="debate-turn-tag">T{item.turn}</div>}
              </div>
              <div className="street-chatter-line">&quot;{item.line}&quot;</div>
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
    </section>
  )
}

