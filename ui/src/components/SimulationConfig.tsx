import { useState } from 'react'

interface Props {
  onSimulate: (turns: number, electionTurn: number, seed: number | null) => void
  loading: boolean
}

export default function SimulationConfig({ onSimulate, loading }: Props) {
  const [turns, setTurns] = useState(50)
  const [electionTurn, setElectionTurn] = useState(50)
  const [randomSeed, setRandomSeed] = useState(true)
  const [seed, setSeed] = useState(42)

  const handleElectionTurn = (v: number) => {
    setElectionTurn(Math.min(v, turns))
  }

  const handleTurns = (v: number) => {
    setTurns(v)
    if (electionTurn > v) setElectionTurn(v)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">🏛️ City of Power</h1>
        <p className="text-xs text-gray-500 mt-1">AI political simulation</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Turns */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Total Turns</span>
            <span className="text-white font-mono">{turns}</span>
          </div>
          <input
            type="range" min={5} max={200} step={5} value={turns}
            onChange={e => handleTurns(Number(e.target.value))}
            className="w-full accent-violet-500"
          />
        </div>

        {/* Election turn */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Election on Turn</span>
            <span className="text-white font-mono">{electionTurn}</span>
          </div>
          <input
            type="range" min={5} max={turns} step={5} value={electionTurn}
            onChange={e => handleElectionTurn(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
        </div>

        {/* Seed */}
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox" checked={randomSeed}
              onChange={e => setRandomSeed(e.target.checked)}
              className="accent-violet-500"
            />
            Random Seed
          </label>
          {!randomSeed && (
            <input
              type="number" value={seed}
              onChange={e => setSeed(Number(e.target.value))}
              className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          )}
        </div>
      </div>

      <button
        onClick={() => onSimulate(turns, electionTurn, randomSeed ? null : seed)}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Simulating…
          </span>
        ) : '▶ Simulate'}
      </button>
    </div>
  )
}
