// Shared type definitions for City of Agents UI

export interface CityParameters {
  jobs_and_commerce: number
  transit_and_roads: number
  water_power_sanitation: number
  hospitals_and_clinics: number
  schools_and_universities: number
  affordable_housing: number
  community_and_spaces: number
  police_and_emergency: number
  courts_and_legal: number
  air_quality_and_pollution: number
  admin_efficiency: number
  anti_corruption: number
  media_freedom: number
}

export interface CitizenDemographics {
  age_group: string
  income_percentile: number
  income_bracket: string
  religion: string
  profession: string
  education_level: number
  location: string
  ideology_economic: string
  ideology_social: string
}

export interface Citizen {
  id: string
  name: string
  demographics: CitizenDemographics
  personality: Record<string, number>
  capability: Record<string, number>
  wellbeing: number
  mayor_alignment: number
}

export interface Minister extends Citizen {
  portfolio: string
  extra_portfolios: string[]
  loyalty: number
  scandal_exposure: number
  political_capital: number
  fatigue: number
}

export interface ActiveEvent {
  id: string
  name: string
  type: 'crisis' | 'opportunity'
  severity: number
  turns_remaining: number
  escalation_level: number
  portfolio: string
}

export interface MediaOutlet {
  name: string
  lean: 'mayor' | 'opposition' | 'neutral'
  trust_rating: number
  reach: number
}

export interface PolicyTarget {
  key: string
  label: string
  unit: string
  proposed: number
  difficulty: number
}

export interface PolicyAdvisorStance {
  minister_name?: string
  ministerName?: string
  stance: string
  reason: string
}

export interface Policy {
  name: string
  description: string
  portfolio: string
  budget_cost: number
  target_effects: Record<string, number>
  side_effects: Record<string, number>
  time_profile: Record<string, number>
  targets: PolicyTarget[]
  tradeoffs: string
  why_now: string
  advisor_stances?: PolicyAdvisorStance[]
}

export type StanceValue = 'approve' | 'disapprove'

export interface AdvisorStance {
  ministerId: string
  ministerName: string
  stance: StanceValue
  reason: string
}

export interface DeliveryTarget {
  key: string
  label: string
  unit: string
  proposed: number
  delivered: number
  completion_ratio: number
}

export interface CitizenVoice {
  citizen_id: string
  name: string
  demographics_summary: string
  ideology: string
  reaction: string
  sentiment: 'approve' | 'disapprove' | 'undecided'
}

export interface MediaHeadline {
  outlet: string
  lean: 'mayor' | 'opposition' | 'neutral'
  headline: string
}

export interface WardReportEntry {
  group_type: string
  group_name: string
  trend: 'up' | 'flat' | 'down'
  avg_wellbeing_delta: number
  avg_wellbeing: number
  hotspot: boolean
  bright_spot: boolean
  population: number
  population_pct: number
  approval: number
  pulse_summary: string
}

export type MinorActionType =
  | 'maintenance'
  | 'banking'
  | 'reshuffle'
  | 'press_conference'
  | 'emergency_fund'
  | 'governance_upkeep'

export interface MinorActionInput {
  type: MinorActionType
  target?: string
  budget: number
}

export type CounterFrameStrategy =
  | 'Delivery Receipts'
  | 'Empathy + Relief'
  | 'Accountability Pivot'
  | 'Attack the Attacker'
  | 'Populist Counter'

export interface TurnChoiceSnapshot {
  turn: number
  policyIndex: number
  policyName: string
  ministerId: string
  ministerName: string
  minorAction: MinorActionInput
  counterFrame: CounterFrameStrategy
  chosenAtIso: string
}

export interface TurnResult {
  turn: number
  major_policy: Policy
  minor_action: MinorActionInput
  execution_score: number
  actual_deltas: Record<string, number>
  side_effect_deltas: Record<string, number>
  budget_stolen: number
  delivery_targets: DeliveryTarget[]
  delivery_narrative: string
  evaluator_reasoning?: string
  city_params_before: Record<string, number>
  city_params_after: Record<string, number>
  media_headlines: MediaHeadline[]
  citizen_voices: CitizenVoice[]
  opposition_attack: string
  counter_frame: CounterFrameStrategy
  assigned_minister_id?: string
  assigned_minister_name?: string
  approval_before: number
  interim_approval: number
  ward_report: WardReportEntry[]
  events_triggered: ActiveEvent[]
  communal_tension_after: number
  minister_loyalty_changes: Record<string, number>
  minister_fatigue_changes?: Record<string, number>
  minister_scandal_changes?: Record<string, number>
  minister_political_capital_changes?: Record<string, number>
  minister_consequences?: string[]
  treasury_after: number
  outstanding_debt_after: number
  interest_paid: number
  tax_revenue: number
  advisor_summary: string
}

export interface GameState {
  game_id: string
  city_name: string
  current_turn: number
  total_turns: number
  election_turn: number
  phase: string
  treasury: number
  outstanding_debt: number
  communal_tension: number
  opposition_credibility: number
  city_params: CityParameters
  ministers: Minister[]
  active_events: ActiveEvent[]
  media_outlets: MediaOutlet[]
  interim_approval: number
  avg_wellbeing: number
  ideology_track: Record<string, number>
  political_capital: number
  turn_history_count: number
  last_turn: TurnResult | null
  ward_report: WardReportEntry[]
  citizens?: Citizen[]
}

