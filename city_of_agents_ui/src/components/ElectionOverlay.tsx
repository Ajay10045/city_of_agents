import type { ElectionResult } from '../types'

type Props = {
  result: ElectionResult | null
  onContinue: () => void
}

export default function ElectionOverlay({ result, onContinue }: Props) {
  if (!result) return null

  const outcomeClass =
    result.mayor_vote_share > result.opposition_vote_share
      ? 'mayor-win'
      : result.opposition_vote_share > result.mayor_vote_share
        ? 'opp-win'
        : 'hung'

  return (
    <div id="election-overlay" className="visible">
      <div className="election-card">
        <h2>Election Results</h2>

        <div className="election-bars">
          <div className="election-bar-row">
            <span className="election-bar-label">Mayor</span>
            <div className="election-bar-track">
              <div className="election-bar-fill mayor" style={{ width: `${result.mayor_vote_share}%` }} />
            </div>
            <span className="election-bar-pct">{result.mayor_vote_share.toFixed(1)}%</span>
          </div>

          <div className="election-bar-row">
            <span className="election-bar-label">Opposition</span>
            <div className="election-bar-track">
              <div className="election-bar-fill opp" style={{ width: `${result.opposition_vote_share}%` }} />
            </div>
            <span className="election-bar-pct">{result.opposition_vote_share.toFixed(1)}%</span>
          </div>
        </div>

        <div className={`outcome ${outcomeClass}`}>{result.outcome}</div>
        <div className="election-meta">
          Undecided: {(result.undecided_bloc * 100).toFixed(1)}% · Swing voters: {(result.swing_voters * 100).toFixed(1)}%
        </div>

        <button className="btn-continue" onClick={onContinue}>Continue</button>
      </div>
    </div>
  )
}
