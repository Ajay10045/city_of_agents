export type GameSetupConfig = {
  seed?: number
  turns: number
  city_id: string
  agent_count: number
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
    turns: number
    city_id: string
    agent_count: number
  }
  limits: {
    turns: { min: number; max: number }
    agent_count: { min: number; max: number }
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
    outlets?: Array<{
      outlet_id: string
      name: string
      lean: 'mayor' | 'opposition' | 'neutral' | string
      bias: number
      sensationalism: number
      trust: number
    }>
  }
  campaign_strength: {
    mayor: number
    opposition: number
  }
  political_capital: number
  campaign_funds: number
  opposition_budget: number
  simulation_profile?: Record<string, unknown>
  last_delivery_report?: DeliveryReport
  delivery_history?: Array<DeliveryReport & { turn: number; policy_id: string; policy_name: string }>
  last_agent_impact?: {
    agent_count_evaluated: number
    llm_panel_count: number
    llm_panel_coverage_ratio: number
    avg_wealth_delta: number
    avg_health_delta: number
    avg_safety_delta: number
    avg_social_delta: number
    dominant_fronts: string[]
  }
  cohort_metrics?: Record<string, {
    group_id: string
    role: string
    population: number
    wealth_delta: number
    health_delta: number
    safety_delta: number
    social_delta: number
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
    wealth: number
    health: number
    safety: number
    social: number
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
  budget_cost?: number
  intent?: string
  implementation_targets?: Array<{
    key: string
    label: string
    unit: string
    proposed: number
    difficulty?: number
  }>
  delivered_outcomes?: Array<{
    key: string
    label: string
    unit: string
    proposed: number
    delivered: number
    completion_ratio: number
    gap: number
  }>
  implementation_gap?: number
  delivery_summary?: string
  group_effects?: Array<{
    match?: Record<string, string>
    wealth?: number
    health?: number
    safety?: number
    social?: number
  }>
  deliberation_trace?: {
    mayor_direction_used?: string
    advisor_inputs_used?: Array<{
      advisor_id: string
      advisor_name?: string
      portfolio: string
      point: string
    }>
    disagreement_resolved?: string
  }
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
  speaker_advisor_id?: string | null
  is_streaming?: boolean
  is_pending?: boolean
  structured?: {
    summary?: string
    drivers?: string[]
    assumptions?: string[]
    tradeoffs?: string[]
    risk?: string
    confidence?: number
    stance?: 'agree' | 'challenge' | 'extend' | string
    portfolio_focus?: string
    responds_to_message_ids?: string[]
    distinctive_risk?: string
    addressed_via?: 'mention' | 'all' | 'auto' | string
    interaction_mode?: 'casual' | 'policy' | string
    interaction_intent?: 'greeting' | 'clarification' | 'direct_answer' | 'ideation' | 'strategy' | string
    context_refs?: string[]
  }
}

export type AdvisorPersona = {
  advisor_id: string
  name: string
  portfolios: string[]
  style: string
  aliases?: string[]
  tone?: string
  voice_traits?: string[]
  conversational_habits?: string[]
  taboo_patterns?: string[]
}

export type AdvisorSession = {
  advisor_session_id: string
  turn_number: number
  options: DynamicPolicy[]
  advisors: AdvisorPersona[]
  global_thread: AdvisorMessage[]
  option_threads: Record<string, AdvisorMessage[]>
  global_memory_summary?: string
  global_memory_anchor_message_id?: string | null
  option_memory_summary?: Record<string, string>
  option_memory_anchor_message_id?: Record<string, string>
  session_status?: 'ready' | 'refining' | 'error' | string
  option_source?: 'live' | 'fallback' | string
  created_at: number
  updated_at: number
}

export type AdvisorStreamEvent =
  | {
      event_type: 'session_snapshot'
      game_id: string
      advisor_session_id: string
      session: AdvisorSession
      timestamp: number
    }
  | {
      event_type: 'mayor_message_accepted'
      game_id: string
      advisor_session_id: string
      message: AdvisorMessage
      timestamp: number
    }
  | {
      event_type: 'advisor_message_start' | 'advisor_message_delta' | 'advisor_message_done'
      game_id: string
      advisor_session_id: string
      message_id: string
      speaker_advisor_id: string
      delta?: string
      content?: string
      structured?: AdvisorMessage['structured']
      done?: boolean
      timestamp: number
    }
  | {
      event_type: 'done' | 'error'
      game_id: string
      advisor_session_id: string
      done?: boolean
      message?: string
      timestamp: number
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
  wealth_delta: number
  health_delta: number
  safety_delta: number
  social_delta: number
}

export type BureaucracyTraits = {
  competency: number
  integrity: number
  skill: number
}

export type StreetChatterItem = {
  turn?: number
  speaker: string
  role: string
  group_name: string
  line: string
  sentiment: string
  heat: number
  tags: string[]
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
  outlet_id?: string
  city_id?: string
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

export type DeliveryReport = {
  execution_score: number
  competence_factor: number
  integrity_drag: number
  implementation_gap: number
  budget_required: number
  budget_spent: number
  stat_deltas: Record<string, number>
  sentiment_effects: Array<Record<string, unknown>>
  targets: Array<{
    key: string
    label: string
    unit: string
    proposed: number
    delivered: number
    completion_ratio: number
    gap: number
  }>
  summary: string
  applied_stat_deltas?: Record<string, number>
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
      implementation_targets?: DynamicPolicy['implementation_targets']
      budget_cost?: number
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
      chatter_items?: StreetChatterItem[]
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
        avg_wealth_delta: number
        avg_health_delta: number
        avg_safety_delta: number
        avg_social_delta: number
        dominant_fronts: string[]
        top_cohorts?: Array<{
          cohort_id: string
          group_id: string
          role: string
          population: number
          wealth_delta: number
          health_delta: number
          safety_delta: number
          social_delta: number
          narrative_shift_delta: number
        }>
      }
    }
  | {
      type: 'implementation_gap_assessed'
      turn: number
      delivery_report: DeliveryReport
    }
  | {
      type: 'cohort_shift_aggregated'
      cohorts: Array<{
        cohort_id: string
        group_id: string
        role: string
        population: number
        wealth_delta: number
        health_delta: number
        safety_delta: number
        social_delta: number
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
        delivery_summary?: string
      }
      stat_deltas: Record<string, number>
      popularity_delta: {
        mayor: number
        opposition: number
      }
      key_events: string[]
      state: StateSnapshot
      media_cards: MediaNarrativeCard[]
      delivery_report?: DeliveryReport | null
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
      delivery_report?: DeliveryReport | null
    }
  | { type: 'error'; message: string }
