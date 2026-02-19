import type { StateSnapshot } from '../types'

type Props = {
  state: StateSnapshot
  onNewGame: () => void
  busy: boolean
}

export default function HeaderBar({ state, onNewGame, busy }: Props) {
  const turnsLeft = state.election_turn - state.turn_number

  return (
    <header className="header">
      <h1>City of Agents</h1>
      <div className="header-meta">
        <span>
          Turn <strong>{state.turn_number}</strong> / <strong>{state.total_turns}</strong>
        </span>
        <span>{turnsLeft > 0 ? `Election in ${turnsLeft} turns` : 'Election passed'}</span>
        <span>
          In Power: <strong>{state.governing_party}</strong>
        </span>
        <span>{state.rng_seed !== null ? `Seed: ${state.rng_seed}` : ''}</span>
        <button className="btn-new-game" onClick={onNewGame} disabled={busy}>
          New Game
        </button>
      </div>
    </header>
  )
}
