import { useState } from 'react'
import type { SimulationResult } from './types'
import SimulationConfig from './components/SimulationConfig'
import ElectionBanner from './components/ElectionBanner'
import PopularityChart from './components/PopularityChart'
import CityStatsChart from './components/CityStatsChart'
import MetricCard from './components/MetricCard'
import TurnFeed from './components/TurnFeed'

export default function App() {
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSimulate = async (
    turns: number,
    electionTurn: number,
    seed: number | null,
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns, election_turn: electionTurn, seed }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(detail.detail ?? res.statusText)
      }
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const electionTurn = result?.turns.find(t => t.election !== null)?.turn

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-gray-800 p-6 overflow-y-auto">
        <SimulationConfig onSimulate={handleSimulate} loading={loading} />

        {/* Media state panel (shows after sim) */}
        {result && (
          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Media State</p>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Bias', value: result.final.media_state.bias.toFixed(1), color: result.final.media_state.bias > 0 ? 'text-violet-400' : 'text-orange-400' },
                { label: 'Sensationalism', value: result.final.media_state.sensationalism.toFixed(1), color: 'text-yellow-400' },
                { label: 'Trust', value: result.final.media_state.trust.toFixed(1), color: 'text-blue-400' },
              ].map(m => (
                <div key={m.label} className="flex justify-between">
                  <span className="text-gray-500">{m.label}</span>
                  <span className={`font-mono font-semibold ${m.color}`}>{m.value}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500 uppercase tracking-widest mt-4 mb-2">Events ({result.final.event_history.length})</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {result.final.event_history.slice(-10).map((e, i) => (
                <p key={i} className="text-xs text-red-400 leading-tight">{e}</p>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-6 p-4 bg-red-950 border border-red-800 rounded-xl text-red-300 text-sm">
            ❌ {error}
          </div>
        )}

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="text-6xl mb-4">🏛️</div>
            <h2 className="text-2xl font-bold text-white mb-2">City of Power</h2>
            <p className="text-gray-500 max-w-sm">
              Configure a simulation in the sidebar and click <span className="text-violet-400 font-semibold">▶ Simulate</span> to run the city.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400">Running simulation…</p>
          </div>
        )}

        {result && !loading && (
          <div className="p-6 space-y-5">
            {/* Election banner */}
            <ElectionBanner result={result} />

            {/* Charts row */}
            <div className="grid grid-cols-2 gap-5">
              <PopularityChart turns={result.turns} electionTurn={electionTurn} />
              <CityStatsChart stats={result.final.city_stats} />
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-4 gap-4">
              <MetricCard
                label="Happiness" value={result.final.happiness}
                color={result.final.happiness > 50 ? 'text-green-400' : 'text-red-400'}
              />
              <MetricCard
                label="Radicalization" value={result.final.radicalization}
                color={result.final.radicalization > 60 ? 'text-red-400' : 'text-yellow-400'}
              />
              <MetricCard
                label="Alignment" value={result.final.alignment.toFixed(1)}
                color={result.final.alignment > 0 ? 'text-violet-400' : 'text-orange-400'}
                sub={result.final.alignment > 0 ? 'Mayor-leaning' : 'Opposition-leaning'}
              />
              <MetricCard
                label="Total Turns" value={result.turns.length}
                color="text-gray-300"
              />
            </div>

            {/* Turn feed */}
            <TurnFeed turns={result.turns} />
          </div>
        )}
      </main>
    </div>
  )
}
