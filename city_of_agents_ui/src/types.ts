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

export interface TurnResult {
  turn: number
  major_policy: Policy
  minor_action: { type: string; target?: string; budget: number }
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
  counter_frame: string
  approval_before: number
  interim_approval: number
  ward_report: WardReportEntry[]
  events_triggered: ActiveEvent[]
  communal_tension_after: number
  minister_loyalty_changes: Record<string, number>
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
  turn_history_count: number
  last_turn: TurnResult | null
  ward_report: WardReportEntry[]
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
