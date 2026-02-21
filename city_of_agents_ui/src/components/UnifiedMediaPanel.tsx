import { useEffect, useRef } from 'react'
import type { MediaTimelineCard, StateSnapshot } from '../types'

type Props = {
  state: StateSnapshot
  cards: MediaTimelineCard[]
}

function meterClass(value: number): string {
  if (value >= 65) return 'danger'
  if (value >= 45) return 'warn'
  return 'good'
}

export default function UnifiedMediaPanel({ state, cards }: Props) {
  const outlets = state.media_state.outlets ?? []
  const narrativeListRef = useRef<HTMLDivElement | null>(null)
  const pauseNarrativeScrollRef = useRef(false)

  useEffect(() => {
    const node = narrativeListRef.current
    if (!node || cards.length < 2) return

    const intervalId = window.setInterval(() => {
      if (!narrativeListRef.current) return
      if (pauseNarrativeScrollRef.current) return
      const list = narrativeListRef.current
      if (list.scrollHeight <= list.clientHeight + 1) return
      const reachedEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 2
      list.scrollTop = reachedEnd ? 0 : list.scrollTop + 1
    }, 80)

    return () => window.clearInterval(intervalId)
  }, [cards.length])

  return (
    <section className="panel" id="unified-media-panel">
      <div className="panel-title">Media</div>
      <div className="unified-media-scroll">
        <div className="unified-media-subtitle">Outlet Conditions</div>
        {outlets.length === 0 ? (
          <div className="muted">No outlet-level media conditions available for this city profile.</div>
        ) : (
          <div className="media-outlet-list">
            {outlets.map((outlet) => (
              <article className={`media-outlet-card lean-${outlet.lean}`} key={outlet.outlet_id}>
                <div className="media-outlet-head">
                  <strong>{outlet.name}</strong>
                  <span className="media-lean">{outlet.lean}</span>
                </div>
                <div className="media-row">
                  <span className="media-label">Bias</span>
                  <span className="media-val">{outlet.bias.toFixed(1)}</span>
                </div>
                <div className="media-row">
                  <span className="media-label">Sensational</span>
                  <div className="media-track">
                    <div className={`media-fill ${meterClass(outlet.sensationalism)}`} style={{ width: `${outlet.sensationalism}%` }} />
                  </div>
                  <span className="media-val">{Math.round(outlet.sensationalism)}</span>
                </div>
                <div className="media-row">
                  <span className="media-label">Trust</span>
                  <div className="media-track">
                    <div className="media-fill good" style={{ width: `${outlet.trust}%` }} />
                  </div>
                  <span className="media-val">{Math.round(outlet.trust)}</span>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="unified-media-subtitle">Narrative Feed</div>
        {cards.length === 0 ? (
          <div className="muted">No media narratives yet. Play a turn to generate reporting.</div>
        ) : (
          <div
            className="media-timeline"
            ref={narrativeListRef}
            onMouseEnter={() => {
              pauseNarrativeScrollRef.current = true
            }}
            onMouseLeave={() => {
              pauseNarrativeScrollRef.current = false
            }}
          >
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
      </div>
    </section>
  )
}

