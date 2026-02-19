import type { StateSnapshot } from '../types'

type Props = {
  state: StateSnapshot
  visible: boolean
  onPlayAgain: () => void
}

export default function GameOverOverlay({ state, visible, onPlayAgain }: Props) {
  if (!visible) return null

  return (
    <div id="gameover-overlay" className="visible">
      <div className="gameover-card">
        <h2>Simulation Complete</h2>
        <p>
          Governing party: <strong>{state.governing_party}</strong>
          <br />
          Final popularity — Mayor: <strong>{state.mayor_popularity.toFixed(1)}%</strong> &nbsp; Opposition:{' '}
          <strong>{state.opposition_popularity.toFixed(1)}%</strong>
        </p>
        <button className="btn-continue" onClick={onPlayAgain}>Play Again</button>
      </div>
    </div>
  )
}
