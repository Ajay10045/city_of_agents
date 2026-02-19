export type StateSnapshot = {
  turn_number: number
  total_turns: number
  election_turn: number
  mayor_popularity: number
  opposition_popularity: number
  governing_party: string
  rng_seed: number | null
  city_stats: Record<string, number>
  media_state: {
    bias: number
    sensationalism: number
    trust: number
  }
  campaign_strength: {
    mayor: number
    opposition: number
  }
  active_events: Array<{
    id: string
    name: string
    type: string
    escalation_level: number
    max_escalation: number
    remaining_turns: number
  }>
  group_metrics: Record<string, {
    population: number
    happiness: number
    radicalization: number
    alignment: number
    trust: number
  }>
  policy_history: string[]
  identity_groups: Record<string, {
    name: string
    religion: string
    caste: string
    language: string
    population_percent: number
    grievance_score: number
  }>
  event_history: string[]
  election_results: Array<Record<string, unknown>>
  long_term_effects: Array<{ source_id: string; actor: string; remaining_turns: number }>
  credibility_score: number
  last_credibility_delta: number
  open_promises: number
}

export type DynamicPolicy = {
  id: string
  actor: 'mayor' | 'opposition'
  name: string
  description: string
  rationale?: string
  effects?: Record<string, number>
  group_effects?: Array<{
    match?: Record<string, string>
    happiness?: number
    radicalization?: number
  }>
}

export type GeneratedEvent = {
  name: string
  type: string
  severity: 'minor' | 'moderate' | 'major'
  duration: number
  description?: string
}

export type DebateResult = {
  group_name: string
  debate_summary: string
  notable_quote?: string
  alignment_delta: number
  happiness_delta: number
  radicalization_delta: number
  trust_delta: number
}

export type ElectionResult = {
  mayor_vote_share: number
  opposition_vote_share: number
  undecided_bloc: number
  swing_voters: number
  outcome: string
}

export type StreamMessage =
  | { type: 'mayor_action'; action: DynamicPolicy }
  | { type: 'opposition_action'; action: DynamicPolicy }
  | { type: 'generated_event'; event: GeneratedEvent | null }
  | { type: 'debate'; debate: DebateResult }
  | {
      type: 'done'
      turn: number
      state: StateSnapshot
      stat_changes: Record<string, number>
      triggered_events: string[]
      escalated_events: string[]
      event_chances: Record<string, number>
      rumor_pressure: number
      credibility?: {
        credibility_delta: number
        credibility_score: number
        new_promises: number
        open_promises: number
      }
      election_result: ElectionResult | null
      game_over: boolean
    }
  | { type: 'error'; message: string }
