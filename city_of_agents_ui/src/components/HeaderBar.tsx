import type { StateSnapshot } from '../types'

type Props = {
  state: StateSnapshot
  onNewGame: () => void
  busy: boolean
}

function readProfileString(state: StateSnapshot, key: string): string | null {
  const value = state.simulation_profile?.[key]
  if (typeof value === 'string' && value.trim().length > 0) return value
  return null
}

function readProfileNumber(state: StateSnapshot, key: string): number | null {
  const value = state.simulation_profile?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

export default function HeaderBar({ state, onNewGame, busy }: Props) {
  const turnsLeft = state.election_turn - state.turn_number
  const cityName = readProfileString(state, 'city_name') ?? readProfileString(state, 'city_id')
  const agentCount =
    readProfileNumber(state, 'actual_agent_count') ?? readProfileNumber(state, 'agent_count')
  const panelSize = readProfileNumber(state, 'llm_panel_size')

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
        {cityName && (
          <span>
            City: <strong>{cityName}</strong>
          </span>
        )}
        {agentCount !== null && (
          <span>
            Agents: <strong>{Math.round(agentCount)}</strong>
            {panelSize !== null ? ` (panel ${Math.round(panelSize)})` : ''}
          </span>
        )}
        <span>{state.rng_seed !== null ? `Seed: ${state.rng_seed}` : ''}</span>
        <button className="btn-new-game" onClick={onNewGame} disabled={busy}>
          New Game
        </button>
      </div>
    </header>
  )
}
