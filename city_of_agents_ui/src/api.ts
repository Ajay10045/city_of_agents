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

export function newGame(cityProfile: Record<string, unknown>, seed?: number, challengeMode?: string) {
  return request<{ game_id: string; state: import('./types').GameState }>('/game/new', {
    method: 'POST',
    body: JSON.stringify({ city_profile: cityProfile, seed, challenge_mode: challengeMode ?? 'standard' }),
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

export function openConsultation(gameId: string, ministerId: string, silent = false) {
  return request<{ action: string; minister_id: string; reply: string }>(`/game/${gameId}/consult`, {
    method: 'POST',
    body: JSON.stringify({ action: 'open', minister_id: ministerId, silent }),
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

export function amendPolicy(gameId: string, index: number, transcript: string) {
  return request<{ amended_index: number; amended_policy: import('./types').Policy; options: import('./types').Policy[]; turn: number }>(`/game/${gameId}/policies/amend`, {
    method: 'POST',
    body: JSON.stringify({ index, transcript }),
  })
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

// ---- Streaming Turn ----

export async function* executeTurnStream(
  gameId: string,
  policyIndex: number,
  minorAction: { type: string; target?: string; budget?: number },
  counterFrame: string = 'Delivery Receipts',
): AsyncGenerator<Record<string, unknown>> {
  const res = await fetch(`/game/${gameId}/turn/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policy_index: policyIndex,
      minor_action: { type: minorAction.type, target: minorAction.target ?? null, budget: minorAction.budget ?? 0 },
      counter_frame: counterFrame,
    }),
  })
  if (!res.ok) throw new Error(`Stream failed: ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()!
    for (const part of parts) {
      const line = part.trim()
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6)) as Record<string, unknown>
      }
    }
  }
}

// ---- Agentic Streaming Turn (v2) ----

export async function* executeTurnStreamV2(
  gameId: string,
  policyIndex: number,
  ministerId: string,
  minorAction: import('./types').MinorActionInput,
  counterFrame: import('./types').CounterFrameStrategy = 'Delivery Receipts',
  powerMove: { type: string; target_event_id?: string } = { type: 'none' },
): AsyncGenerator<Record<string, unknown>> {
  const res = await fetch(`/game/${gameId}/turn/stream/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policy_index: policyIndex,
      minister_id: ministerId,
      minor_action: { type: minorAction.type, target: minorAction.target ?? null, budget: minorAction.budget ?? 0 },
      counter_frame: counterFrame,
      power_move: powerMove,
    }),
  })
  if (!res.ok) throw new Error(`Stream v2 failed: ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()!
    for (const part of parts) {
      const line = part.trim()
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6)) as Record<string, unknown>
      }
    }
  }
}

// ---- Turn Briefing (streaming) ----

export async function* streamTurnBriefing(
  gameId: string,
): AsyncGenerator<Record<string, unknown>> {
  const res = await fetch(`/game/${gameId}/briefing`)
  if (!res.ok) throw new Error(`Briefing stream failed: ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()!
    for (const part of parts) {
      const line = part.trim()
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6)) as Record<string, unknown>
      }
    }
  }
}

// ---- Dilemma Resolution (streaming) ----

export async function* resolveDilemmaStream(
  gameId: string,
  choice: 'a' | 'b',
): AsyncGenerator<Record<string, unknown>> {
  const res = await fetch(`/game/${gameId}/turn/dilemma`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choice }),
  })
  if (!res.ok) throw new Error(`Dilemma resolve failed: ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()!
    for (const part of parts) {
      const line = part.trim()
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6)) as Record<string, unknown>
      }
    }
  }
}

// ---- Event Response Resolution (streaming) ----

export async function* resolveEventResponseStream(
  gameId: string,
  responses: { event_id: string; strategy: string; minister_id?: string }[],
): AsyncGenerator<Record<string, unknown>> {
  const res = await fetch(`/game/${gameId}/turn/event-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  })
  if (!res.ok) throw new Error(`Event response failed: ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()!
    for (const part of parts) {
      const line = part.trim()
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6)) as Record<string, unknown>
      }
    }
  }
}

// ---- Post-Turn Accountability ----

export function applyAccountability(gameId: string, action: string, ministerId: string) {
  return request<Record<string, unknown>>(`/game/${gameId}/turn/accountability`, {
    method: 'POST',
    body: JSON.stringify({ action, minister_id: ministerId }),
  })
}

// ---- State ----

export function getState(gameId: string) {
  return request<import('./types').GameState>(`/game/${gameId}/state`)
}

// ---- Turn History ----

export function getHistory(gameId: string) {
  return request<import('./types').GameHistoryResponse>(`/game/${gameId}/history`)
}

// ---- Scorecard ----

export function getScorecard(gameId: string) {
  return request<import('./types').GovernanceScorecard>(`/game/${gameId}/scorecard`)
}
