import { useEffect, useState } from 'react'
import { fetchTurnDetail, fetchTurns } from '../api'
import type { TurnDetail, TurnSummary } from '../types'

type Props = {
  gameId: string | null
  refreshKey: number
}

type DetailMap = Record<number, TurnDetail>

function formatDelta(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}

export default function TurnArchivePanel({ gameId, refreshKey }: Props) {
  const [turns, setTurns] = useState<TurnSummary[]>([])
  const [details, setDetails] = useState<DetailMap>({})
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingTurn, setLoadingTurn] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) return
    setLoading(true)
    setError(null)
    fetchTurns(gameId)
      .then((rows) => setTurns(rows))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load turn archive'))
      .finally(() => setLoading(false))
  }, [gameId, refreshKey])

  const toggle = async (turn: number) => {
    if (!gameId) return
    if (expandedTurn === turn) {
      setExpandedTurn(null)
      return
    }
    setExpandedTurn(turn)
    if (details[turn]) return
    setLoadingTurn(turn)
    try {
      const detail = await fetchTurnDetail(gameId, turn)
      setDetails((current) => ({ ...current, [turn]: detail }))
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load turn ${turn}`)
    } finally {
      setLoadingTurn(null)
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">Turn Archive</div>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="muted">Loading archive…</div>
      ) : turns.length === 0 ? (
        <div className="muted">No completed turns yet.</div>
      ) : (
        <div className="turn-archive">
          {turns.map((turn) => {
            const isOpen = expandedTurn === turn.turn
            const detail = details[turn.turn]
            return (
              <article key={turn.turn} className="turn-row">
                <button className="turn-row-head" onClick={() => toggle(turn.turn)}>
                  <span className="turn-row-title">
                    Turn {turn.turn}: {turn.headline}
                  </span>
                  <span className="turn-row-meta">
                    {turn.event_count} events · {isOpen ? 'Collapse' : 'Expand'}
                  </span>
                </button>

                {isOpen && (
                  <div className="turn-row-body">
                    {loadingTurn === turn.turn && !detail && (
                      <div className="muted">Loading turn detail…</div>
                    )}
                    {detail && (
                      <>
                        <div className="turn-detail-line">
                          <strong>Actions:</strong> mayor {detail.mayor_action ?? 'n/a'} · opposition{' '}
                          {detail.opposition_action ?? 'n/a'}
                        </div>
                        {detail.winner_fronts.length > 0 && (
                          <div className="turn-detail-line">
                            <strong>Fronts:</strong> {detail.winner_fronts.join(', ')}
                          </div>
                        )}
                        {detail.key_events.length > 0 && (
                          <div className="turn-detail-line">
                            <strong>Key events:</strong> {detail.key_events.join(', ')}
                          </div>
                        )}
                        {Object.keys(detail.stat_deltas).length > 0 && (
                          <div className="turn-deltas">
                            {Object.entries(detail.stat_deltas)
                              .slice(0, 6)
                              .map(([stat, value]) => (
                                <span key={`${turn.turn}-${stat}`} className="turn-delta-chip">
                                  {stat}: {formatDelta(value)}
                                </span>
                              ))}
                          </div>
                        )}
                        {detail.media_cards.length > 0 && (
                          <div className="turn-detail-media">
                            <strong>Media:</strong>{' '}
                            {detail.media_cards
                              .slice(0, 3)
                              .map((card) => card.headline)
                              .join(' · ')}
                          </div>
                        )}
                        {detail.events.length > 0 && (
                          <div className="turn-detail-events">
                            <strong>Timeline:</strong>
                            {detail.events.slice(0, 12).map((event) => (
                              <div key={`${turn.turn}-${event.event_id}`} className="turn-event-line">
                                {event.type}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
