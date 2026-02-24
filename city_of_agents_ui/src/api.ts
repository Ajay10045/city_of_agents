// API client for City of Agents backend

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

// ---- City Profile ----

export function generateProfile(cityHint: string) {
  return request<Record<string, unknown>>('/game/profile', {
    method: 'POST',
    body: JSON.stringify({ city_hint: cityHint }),
  })
}

// ---- New Game ----

export function newGame(cityProfile: Record<string, unknown>, seed?: number) {
  return request<{ game_id: string; state: import('./types').GameState }>('/game/new', {
    method: 'POST',
    body: JSON.stringify({ city_profile: cityProfile, seed }),
  })
}

// ---- Cabinet ----

export function getMinisterCandidates(gameId: string) {
  return request<{ candidates: import('./types').Citizen[] }>(`/game/${gameId}/candidates`)
}

export function assignCabinet(gameId: string, assignments: { citizen_id: string; portfolio: string }[]) {
  return request<{ ok: boolean; ministers: import('./types').Minister[] }>(`/game/${gameId}/cabinet`, {
    method: 'POST',
    body: JSON.stringify({ assignments }),
  })
}

// ---- Consultation ----

export function openConsultation(gameId: string, ministerId: string) {
  return request<{ action: string; minister_id: string; reply: string }>(`/game/${gameId}/consult`, {
    method: 'POST',
    body: JSON.stringify({ action: 'open', minister_id: ministerId }),
  })
}

export function messageMinister(gameId: string, message: string) {
  return request<{ action: string; reply: string }>(`/game/${gameId}/consult`, {
    method: 'POST',
    body: JSON.stringify({ action: 'message', message }),
  })
}

export function closeConsultation(gameId: string) {
  return request<{ action: string; transcript: string }>(`/game/${gameId}/consult`, {
    method: 'POST',
    body: JSON.stringify({ action: 'close' }),
  })
}

// ---- Policies ----

export function getPolicies(gameId: string) {
  return request<{ options: import('./types').Policy[]; turn: number }>(`/game/${gameId}/policies`)
}

// ---- Turn ----

export function executeTurn(
  gameId: string,
  policyIndex: number,
  minorAction: { type: string; target?: string; budget?: number },
  counterFrame: string = 'Delivery Receipts',
) {
  return request<{
    turn_result: import('./types').TurnResult
    state: import('./types').GameState
    game_over: boolean
    loss_reason?: string
    scorecard?: import('./types').GovernanceScorecard
  }>(`/game/${gameId}/turn`, {
    method: 'POST',
    body: JSON.stringify({
      policy_index: policyIndex,
      minor_action: { type: minorAction.type, target: minorAction.target ?? null, budget: minorAction.budget ?? 0 },
      counter_frame: counterFrame,
    }),
  })
}

// ---- State ----

export function getState(gameId: string) {
  return request<import('./types').GameState>(`/game/${gameId}/state`)
}

// ---- Scorecard ----

export function getScorecard(gameId: string) {
  return request<import('./types').GovernanceScorecard>(`/game/${gameId}/scorecard`)
}
