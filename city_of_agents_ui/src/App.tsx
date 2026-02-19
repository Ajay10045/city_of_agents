import { useEffect, useState } from 'react'
import { createGame, fetchPolicies, fetchState, streamTurn } from './api'
import type {
  DebateResult,
  DynamicPolicy,
  ElectionResult,
  StateSnapshot,
  StreamMessage,
} from './types'
import HeaderBar from './components/HeaderBar'
import ErrorBanner from './components/ErrorBanner'
import CityStatsPanel from './components/CityStatsPanel'
import IdentityGroupsPanel from './components/IdentityGroupsPanel'
import CrisesPanel from './components/CrisesPanel'
import PoliciesPanel from './components/PoliciesPanel'
import StreamFeedPanel, { type StreamCardItem } from './components/StreamFeedPanel'
import SidebarPanels from './components/SidebarPanels'
import DebatesPanel from './components/DebatesPanel'
import TurnResultBanner from './components/TurnResultBanner'
import TurnLogPanel from './components/TurnLogPanel'
import ElectionOverlay from './components/ElectionOverlay'
import GameOverOverlay from './components/GameOverOverlay'

export default function App() {
  const [gameId, setGameId] = useState<string | null>(null)
  const [lastEventId, setLastEventId] = useState(0)
  const [state, setState] = useState<StateSnapshot | null>(null)
  const [policies, setPolicies] = useState<DynamicPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [stream, setStream] = useState<StreamCardItem[]>([])
  const [debates, setDebates] = useState<DebateResult[]>([])
  const [statChanges, setStatChanges] = useState<Record<string, number>>({})
  const [eventChances, setEventChances] = useState<Record<string, number>>({})
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [turnResultVisible, setTurnResultVisible] = useState(false)
  const [turnMayorAction, setTurnMayorAction] = useState<DynamicPolicy | null>(null)
  const [turnOppAction, setTurnOppAction] = useState<DynamicPolicy | null>(null)
  const [turnTriggeredEvents, setTurnTriggeredEvents] = useState<string[]>([])
  const [electionResult, setElectionResult] = useState<ElectionResult | null>(null)
  const [gameOverVisible, setGameOverVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPolicies = async (gid: string) => {
    setPoliciesLoading(true)
    try {
      const p = await fetchPolicies(gid)
      setPolicies(p)
    } finally {
      setPoliciesLoading(false)
    }
  }

  const resetTurnPanels = () => {
    setDebates([])
    setStream([])
    setStatChanges({})
    setEventChances({})
    setTurnResultVisible(false)
    setTurnMayorAction(null)
    setTurnOppAction(null)
    setTurnTriggeredEvents([])
  }

  const load = async () => {
      setLoading(true)
      setError(null)
      try {
      const { gameId: gid } = await createGame({})
      const s = await fetchState(gid)
      setGameId(gid)
      setLastEventId(0)
      setState(s)
      resetTurnPanels()
      setElectionResult(null)
      setGameOverVisible(false)
      await loadPolicies(gid)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading game')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onPolicy = async (policyId: string) => {
    if (busy || !gameId || !state) return
    setBusy(true)
    setError(null)
    setSelectedPolicyId(policyId)
    resetTurnPanels()

    let mayorAction: DynamicPolicy | null = null
    let oppAction: DynamicPolicy | null = null

    try {
      const nextEventId = await streamTurn(
        gameId,
        policyId,
        lastEventId,
        (msg: StreamMessage, eventId: number) => {
          setLastEventId((prev) => Math.max(prev, eventId))
          if (msg.type === 'mayor_action') {
            mayorAction = msg.action
            setTurnMayorAction(msg.action)
            setStream((s) => [
              ...s,
              {
                kind: 'mayor',
                label: '🏛 Mayor Action',
                name: msg.action.name,
                description: msg.action.description,
                rationale: msg.action.rationale,
              },
            ])
          }
          if (msg.type === 'opposition_action') {
            oppAction = msg.action
            setTurnOppAction(msg.action)
            setStream((s) => [
              ...s,
              {
                kind: 'opposition',
                label: '⚔ Opposition Response',
                name: msg.action.name,
                description: msg.action.description,
                rationale: msg.action.rationale,
              },
            ])
          }
          if (msg.type === 'generated_event') {
            const ev = msg.event
            if (ev) {
              setStream((s) => [
                ...s,
                {
                  kind: 'event',
                  label: `${ev.severity === 'major' ? '🚨' : ev.severity === 'moderate' ? '⚠️' : '⚡'} Crisis Emerged`,
                  name: ev.name,
                  description: ev.description,
                  meta: `${ev.severity} · ${ev.type} · ${ev.duration} turn${ev.duration === 1 ? '' : 's'}`,
                },
              ])
            }
          }
          if (msg.type === 'debate') {
            setDebates((d) => [...d, msg.debate])
          }
          if (msg.type === 'error') {
            setError(msg.message)
          }
          if (msg.type === 'done') {
            setStatChanges(msg.stat_changes ?? {})
            setEventChances(msg.event_chances ?? {})
            setTurnTriggeredEvents(msg.triggered_events ?? [])
            setTurnResultVisible(true)

            if (!mayorAction) setTurnMayorAction(null)
            if (!oppAction) setTurnOppAction(null)

            setState(msg.state)
            setElectionResult(msg.election_result)
            setGameOverVisible(Boolean(msg.game_over && !msg.election_result))
            if (!msg.game_over || msg.election_result) {
              loadPolicies(gameId).catch(() => undefined)
            } else {
              setPolicies([])
              setPoliciesLoading(false)
            }
          }
        },
        { expectedTurn: state.turn_number + 1 },
      )
      setLastEventId((prev) => Math.max(prev, nextEventId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stream connection error')
    } finally {
      setBusy(false)
      setSelectedPolicyId(null)
    }
  }

  const onNewGame = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { gameId: gid, state: s } = await createGame({})
      setGameId(gid)
      setLastEventId(0)
      setState(s)
      resetTurnPanels()
      setElectionResult(null)
      setGameOverVisible(false)
      await loadPolicies(gid)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start new game')
    } finally {
      setBusy(false)
      setSelectedPolicyId(null)
    }
  }

  const onContinueAfterElection = () => {
    setElectionResult(null)
    if (state && state.turn_number >= state.total_turns) {
      setGameOverVisible(true)
    }
  }

  if (loading) return <div className="page">Loading City of Agents...</div>
  if (!state) return <div className="page">No state available.</div>

  const nextTurn = state.turn_number + 1
  const policyPrompt =
    state.turn_number >= state.total_turns
      ? 'The simulation has ended.'
      : busy
        ? 'Simulating turn — watch agents respond in real time…'
        : `Turn ${nextTurn} — Choose your action as Mayor:`

  return (
    <div id="app">
      <HeaderBar state={state} onNewGame={onNewGame} busy={busy} />

      <TurnResultBanner
        visible={turnResultVisible}
        mayorAction={turnMayorAction}
        oppositionAction={turnOppAction}
        triggeredEvents={turnTriggeredEvents}
      />

      <ErrorBanner message={error} />

      <div className="layout">
        <SidebarPanels state={state} />

        <main>
          <CityStatsPanel stats={state.city_stats} changes={statChanges} />
          <IdentityGroupsPanel state={state} />
          <CrisesPanel state={state} eventChances={eventChances} />
          <StreamFeedPanel items={stream} visible={busy || stream.length > 0} />
          <DebatesPanel debates={debates} visible={debates.length > 0} />
          <PoliciesPanel
            policies={policies}
            busy={busy || state.turn_number >= state.total_turns}
            loading={policiesLoading}
            selectedPolicyId={selectedPolicyId}
            prompt={policyPrompt}
            onSelect={onPolicy}
          />
          <TurnLogPanel policyHistory={state.policy_history} eventHistory={state.event_history} />
        </main>
      </div>

      <ElectionOverlay result={electionResult} onContinue={onContinueAfterElection} />
      <GameOverOverlay state={state} visible={gameOverVisible} onPlayAgain={onNewGame} />
    </div>
  )
}
