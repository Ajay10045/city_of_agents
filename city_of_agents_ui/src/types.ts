export type SamplingStrategy = 'stratified' | 'uniform' | 'none'

export type GameSetupConfig = {
  seed?: number
  turns: number
  turns_to_election: number
  city_id: string
  population_scale: number
  agent_count: number
  llm_panel_size: number
  llm_sampling_strategy: SamplingStrategy
  llm_micro_batch_size: number
  max_parallel_llm_requests: number
  randomness_scale: number
}

export type SetupOptions = {
  api_version: 'v1'
  cities: Array<{
    id: string
    name: string
    profile_ready: boolean
    profile_version: string | null
    last_generated_at: string | null
    last_error?: string | null
  }>
  defaults: {
    turns_to_election: number
    city_id: string
    population_scale: number
    agent_count: number
    llm_panel_size: number
    llm_sampling_strategy: SamplingStrategy
    llm_micro_batch_size: number
    max_parallel_llm_requests: number
    randomness_scale: number
  }
  limits: {
    turns_to_election: { min: number; max: number }
    population_scale: { min: number; max: number }
    agent_count: { min: number; max: number }
    llm_panel_size: { min: number; max: number }
    llm_sampling_strategy: SamplingStrategy[]
    llm_micro_batch_size: { min: number; max: number }
    max_parallel_llm_requests: { min: number; max: number }
    randomness_scale: { min: number; max: number }
  }
}

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
  simulation_profile?: Record<string, unknown>
  last_agent_impact?: {
    agent_count_evaluated: number
    llm_panel_count: number
    llm_panel_coverage_ratio: number
    avg_happiness_delta: number
    avg_radicalization_delta: number
    avg_alignment_delta: number
    avg_trust_delta: number
    dominant_fronts: string[]
  }
  cohort_metrics?: Record<string, {
    group_id: string
    role: string
    population: number
    happiness_delta: number
    radicalization_delta: number
    alignment_delta: number
    trust_delta: number
    narrative_shift_delta: number
  }>
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
  why_now?: string
  target_groups?: string[]
  expected_stat_delta?: Record<string, number>
  opposition_counter_risk?: number
  narrative_fronts_impacted?: Record<string, number>
  confidence?: number
  assumptions?: string[]
  tradeoffs?: string[]
  counter_narrative_risk?: string
  effects?: Record<string, number>
  group_effects?: Array<{
    match?: Record<string, string>
    happiness?: number
    radicalization?: number
  }>
}

export type CounterFrameOption = {
  id: string
  label: string
  message: string
  target_groups: string[]
  campaign_boost: number
  effects: Record<string, number>
  risk?: string
  reacts_to?: string
  attack_front?: string
  attack_intensity?: number
}

export type AdvisorMessage = {
  id: string
  role: 'user' | 'advisor' | string
  content: string
  thread_scope: 'global' | 'option' | string
  option_id: string | null
  timestamp: number
  structured?: {
    summary?: string
    drivers?: string[]
    assumptions?: string[]
    tradeoffs?: string[]
    risk?: string
    confidence?: number
  }
}

export type AdvisorSession = {
  advisor_session_id: string
  turn_number: number
  options: DynamicPolicy[]
  global_thread: AdvisorMessage[]
  option_threads: Record<string, AdvisorMessage[]>
  created_at: number
  updated_at: number
}

export type AdvisorAnswerPayload = {
  answer: {
    summary: string
    drivers: string[]
    assumptions: string[]
    tradeoffs: string[]
    risk: string
    confidence: number
  }
  cited_option_ids: string[]
  suggested_actions: string[]
  session: AdvisorSession
}

export type CityProfileStatus = {
  api_version: 'v1'
  city_id: string
  profile_ready: boolean
  profile_version: string | null
  last_generated_at: string | null
  source_path: string | null
  last_error: string | null
}

export type CityProfileGenerateResult = {
  api_version: 'v1'
  status: 'generated' | 'cached' | 'failed'
  city_id: string
  profile_version: string | null
  generated_at: string | null
  evidence_count: number
  cache_path: string | null
  error?: string
}

