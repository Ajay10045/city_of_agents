import type {
  AdvisorAnswerPayload,
  AdvisorStreamEvent,
  AdvisorSession,
  CounterFrameOption,
  CityProfileGenerateResult,
  CityProfileStatus,
  DynamicPolicy,
  GameSetupConfig,
  MediaTimelineCard,
  SetupOptions,
  StateSnapshot,
  StreamMessage,
  TurnDetail,
  TurnSummary,
} from './types'

type GameConfig = Partial<GameSetupConfig>

type CreateGameResponse = {
  api_version: 'v1'
  game_id: string
  setup?: Record<string, unknown>
  state: StateSnapshot
}

type PoliciesResponse = {
  api_version: 'v1'
  game_id: string
  advisor_session_id?: string
  turn_number?: number
  policies: DynamicPolicy[]
}

export type PoliciesFetchResult = {
  policies: DynamicPolicy[]
  advisorSessionId: string | null
  turnNumber: number | null
}

type TurnsResponse = {
  api_version: 'v1'
  game_id: string
  turns: TurnSummary[]
}

type TurnDetailResponse = {
  api_version: 'v1'
  game_id: string
  turn: TurnDetail
}

type MediaResponse = {
  api_version: 'v1'
  game_id: string
  since_turn: number
  media: MediaTimelineCard[]
}

type ActionAcceptedResponse = {
  api_version: 'v1'
  game_id: string
  status: 'accepted'
  actor: 'mayor' | 'opposition'
  turn_number: number
  events_emitted: number
  last_event_id: number
  action_id?: string | null
  idempotent_replay?: boolean
}

type StreamEnvelope = {
  event_id: number
  game_id: string
  turn: number
  type: string
  actor: string | null
  timestamp: number
  payload: StreamMessage
}

type ActionSubmitOptions = {
  expectedTurn?: number
  participantId?: string
  actionId?: string
  advisorSessionId?: string
  counterFrameId?: string
}

type AdvisorSessionEnvelope = {
  api_version: 'v1'
  game_id: string
  session: AdvisorSession
}

type AdvisorReviseEnvelope = AdvisorSessionEnvelope & {
  options: DynamicPolicy[]
  diff_summary: Record<string, unknown>
}

type AdvisorGeneratePoliciesEnvelope = AdvisorSessionEnvelope & {
  policies: DynamicPolicy[]
  conclusion_summary: string
  generated_from_message_ids: string[]
}

type CounterFramesResponse = {
  api_version: 'v1'
  game_id: string
  policy_id: string
  counter_frames: CounterFrameOption[]
}

export async function fetchSetupOptions(): Promise<SetupOptions> {
  const res = await fetch('/v1/setup/options')
  if (!res.ok) throw new Error(`Setup options error: ${res.status}`)
  return (await res.json()) as SetupOptions
}

export async function fetchCityProfileStatus(cityId: string): Promise<CityProfileStatus> {
  const res = await fetch(`/v1/setup/cities/${encodeURIComponent(cityId)}/status`)
  if (!res.ok) throw new Error(`City profile status error: ${res.status}`)
  return (await res.json()) as CityProfileStatus
}

export async function generateCityProfile(
  cityId: string,
  payload?: {
    force_refresh?: boolean
    provider?: 'anthropic' | 'openai' | 'ollama'
    model?: string
    research_mode?: 'auto' | 'provider_web' | 'backend_fetch'
  },
): Promise<CityProfileGenerateResult> {
  const res = await fetch(`/v1/setup/cities/${encodeURIComponent(cityId)}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  const data = (await res.json()) as CityProfileGenerateResult
  if (!res.ok) {
    throw new Error(data.error ?? `City profile generation error: ${res.status}`)
  }
  return data
}

export async function createGame(
  payload?: GameConfig,
): Promise<{ gameId: string; state: StateSnapshot; setup?: Record<string, unknown> }> {
  const res = await fetch('/v1/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Create game error: ${res.status}`))
  }
  const data = (await res.json()) as CreateGameResponse
  return { gameId: data.game_id, state: data.state, setup: data.setup }
}

export async function fetchState(gameId: string): Promise<StateSnapshot> {
  const res = await fetch(`/v1/games/${encodeURIComponent(gameId)}/state`)
  if (!res.ok) throw new Error(`State error: ${res.status}`)
  const data = (await res.json()) as { api_version: 'v1'; game_id: string; state: StateSnapshot }
  return data.state
}

export async function fetchPolicies(gameId: string): Promise<PoliciesFetchResult> {
  const res = await fetch(`/v1/games/${encodeURIComponent(gameId)}/policies`)
  if (!res.ok) throw new Error(`Policy error: ${res.status}`)
  const data = (await res.json()) as PoliciesResponse
  return {
    policies: data.policies ?? [],
    advisorSessionId: data.advisor_session_id ?? null,
    turnNumber: typeof data.turn_number === 'number' ? data.turn_number : null,
  }
}

export async function fetchCounterFrames(
  gameId: string,
  policyId: string,
): Promise<CounterFrameOption[]> {
  const res = await fetch(
    `/v1/games/${encodeURIComponent(gameId)}/counter-frames?policy_id=${encodeURIComponent(policyId)}`,
  )
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Counter-frames error: ${res.status}`))
  }
  const data = (await res.json()) as CounterFramesResponse
  return data.counter_frames ?? []
}

export async function createAdvisorSession(
  gameId: string,
  payload?: {
    force_refresh?: boolean
    constraints?: string
  },
): Promise<AdvisorSession> {
  const res = await fetch(`/v1/games/${encodeURIComponent(gameId)}/advisor/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Advisor session error: ${res.status}`))
  }
  const data = (await res.json()) as AdvisorSessionEnvelope
  return data.session
}

export async function fetchAdvisorSession(gameId: string, sessionId: string): Promise<AdvisorSession> {
  const res = await fetch(
    `/v1/games/${encodeURIComponent(gameId)}/advisor/sessions/${encodeURIComponent(sessionId)}`,
  )
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Advisor session fetch error: ${res.status}`))
  }
  const data = (await res.json()) as AdvisorSessionEnvelope
  return data.session
}