export interface GameHistoryResponse {
  game_id: string
  turns: TurnResult[]
}

export interface GovernanceScorecard {
  game_id: string
  final_approval: number
  wellbeing_equity: number
  institutional_legacy: number
  budget_health: number
  crisis_record: number
  promise_delivery: number
  cabinet_integrity: number
  final_score: number
  legacy_title: string
  summary: string
}

export interface BriefingMayorSummaryEvent {
  type: 'mayor_summary'
  elected_on: string
  people_like: string
  people_dislike: string
  media_like: string
  media_dislike: string
}

// ---- Turn Stream v2 events ----

export type TurnStreamNarrativeKey = 'delivery' | 'headlines' | 'advisor'

export interface TurnStreamAnnouncementEvent {
  type: 'announcement'
  policy: Policy
  minister_name: string
  minister_portfolio: string
}

export interface TurnStreamAnnouncementVoicesEvent {
  type: 'announcement_voices'
  voices: CitizenVoice[]
}

export interface TurnStreamAssignmentEvent {
  type: 'assignment'
  minister_id: string
  minister_name: string
  portfolio: string
  competence: number
  loyalty: number
  scandal_exposure: number
}

export interface TurnStreamEvaluationEvent {
  type: 'evaluation'
  execution_pct: number
  leakage_cr: number
  city_param_deltas: Record<string, number>
  side_effect_deltas: Record<string, number>
  reasoning: string
}

export interface TurnStreamWellbeingUpdateEvent {
  type: 'wellbeing_update'
  ward_report: WardReportEntry[]
}

export interface TurnStreamImplementationVoicesEvent {
  type: 'implementation_voices'
  voices: CitizenVoice[]
}

export interface TurnStreamApprovalVoteEvent {
  type: 'approval_vote'
  voice: CitizenVoice
  population_weight: number
}

export interface TurnStreamApprovalFinalEvent {
  type: 'approval_final'
  approval: number
  approval_before: number
  breakdown: {
    approve: number
    disapprove: number
    undecided: number
    total: number
  }
}

export interface TurnStreamEventsEvent {
  type: 'events'
  events_triggered: ActiveEvent[]
}

export interface TurnStreamNarrativeChunkEvent {
  type: 'narrative_chunk'
  key: TurnStreamNarrativeKey
  value: string | MediaHeadline[] | Record<string, unknown>[]
}

export interface TurnForecast {
  hotspots: string[]
  opportunities: string[]
  pressure_note: string[]
}

export interface TurnStreamCompleteEvent {
  type: 'complete'
  turn_result: TurnResult
  state: GameState
  game_over: boolean
  loss_reason?: string
  scorecard?: GovernanceScorecard
  forecast?: TurnForecast
}

export interface DilemmaOption {
  label: string
  description: string
  effect_key: string
  effect_delta: number
  ideology_tag: string
}

export interface TurnStreamDilemmaEvent {
  type: 'dilemma'
  situation: string
  option_a: DilemmaOption
  option_b: DilemmaOption
}

export interface TurnStreamDilemmaResolvedEvent {
  type: 'dilemma_resolved'
  choice: string
  label: string
  effect_key: string
  effect_delta: number
  ideology_tag: string
}

export interface TurnStreamIdeologyUpdateEvent {
  type: 'ideology_update'
  track: Record<string, number>
  passive_unlocked: string | null
}

export interface TurnStreamPowerMoveEvent {
  type: 'power_move_applied'
  move_type: string
  pc_cost: number
  effect_summary: string
  political_capital_after: number
}

export interface TurnStreamPCEarnedEvent {
  type: 'pc_earned'
  amount: number
  reasons: string[]
  total: number
}

export type PowerMoveType =
  | 'media_blitz'
  | 'crisis_intervention'
  | 'opposition_discredit'
  | 'rally_the_base'
  | 'fast_track'
  | 'none'

export interface EventResponseStrategy {
  strategy: string
  label: string
  description: string
  cost_treasury?: number
  cost_pc?: number
}

export interface EventResponseOption {
  event_id: string
  event_name: string
  event_type: string
  strategies: EventResponseStrategy[]
}

export interface TurnStreamEventResponsePromptEvent {
  type: 'event_response_prompt'
  events: ActiveEvent[]
  options: EventResponseOption[]
}

export interface TurnStreamEventResponseAppliedEvent {
  type: 'event_response_applied'
  event_id: string
  strategy: string
  effect: string
}

export interface TurnStreamErrorEvent {
  type: 'error'
  message: string
}

export type TurnStreamV2Event =
  | TurnStreamAnnouncementEvent
  | TurnStreamAnnouncementVoicesEvent
  | TurnStreamAssignmentEvent
  | TurnStreamEvaluationEvent
  | TurnStreamDilemmaEvent
  | TurnStreamDilemmaResolvedEvent
  | TurnStreamIdeologyUpdateEvent
  | TurnStreamWellbeingUpdateEvent
  | TurnStreamImplementationVoicesEvent
  | TurnStreamApprovalVoteEvent
  | TurnStreamApprovalFinalEvent
  | TurnStreamEventsEvent
  | TurnStreamNarrativeChunkEvent
  | TurnStreamPowerMoveEvent
  | TurnStreamPCEarnedEvent
  | TurnStreamEventResponsePromptEvent
  | TurnStreamEventResponseAppliedEvent
  | TurnStreamCompleteEvent
  | TurnStreamErrorEvent
