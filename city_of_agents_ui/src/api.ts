import type { DynamicPolicy, StateSnapshot, StreamMessage } from './types'

type GameConfig = {
  seed?: number
  turns?: number
  election_turn?: number
}

type CreateGameResponse = {
  api_version: 'v1'
  game_id: string
  state: StateSnapshot
}

type PoliciesResponse = {
  api_version: 'v1'
  game_id: string
  policies: DynamicPolicy[]
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
}

export async function createGame(payload?: GameConfig): Promise<{ gameId: string; state: StateSnapshot }> {
  const res = await fetch('/v1/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) throw new Error(`Create game error: ${res.status}`)
  const data = (await res.json()) as CreateGameResponse
  return { gameId: data.game_id, state: data.state }
}

export async function fetchState(gameId: string): Promise<StateSnapshot> {
  const res = await fetch(`/v1/games/${encodeURIComponent(gameId)}/state`)
  if (!res.ok) throw new Error(`State error: ${res.status}`)
  const data = (await res.json()) as { api_version: 'v1'; game_id: string; state: StateSnapshot }
  return data.state
}

export async function fetchPolicies(gameId: string): Promise<DynamicPolicy[]> {
  const res = await fetch(`/v1/games/${encodeURIComponent(gameId)}/policies`)
  if (!res.ok) throw new Error(`Policy error: ${res.status}`)
  const data = (await res.json()) as PoliciesResponse
  return data.policies ?? []
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
      expected_turn: options?.expectedTurn,
      participant_id: options?.participantId,
      action_id: actionId,
    }),
  })
  if (!actionRes.ok) {
    const errBody = await actionRes.json().catch(() => ({}))
    throw new Error(String(errBody.error ?? `Action error: ${actionRes.status}`))
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