export type GeneratedEvent = {
  name: string
  type: string
  severity: 'minor' | 'moderate' | 'major'
  duration: number
  description?: string
}

export type DebateResult = {
  turn?: number
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

export type MediaNarrativeCard = {
  headline: string
  source: string
  lean: 'mayor' | 'opposition' | 'neutral'
  virality: number
  trust_impact: number
  front: string
  turn?: number
}

export type MediaTimelineCard = MediaNarrativeCard & {
  turn: number
}

export type TurnSummary = {
  turn: number
  headline: string
  winner_fronts: string[]
  event_count: number
  mayor_action: string | null
  opposition_action: string | null
  key_events: string[]
  in_power: string | null
  popularity?: {
    mayor: number | null
    opposition: number | null
  }
}

export type TurnEvent = {
  event_id: number
  type: string
  actor: string | null
  timestamp: number
  payload: Record<string, unknown>
}

export type TurnDetail = TurnSummary & {
  stat_deltas: Record<string, number>
  media_cards: MediaTimelineCard[]
  events: TurnEvent[]
}

export type StreamMessage =
  | {
      type: 'mayor_action_submitted'
      turn: number
      action: DynamicPolicy
      message?: string
      target_groups?: string[]
      front_weights?: Record<string, number>
      estimated_shift?: Record<string, number>
    }
  | {
      type: 'opposition_frame_primary'
      turn: number
      action: DynamicPolicy
      message?: string
      target_groups?: string[]
      front_weights?: Record<string, number>
      estimated_shift?: Record<string, number>
    }
  | {
      type: 'mayor_counter_frame'
      turn: number
      message: string
      target_groups?: string[]
      front_weights?: Record<string, number>
      estimated_shift?: Record<string, number>
    }
  | {
      type: 'opposition_frame_followup'
      turn: number
      message: string
      target_groups?: string[]
      front_weights?: Record<string, number>
      estimated_shift?: Record<string, number>
    }
  | {
      type: 'street_chatter_synthesized'
      turn: number
      summary: string[]
      dominant_fronts: string[]
      triggered_events: string[]
    }
  | { type: 'mayor_action'; action: DynamicPolicy }
  | { type: 'opposition_action'; action: DynamicPolicy }
  | { type: 'generated_event'; event: GeneratedEvent | null }
  | { type: 'media_narrative_published'; turn: number; cards: MediaNarrativeCard[] }
  | { type: 'counter_frame_selected'; turn: number; counter_frame: CounterFrameOption }
  | { type: 'debate'; debate: DebateResult }
  | {
      type: 'agent_impact_assessed'
      summary: {
        agent_count_evaluated: number
        llm_panel_count: number
        llm_panel_coverage_ratio: number
        avg_happiness_delta: number
        avg_radicalization_delta: number
        avg_alignment_delta: number
        avg_trust_delta: number
        dominant_fronts: string[]
      }
    }
  | {
      type: 'cohort_shift_aggregated'
      cohorts: Array<{
        cohort_id: string
        group_id: string
        role: string
        population: number
        happiness_delta: number
        radicalization_delta: number
        alignment_delta: number
        trust_delta: number
        narrative_shift_delta: number
      }>
    }
  | {
      type: 'simulation_stats_applied'
      turn: number
      stat_deltas: Record<string, number>
      triggered_events: string[]
      escalated_events: string[]
      event_chances: Record<string, number>
    }
  | {
      type: 'popularity_recalculated'
      turn: number
      mayor_popularity: number
      opposition_popularity: number
      governing_party: string
      credibility?: {
        credibility_delta: number
        credibility_score: number
        new_promises: number
        open_promises: number
      }
    }
  | {
      type: 'turn_closed'
      turn: number
      turn_summary: {
        mayor_action: string
        opposition_action: string
        dominant_fronts: string[]
        events_triggered: string[]
      }
      stat_deltas: Record<string, number>
      popularity_delta: {
        mayor: number
        opposition: number
      }
      key_events: string[]
      state: StateSnapshot
      media_cards: MediaNarrativeCard[]
      election_result: ElectionResult | null
      game_over: boolean
    }
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
