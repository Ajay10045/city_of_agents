import type { MediaTimelineCard } from '../types'

type Props = {
  cards: MediaTimelineCard[]
}

export default function MediaNarrativePanel({ cards }: Props) {
  return (
    <section className="media-board">
      <section className="panel">
        <div className="panel-title">Media Narrative</div>
        {cards.length === 0 ? (
          <div className="muted">No media cards yet. Play a turn to generate narrative flow.</div>
        ) : (
          <div className="media-timeline">
            {cards.map((card, idx) => (
              <article
                key={`${card.turn}-${card.headline}-${idx}`}
                className={`media-card media-${card.lean}`}
              >
                <div className="media-card-head">
                  <span className="media-turn">T{card.turn}</span>
                  <span className="media-source">{card.source}</span>
                  <span className={`media-lean lean-${card.lean}`}>{card.lean}</span>
                </div>
                <div className="media-headline">{card.headline}</div>
                <div className="media-meta-row">
                  <span>Front: {card.front}</span>
                  <span>Virality: {Math.round(card.virality)}</span>
                  <span className={card.trust_impact >= 0 ? 'trust-pos' : 'trust-neg'}>
                    Trust {card.trust_impact >= 0 ? '+' : ''}
                    {card.trust_impact.toFixed(1)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