export async function sendAdvisorMessage(
  gameId: string,
  sessionId: string,
  payload: {
    thread_scope: 'global' | 'option'
    question: string
    option_id?: string | null
  },
): Promise<AdvisorAnswerPayload> {
  const res = await fetch(
    `/v1/games/${encodeURIComponent(gameId)}/advisor/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Advisor message error: ${res.status}`))
  }
  return (await res.json()) as AdvisorAnswerPayload
}

export async function streamAdvisorMessage(
  gameId: string,
  sessionId: string,
  payload: {
    thread_scope: 'global' | 'option'
    question: string
    option_id?: string | null
  },
  onEvent: (event: AdvisorStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `/v1/games/${encodeURIComponent(gameId)}/advisor/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
  )
  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Advisor stream error: ${res.status}`))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const rawChunk of chunks) {
      const line = rawChunk
        .split('\n')
        .find((item) => item.startsWith('data: '))
      if (!line) continue
      const jsonPayload = line.slice(6).trim()
      if (!jsonPayload) continue
      try {
        onEvent(JSON.parse(jsonPayload) as AdvisorStreamEvent)
      } catch {
        // Ignore malformed SSE payload chunk.
      }
    }
  }
}

export async function reviseAdvisorOptions(
  gameId: string,
  sessionId: string,
  payload: {
    mode: 'single' | 'full'
    constraints: string
    option_id?: string
  },
): Promise<AdvisorReviseEnvelope> {
  const res = await fetch(
    `/v1/games/${encodeURIComponent(gameId)}/advisor/sessions/${encodeURIComponent(sessionId)}/revise`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Advisor revise error: ${res.status}`))
  }
  return (await res.json()) as AdvisorReviseEnvelope
}

export async function generateAdvisorPolicies(
  gameId: string,
  sessionId: string,
  payload?: {
    count?: number
    constraints?: string
  },
): Promise<AdvisorGeneratePoliciesEnvelope> {
  const res = await fetch(
    `/v1/games/${encodeURIComponent(gameId)}/advisor/sessions/${encodeURIComponent(sessionId)}/generate-policies`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    },
  )
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Advisor generate policies error: ${res.status}`))
  }
  return (await res.json()) as AdvisorGeneratePoliciesEnvelope
}

export async function fetchTurns(gameId: string): Promise<TurnSummary[]> {
  const res = await fetch(`/v1/games/${encodeURIComponent(gameId)}/turns?limit=100`)
  if (!res.ok) throw new Error(`Turns error: ${res.status}`)
  const data = (await res.json()) as TurnsResponse
  return data.turns ?? []
}

export async function fetchTurnDetail(gameId: string, turn: number): Promise<TurnDetail> {
  const res = await fetch(`/v1/games/${encodeURIComponent(gameId)}/turns/${turn}`)
  if (!res.ok) throw new Error(`Turn detail error: ${res.status}`)
  const data = (await res.json()) as TurnDetailResponse
  return data.turn
}

export async function fetchMediaTimeline(gameId: string, sinceTurn = 0): Promise<MediaTimelineCard[]> {
  const res = await fetch(
    `/v1/games/${encodeURIComponent(gameId)}/media?since_turn=${encodeURIComponent(String(sinceTurn))}`,
  )
  if (!res.ok) throw new Error(`Media timeline error: ${res.status}`)
  const data = (await res.json()) as MediaResponse
  return data.media ?? []
}

export async function streamTurn(
  gameId: string,
  policyId: string,
  afterEventId: number,
  onEvent: (msg: StreamMessage, eventId: number) => void,
  options?: ActionSubmitOptions,
): Promise<number> {
  const actionId =
    options?.actionId ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const actionRes = await fetch(`/v1/games/${encodeURIComponent(gameId)}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actor: 'mayor',
      policy_id: policyId,
      advisor_session_id: options?.advisorSessionId,
      counter_frame_id: options?.counterFrameId,
      expected_turn: options?.expectedTurn,
      participant_id: options?.participantId,
      action_id: actionId,
    }),
  })
  if (!actionRes.ok) {
    const errBody = await actionRes.json().catch(() => ({}))
    const err = new Error(String(errBody.error ?? `Action error: ${actionRes.status}`)) as Error & {
      code?: number
      details?: Record<string, unknown>
    }
    err.code = actionRes.status
    if (errBody && typeof errBody === 'object') {
      err.details = errBody as Record<string, unknown>
    }
    throw err
  }
  await actionRes.json() as ActionAcceptedResponse

  return await new Promise<number>((resolve, reject) => {
    const url = `/v1/games/${encodeURIComponent(gameId)}/events?after_event_id=${afterEventId}&follow=0&timeout=10`
    const es = new EventSource(url)

    let doneSeen = false
    let lastSeen = afterEventId

    es.onmessage = (e) => {
      const envelope = JSON.parse(e.data) as StreamEnvelope
      lastSeen = envelope.event_id
      onEvent(envelope.payload, envelope.event_id)
      if (envelope.payload.type === 'done') {
        doneSeen = true
      }
      if (envelope.payload.type === 'error') {
        es.close()
        reject(new Error(envelope.payload.message))
      }
    }

    es.onerror = () => {
      es.close()
      if (doneSeen) {
        resolve(lastSeen)
      } else {
        reject(new Error('Stream connection error'))
      }
    }
  })
}
