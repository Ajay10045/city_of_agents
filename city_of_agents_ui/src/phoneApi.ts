// API client for The Mayor's Phone game

const BASE = ''  // proxied by Vite dev server

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ---- Types ----

export interface PhoneSnapshot {
  game_id: string
  current_day: number
  total_days: number
  treasury: number
  approval: number
  approval_delta: number
  phase: 'playing' | 'election' | 'game_over'
  active_crises: number
  loss_reason: string | null
  unread_cabinet: number
  unread_media: number
  unread_public: number
  unread_crises: number
}

export interface SecretaryOption {
  label: string
  text: string
  cost: number
  tone: 'diplomatic' | 'bold' | 'deflective' | 'honest'
  action_hint: string
}

export interface InboxMessage {
  id: string
  day: number
  tab: 'cabinet' | 'media' | 'public' | 'crises'
  sender_id: string
  sender_name: string
  sender_role: 'citizen' | 'minister' | 'journalist' | 'opposition' | 'system'
  sender_avatar: string
  text: string
  topic: string | null
  requires_response: boolean
  secretary_options: SecretaryOption[] | null
  thread_id: string | null
  problem_id: string | null
  urgency: 'low' | 'medium' | 'high' | 'critical'
  read: boolean
}

export interface MinisterInfo {
  id: string
  name: string
  portfolio: string
  competence: number
  loyalty?: number
}

export interface ThreadMessage {
  id: string
  day: number
  sender: 'citizen' | 'mayor' | 'secretary' | 'system'
  text: string
  topic: string | null
  cost_committed: number
  tone: string
  read: boolean
}

export interface SurveyResult {
  day_requested: number
  day_delivered: number
  cost: number
  approval_by_area: Record<string, number>
  top_concerns: [string, number][]
  silent_voter_mood: string
  overall_trend: 'improving' | 'stable' | 'declining'
}

// ---- New Game ----

export function phoneNewGame(cityHint: string) {
  return request<{
    game_id: string
    city_name: string
    snapshot: PhoneSnapshot
    inbox: InboxMessage[]
    ministers: MinisterInfo[]
  }>('/api/phone/new', {
    method: 'POST',
    body: JSON.stringify({ city_hint: cityHint }),
  })
}

// ---- Inbox ----

export function phoneGetInbox(gameId: string, tab?: string) {
  const q = tab ? `?tab=${tab}` : ''
  return request<{
    day: number
    messages: InboxMessage[]
    snapshot: PhoneSnapshot
  }>(`/api/phone/${gameId}/inbox${q}`)
}

// ---- Respond ----

export function phoneRespond(gameId: string, messageId: string, text?: string, optionIndex?: number) {
  return request<{
    citizen_reply: string
    cost: number
    action_created: Record<string, unknown> | null
    promise_created: Record<string, unknown> | null
    treasury: number
    snapshot: PhoneSnapshot
  }>(`/api/phone/${gameId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId, text, option_index: optionIndex }),
  })
}

// ---- End Day ----

export function phoneEndDay(gameId: string) {
  return request<{
    snapshot: PhoneSnapshot
    inbox: InboxMessage[]
    survey: SurveyResult | null
  }>(`/api/phone/${gameId}/end-day`, { method: 'POST' })
}

// ---- Survey ----

export function phoneRequestSurvey(gameId: string) {
  return request<{
    status: string
    snapshot: PhoneSnapshot
  }>(`/api/phone/${gameId}/survey`, { method: 'POST' })
}

// ---- Minister Chat ----

export function phoneMessageMinister(gameId: string, ministerId: string, text: string) {
  return request<{
    minister_id: string
    reply: string
    snapshot: PhoneSnapshot
  }>(`/api/phone/${gameId}/minister`, {
    method: 'POST',
    body: JSON.stringify({ minister_id: ministerId, text }),
  })
}

// ---- State ----

export function phoneGetState(gameId: string) {
  return request<{
    snapshot: PhoneSnapshot
    ministers: MinisterInfo[]
    active_crises: Record<string, unknown>[]
    active_problems: Record<string, unknown>[]
    approval_history: number[]
  }>(`/api/phone/${gameId}/state`)
}

// ---- Thread ----

export function phoneGetThread(gameId: string, citizenId: string) {
  return request<{
    citizen_id: string
    citizen_name: string
    citizen_occupation: string
    citizen_area: string
    expression_type: string
    relationship: number
    messages: ThreadMessage[]
  }>(`/api/phone/${gameId}/thread/${citizenId}`)
}
