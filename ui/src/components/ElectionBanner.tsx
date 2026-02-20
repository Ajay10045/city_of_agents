import type { SimulationResult } from '../types'

interface Props {
  result: SimulationResult
}

export default function ElectionBanner({ result }: Props) {
  const { final, seed } = result
  const mayorWon = final.governing_party === 'Mayor'
  const electionResult = final.election_results[0]

  return (
    <div className={`rounded-xl p-5 border ${mayorWon
      ? 'bg-violet-950/60 border-violet-700'
      : 'bg-orange-950/60 border-orange-700'
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Election Result</p>
          <h2 className={`text-2xl font-bold ${mayorWon ? 'text-violet-300' : 'text-orange-300'}`}>
            {mayorWon ? '🏛️ Mayor wins' : '⚡ Opposition wins'}
          </h2>
          {electionResult && (
            <p className="text-sm text-gray-400 mt-1">{electionResult.outcome}</p>
          )}
        </div>

        <div className="flex gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-violet-400">{final.mayor_popularity.toFixed(1)}%</p>
            <p className="text-xs text-gray-500 mt-0.5">Mayor</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-400">{final.opposition_popularity.toFixed(1)}%</p>
            <p className="text-xs text-gray-500 mt-0.5">Opposition</p>
          </div>
          {electionResult && (
            <>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-300">{electionResult.undecided_bloc}%</p>
                <p className="text-xs text-gray-500 mt-0.5">Undecided</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-300">{electionResult.swing_voters}%</p>
                <p className="text-xs text-gray-500 mt-0.5">Swing</p>
              </div>
            </>
          )}
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-300 font-mono">{seed}</p>
            <p className="text-xs text-gray-500 mt-0.5">Seed</p>
          </div>
        </div>
      </div>

      {/* Popularity bar */}
      <div className="mt-4 h-2 rounded-full overflow-hidden bg-gray-800 flex">
        <div
          className="bg-violet-500 transition-all"
          style={{ width: `${final.mayor_popularity}%` }}
        />
        <div className="flex-1 bg-orange-500" />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>Mayor {final.mayor_popularity.toFixed(1)}%</span>
        <span>Opposition {final.opposition_popularity.toFixed(1)}%</span>
      </div>
    </div>
  )
}
