import { useState } from 'react'
import type { TurnData } from '../types'

interface Props {
  turns: TurnData[]
}

const Delta = ({ v }: { v: number }) => (
  <span className={v >= 0 ? 'text-green-400' : 'text-red-400'}>
    {v >= 0 ? '+' : ''}{v.toFixed(2)}%
  </span>
)

const StatPill = ({ k, v }: { k: string; v: number }) => (
  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${v >= 0 ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}`}>
    {k.replace(/_/g, ' ')} {v >= 0 ? '+' : ''}{v.toFixed(1)}
  </span>
)

export default function TurnFeed({ turns }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (turn: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(turn) ? next.delete(turn) : next.add(turn)
      return next
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">📜 Turn History</h3>
        <p className="text-xs text-gray-600 mt-0.5">{turns.length} turns — click to expand</p>
      </div>

      <div className="divide-y divide-gray-800/60 max-h-[600px] overflow-y-auto">
        {turns.map(t => {
          const hasEvent = t.triggered_events.length > 0
          const hasEscalation = t.escalated_events.length > 0
          const hasElection = t.election !== null
          const isOpen = expanded.has(t.turn)

          return (
            <div key={t.turn} className={`${hasEvent ? 'bg-red-950/10' : ''} ${hasElection ? 'bg-yellow-950/10' : ''}`}>
              {/* Row header */}
              <button
                onClick={() => toggle(t.turn)}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-gray-800/40 transition-colors"
              >
                {/* Turn number */}
                <span className="text-xs font-mono text-gray-500 w-10 shrink-0">
                  T{String(t.turn).padStart(2, '0')}
                </span>

                {/* Actions */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="text-violet-400 font-medium truncate">{t.mayor_action}</span>
                    <span className="text-gray-600">vs</span>
                    <span className="text-orange-400 font-medium truncate">{t.opposition_action}</span>
                  </div>
                </div>

                {/* Popularity */}
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <Delta v={t.mayor_delta} />
                  <span className="text-gray-700">|</span>
                  <span className="text-gray-400 font-mono">
                    {t.mayor_popularity.toFixed(1)} / {t.opposition_popularity.toFixed(1)}
                  </span>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1 shrink-0">
                  {hasEvent && (
                    <span className="text-xs bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded">
                      ⚡ {t.triggered_events.length}
                    </span>
                  )}
                  {hasEscalation && (
                    <span className="text-xs bg-orange-900/60 text-orange-300 px-1.5 py-0.5 rounded">↑ esc</span>
                  )}
                  {hasElection && (
                    <span className="text-xs bg-yellow-900/60 text-yellow-300 px-1.5 py-0.5 rounded">🗳️</span>
                  )}
                  <span className="text-gray-600 ml-1">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-3 pt-1 space-y-2 text-xs border-t border-gray-800/40">
                  {/* Stat changes */}
                  {Object.keys(t.stat_changes).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(t.stat_changes).map(([k, v]) => (
                        <StatPill key={k} k={k} v={v} />
                      ))}
                    </div>
                  )}

                  {/* Events */}
                  {hasEvent && (
                    <div className="flex flex-wrap gap-1">
                      {t.triggered_events.map(ev => (
                        <span key={ev} className="bg-red-900/40 text-red-300 px-2 py-0.5 rounded-full">
                          ⚡ {ev}
                        </span>
                      ))}
                    </div>
                  )}
                  {hasEscalation && (
                    <div className="flex flex-wrap gap-1">
                      {t.escalated_events.map(ev => (
                        <span key={ev} className="bg-orange-900/40 text-orange-300 px-2 py-0.5 rounded-full">
                          ↑ {ev}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Crisis risk */}
                  {t.highest_crisis && (
                    <p className="text-gray-500">
                      Highest risk: <span className="text-yellow-500">{t.highest_crisis.name}</span>{' '}
                      <span className="font-mono text-yellow-600">{(t.highest_crisis.chance * 100).toFixed(1)}%</span>
                    </p>
                  )}

                  {/* Rumor */}
                  {t.rumor_pressure > 0.01 && (
                    <p className="text-gray-500">
                      Rumor pressure: <span className="font-mono text-purple-400">{t.rumor_pressure.toFixed(3)}</span>
                    </p>
                  )}

                  {/* Election */}
                  {hasElection && t.election && (
                    <div className="mt-2 p-2 bg-yellow-950/30 border border-yellow-800/40 rounded-lg">
                      <p className="font-semibold text-yellow-300 mb-1">🗳️ Election Result</p>
                      <p className="text-gray-300">
                        Mayor <span className="text-violet-400 font-mono">{t.election.mayor_vote_share.toFixed(1)}%</span>
                        {' '}vs Opposition <span className="text-orange-400 font-mono">{t.election.opposition_vote_share.toFixed(1)}%</span>
                        {' '}— <span className="text-yellow-400">{t.election.outcome}</span>
                      </p>
                      <p className="text-gray-500 mt-0.5">
                        Undecided {t.election.undecided_bloc}% · Swing {t.election.swing_voters}%
                        · Winner: <span className="text-white font-semibold">{t.election.winner}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
