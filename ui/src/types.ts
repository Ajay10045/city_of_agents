export interface ElectionData {
  turn: number
  mayor_vote_share: number
  opposition_vote_share: number
  outcome: string
  undecided_bloc: number
  swing_voters: number
  winner: string
}

export interface HighestCrisis {
  name: string
  chance: number
}

export interface TurnData {
  turn: number
  in_power: string
  popularity_leader: string
  mayor_action: string
  opposition_action: string
  stat_changes: Record<string, number>
  rumor_pressure: number
  triggered_events: string[]
  escalated_events: string[]
  highest_crisis: HighestCrisis | null
  mayor_popularity: number
  opposition_popularity: number
  mayor_delta: number
  opposition_delta: number
  election: ElectionData | null
}

export interface MediaState {
  bias: number
  sensationalism: number
  trust: number
  network_density: number
}

export interface SimulationFinal {
  governing_party: string
  mayor_popularity: number
  opposition_popularity: number
  city_stats: Record<string, number>
  media_state: MediaState
  happiness: number
  radicalization: number
  alignment: number
  election_results: ElectionData[]
  policy_history: string[]
  event_history: string[]
}

export interface SimulationResult {
  seed: number
  turns: TurnData[]
  final: SimulationFinal
}
