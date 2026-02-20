import { useEffect, useState } from 'react'
import {
  createGame,
  fetchCounterFrames,
  fetchMediaTimeline,
  fetchPolicies,
  fetchSetupOptions,
  generateCityProfile,
  streamTurn,
} from './api'
import type {
  CounterFrameOption,
  DebateResult,
  DynamicPolicy,
  ElectionResult,
  GameSetupConfig,
  MediaTimelineCard,
  SetupOptions,
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
import TurnArchivePanel from './components/TurnArchivePanel'
import ElectionOverlay from './components/ElectionOverlay'
import GameOverOverlay from './components/GameOverOverlay'
import GameSetupOverlay from './components/GameSetupOverlay'
import MediaNarrativePanel from './components/MediaNarrativePanel'
import AdvisorConsole from './components/AdvisorConsole'
import PolicyImpactModal from './components/PolicyImpactModal'

const DEFAULT_TOTAL_TURNS = 50

function buildInitialSetup(options: SetupOptions): GameSetupConfig {
  return {
    turns: DEFAULT_TOTAL_TURNS,
    turns_to_election: options.defaults.turns_to_election,
    city_id: options.defaults.city_id,
    population_scale: options.defaults.population_scale,
    agent_count: options.defaults.agent_count,
    llm_panel_size: options.defaults.llm_panel_size,
    llm_sampling_strategy: options.defaults.llm_sampling_strategy,
    llm_micro_batch_size: options.defaults.llm_micro_batch_size,
    max_parallel_llm_requests: options.defaults.max_parallel_llm_requests,
    randomness_scale: options.defaults.randomness_scale,
  }
}

export default function App() {
  const [gameId, setGameId] = useState<string | null>(null)
  const [lastEventId, setLastEventId] = useState(0)
  const [state, setState] = useState<StateSnapshot | null>(null)
  const [policies, setPolicies] = useState<DynamicPolicy[]>([])
  const [advisorSessionId, setAdvisorSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [stream, setStream] = useState<StreamCardItem[]>([])
  const [mediaTimeline, setMediaTimeline] = useState<MediaTimelineCard[]>([])
  const [debates, setDebates] = useState<DebateResult[]>([])
  const [statChanges, setStatChanges] = useState<Record<string, number>>({})
  const [eventChances, setEventChances] = useState<Record<string, number>>({})
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [selectedCounterFrameId, setSelectedCounterFrameId] = useState<string | null>(null)
  const [counterFrames, setCounterFrames] = useState<CounterFrameOption[]>([])
  const [counterFramesLoading, setCounterFramesLoading] = useState(false)
  const [turnResultVisible, setTurnResultVisible] = useState(false)
  const [turnMayorAction, setTurnMayorAction] = useState<DynamicPolicy | null>(null)
  const [turnOppAction, setTurnOppAction] = useState<DynamicPolicy | null>(null)
  const [turnTriggeredEvents, setTurnTriggeredEvents] = useState<string[]>([])
  const [electionResult, setElectionResult] = useState<ElectionResult | null>(null)
  const [gameOverVisible, setGameOverVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [profileRefreshCityId, setProfileRefreshCityId] = useState<string | null>(null)
  const [setupVisible, setSetupVisible] = useState(true)
  const [setupOptions, setSetupOptions] = useState<SetupOptions | null>(null)
  const [setupConfig, setSetupConfig] = useState<GameSetupConfig | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [advisorFocusOptionId, setAdvisorFocusOptionId] = useState<string | null>(null)
  const [impactPolicy, setImpactPolicy] = useState<DynamicPolicy | null>(null)

  const loadPolicies = async (gid: string) => {
    setPoliciesLoading(true)
    try {
      const result = await fetchPolicies(gid)
      setPolicies(result.policies)
      setAdvisorSessionId(result.advisorSessionId)
    } finally {
      setPoliciesLoading(false)
    }
  }

  const loadMedia = async (gid: string) => {
    const cards = await fetchMediaTimeline(gid, 0)
    setMediaTimeline(cards)
  }

  const loadCounterFrames = async (gid: string, policyId: string) => {
    setCounterFramesLoading(true)
    try {
      const frames = await fetchCounterFrames(gid, policyId)
      setCounterFrames(frames)
    } finally {
      setCounterFramesLoading(false)
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
    setAdvisorFocusOptionId(null)
    setSelectedCounterFrameId(null)
    setCounterFrames([])
    setImpactPolicy(null)
  }

  const bootstrapSetup = async () => {
    setLoading(true)
    setError(null)
    try {
      const options = await fetchSetupOptions()
      setSetupOptions(options)
      setSetupConfig((current) => current ?? buildInitialSetup(options))
      setSetupVisible(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load setup options')
    } finally {
      setLoading(false)
    }
  }

  const refreshCityProfile = async (cityId: string) => {
    setProfileRefreshCityId(cityId)
    setSetupError(null)
    setError(null)
    try {
      const result = await generateCityProfile(cityId, { force_refresh: true, research_mode: 'auto' })
      const options = await fetchSetupOptions()
      setSetupOptions(options)
      setSetupConfig((current) => {
        if (!current) return buildInitialSetup(options)
        return { ...current, city_id: cityId }
      })
      if (result.status === 'failed') {
        setSetupError(result.error ?? 'City profile generation failed')
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Failed to refresh city profile')
    } finally {
      setProfileRefreshCityId(null)
    }
  }

  const startGame = async (config: GameSetupConfig) => {
    setSetupBusy(true)
    setSetupError(null)
    setError(null)
    try {
      const { gameId: gid, state: snapshot } = await createGame(config)
      setGameId(gid)
      setLastEventId(0)
      setState(snapshot)
      setSetupConfig(config)
      setAdvisorSessionId(null)
      resetTurnPanels()
      setMediaTimeline([])
      setElectionResult(null)
      setGameOverVisible(false)
      setSetupVisible(false)
      setAdvisorFocusOptionId(null)
      setSelectedCounterFrameId(null)
      setCounterFrames([])
      await Promise.all([loadPolicies(gid), loadMedia(gid)])
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Failed to start simulation')
    } finally {
      setSetupBusy(false)
      setSelectedPolicyId(null)
    }
  }

  useEffect(() => {
    bootstrapSetup()
  }, [])

  const runTurnForPolicy = async (policyId: string, counterFrameId: string) => {
    if (busy || !gameId || !state) return
    setBusy(true)
    setError(null)
    setSelectedPolicyId(policyId)
    setSelectedCounterFrameId(counterFrameId)
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
          if (msg.type === 'mayor_action_submitted' || msg.type === 'mayor_action') {
            const action = msg.action
            mayorAction = action
            setTurnMayorAction(action)
            setStream((s) => [
              ...s,
              {
                kind: 'mayor',
                label: '🏛 Mayor Action Submitted',
                name: action.name,
                description: action.description,
                rationale:
                  msg.type === 'mayor_action_submitted'
                    ? msg.message ?? action.rationale
                    : action.rationale,
              },
            ])
          }
          if (msg.type === 'opposition_frame_primary' || msg.type === 'opposition_action') {
            const action = msg.action
            oppAction = action
            setTurnOppAction(action)
            setStream((s) => [
              ...s,
              {
                kind: 'opposition',
                label: '⚔ Opposition Primary Frame',
                name: action.name,
                description: action.description,
                rationale:
                  msg.type === 'opposition_frame_primary'
                    ? msg.message ?? action.rationale
                    : action.rationale,
              },
            ])
          }

          if (msg.type === 'mayor_counter_frame') {
            setStream((s) => [
              ...s,
              {
                kind: 'mayor',
                label: '🛡 Mayor Counter Frame',
                name: 'Narrative Counter',
                description: msg.message,
                meta: `Targets: ${(msg.target_groups ?? []).join(', ') || 'broad coalition'}`,
              },
            ])
          }

          if (msg.type === 'counter_frame_selected') {
            setStream((s) => [
              ...s,
              {
                kind: 'mayor',
                label: '🎯 Counter-Frame Selected',
                name: msg.counter_frame.label,
                description: msg.counter_frame.message,
                meta: `Campaign +${(msg.counter_frame.campaign_boost ?? 0).toFixed(2)}`,
              },
            ])
          }

          if (msg.type === 'opposition_frame_followup') {
            setStream((s) => [
              ...s,
              {
                kind: 'opposition',
                label: '🧨 Opposition Follow-up',
                name: 'Narrative Escalation',
                description: msg.message,
                meta: `Targets: ${(msg.target_groups ?? []).join(', ') || 'broad coalition'}`,
              },
            ])
          }

          if (msg.type === 'street_chatter_synthesized') {
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                label: '🗣 Street Chatter',
                name: (msg.summary ?? [])[0] ?? 'Citizen sentiment recalibrated',
                meta: `Fronts: ${(msg.dominant_fronts ?? []).join(', ') || 'none'}`,
              },
            ])
          }

          if (msg.type === 'simulation_stats_applied') {
            setStatChanges(msg.stat_deltas ?? {})
            setEventChances(msg.event_chances ?? {})
            setTurnTriggeredEvents(msg.triggered_events ?? [])
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                label: '📉 Simulation Stats Applied',
                name: `${Object.keys(msg.stat_deltas ?? {}).length} major stat deltas`,
                meta: `Events: ${(msg.triggered_events ?? []).join(', ') || 'none'}`,
              },
            ])
          }

          if (msg.type === 'popularity_recalculated') {
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                label: '📊 Popularity Recalculated',
                name: `Mayor ${msg.mayor_popularity.toFixed(1)}% · Opp ${msg.opposition_popularity.toFixed(1)}%`,
                meta: `In Power: ${msg.governing_party}`,
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

          if (msg.type === 'media_narrative_published') {
            const cards = (msg.cards ?? []).map((card) => ({ ...card, turn: msg.turn }))
            setMediaTimeline((current) => [...cards, ...current].slice(0, 150))
            if (msg.cards.length > 0) {
              setStream((s) => [
                ...s,
                {
                  kind: 'media',
                  label: '🗞 Media Narrative',
                  name: msg.cards[0].headline,
                  meta: `${msg.cards.length} media card${msg.cards.length === 1 ? '' : 's'}`,
                },
              ])
            }
          }

          if (msg.type === 'debate') {
            setDebates((d) => [...d, msg.debate])
          }

          if (msg.type === 'agent_impact_assessed') {
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                label: '🧠 Agent Impact Assessed',
                name: `${msg.summary.agent_count_evaluated} agents re-evaluated`,
                description:
                  `ΔH ${msg.summary.avg_happiness_delta >= 0 ? '+' : ''}${msg.summary.avg_happiness_delta.toFixed(2)} | ` +
                  `ΔR ${msg.summary.avg_radicalization_delta >= 0 ? '+' : ''}${msg.summary.avg_radicalization_delta.toFixed(2)} | ` +
                  `ΔA ${msg.summary.avg_alignment_delta >= 0 ? '+' : ''}${msg.summary.avg_alignment_delta.toFixed(2)}`,
                meta:
                  `Panel ${msg.summary.llm_panel_count} (${(msg.summary.llm_panel_coverage_ratio * 100).toFixed(1)}%)` +
                  ` · Fronts: ${(msg.summary.dominant_fronts ?? []).join(', ') || 'none'}`,
              },
            ])
          }

          if (msg.type === 'cohort_shift_aggregated') {
            const top = msg.cohorts
              .slice(0, 3)
              .map(
                (cohort) =>
                  `${cohort.role}/${cohort.group_id} ${cohort.narrative_shift_delta >= 0 ? '+' : ''}${cohort.narrative_shift_delta.toFixed(2)}`,
              )
              .join(' · ')
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                label: '📊 Cohort Narrative Shift',
                name: 'Top cohort movement',
                meta: top || 'No significant shift',
              },
            ])
          }

          if (msg.type === 'turn_closed') {
            setTurnResultVisible(true)
            setState(msg.state)
            setStream((s) => [
              ...s,
              {
                kind: 'event',
                label: '🏁 Turn Closed',
                name: `In Power: ${msg.state.governing_party}`,
                meta: `Mayor ${msg.state.mayor_popularity.toFixed(1)}% · Opp ${msg.state.opposition_popularity.toFixed(1)}%`,
              },
            ])
            setElectionResult(msg.election_result)
            setGameOverVisible(Boolean(msg.game_over && !msg.election_result))
            if (!msg.game_over || msg.election_result) {
              loadPolicies(gameId).catch(() => undefined)
              loadMedia(gameId).catch(() => undefined)
            } else {
              setPolicies([])
              setPoliciesLoading(false)
            }
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
          }
        },
        {
          expectedTurn: state.turn_number + 1,
          advisorSessionId: advisorSessionId ?? undefined,
          counterFrameId,
        },
      )
      setLastEventId((prev) => Math.max(prev, nextEventId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stream connection error')
    } finally {
      setBusy(false)
      setSelectedPolicyId(null)
      setSelectedCounterFrameId(null)
      setCounterFrames([])
    }
  }

  const onPolicySelect = async (policyId: string) => {
    if (busy || !state || state.turn_number >= state.total_turns) return
    if (!gameId) return
    setSelectedPolicyId(policyId)
    setSelectedCounterFrameId(null)
    setCounterFrames([])
    setAdvisorFocusOptionId(policyId)
    setError(null)
    try {
      await loadCounterFrames(gameId, policyId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load counter-frame options')
    }
  }

  const onPlaySelectedPolicy = async () => {
    if (!selectedPolicyId) {
      setError('Select a policy first, then click "Play Selected Policy".')
      return
    }
    if (!selectedCounterFrameId) {
      setError('Select a counter-frame before playing the turn.')
      return
    }
    if (!policies.some((policy) => policy.id === selectedPolicyId)) {
      setSelectedPolicyId(null)
      setError('Selected policy is no longer current. Refresh options and reselect.')
      return
    }
    if (!counterFrames.some((frame) => frame.id === selectedCounterFrameId)) {
      setSelectedCounterFrameId(null)
      setError('Selected counter-frame is no longer current. Re-select counter-frame.')
      return
    }
    await runTurnForPolicy(selectedPolicyId, selectedCounterFrameId)
  }

  const onNewGame = async () => {
    if (busy || setupBusy) return
    setSetupError(null)
    setSetupVisible(true)
  }

  const onContinueAfterElection = () => {
    setElectionResult(null)
    if (state && state.turn_number >= state.total_turns) {
      setGameOverVisible(true)
    }
  }

  useEffect(() => {
    if (!selectedPolicyId) return
    if (!policies.some((policy) => policy.id === selectedPolicyId)) {
      setSelectedPolicyId(null)
      setSelectedCounterFrameId(null)
      setCounterFrames([])
    }
  }, [policies, selectedPolicyId])

  useEffect(() => {
    if (!selectedCounterFrameId) return
    if (!counterFrames.some((frame) => frame.id === selectedCounterFrameId)) {
      setSelectedCounterFrameId(null)
    }
  }, [counterFrames, selectedCounterFrameId])

  if (loading) return <div className="page">Loading setup…</div>

  if (!setupOptions || !setupConfig) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
        <div className="muted">Unable to load setup options.</div>
      </div>
    )
  }

  const gameReady = Boolean(state)

  const nextTurn = state ? state.turn_number + 1 : 1
  const policyPrompt =
    !state
      ? 'Start a simulation from game setup.'
      : state.turn_number >= state.total_turns
      ? 'The simulation has ended.'
      : busy
        ? 'Simulating turn — watch agents respond in real time…'
        : `Turn ${nextTurn} — Select an option, deliberate with advisors, then play it.`

  return (
    <div id="app">
      {state ? (
        <HeaderBar state={state} onNewGame={onNewGame} busy={busy || setupBusy} />
      ) : (
        <header className="header">
          <h1>City of Agents</h1>
          <div className="header-meta">
            <span>Configure setup and start a new simulation.</span>
            <button className="btn-new-game" onClick={onNewGame} disabled={setupBusy}>
              New Game
            </button>
          </div>
        </header>
      )}

      {state && (
        <TurnResultBanner
          visible={turnResultVisible}
          mayorAction={turnMayorAction}
          oppositionAction={turnOppAction}
          triggeredEvents={turnTriggeredEvents}
        />
      )}

      <ErrorBanner message={error} />

      {gameReady && state ? (
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
              selectedCounterFrameId={selectedCounterFrameId}
              counterFrames={counterFrames}
              counterFramesLoading={counterFramesLoading}
              prompt={policyPrompt}
              onSelect={onPolicySelect}
              onSelectCounterFrame={(counterFrameId) => {
                setSelectedCounterFrameId(counterFrameId)
                setError(null)
              }}
              onPlaySelected={onPlaySelectedPolicy}
              onAskAdvisor={(optionId) => {
                setAdvisorFocusOptionId(optionId)
                const target = document.getElementById('advisor-console')
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              }}
              onReviseOption={(optionId) => {
                setAdvisorFocusOptionId(optionId)
                const target = document.getElementById('advisor-console')
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              }}
              onImpactAssessment={(optionId) => {
                const selected = policies.find((policy) => policy.id === optionId) ?? null
                setImpactPolicy(selected)
              }}
            />
            <AdvisorConsole
              gameId={gameId}
              advisorSessionId={advisorSessionId}
              turnNumber={state.turn_number}
              policies={policies}
              disabled={busy || state.turn_number >= state.total_turns}
              focusOptionId={advisorFocusOptionId}
              onPoliciesUpdate={(nextPolicies) => {
                setPolicies(nextPolicies)
                if (advisorFocusOptionId && !nextPolicies.some((policy) => policy.id === advisorFocusOptionId)) {
                  setAdvisorFocusOptionId(null)
                }
              }}
              onSessionUpdate={(nextSessionId) => {
                setAdvisorSessionId(nextSessionId)
              }}
              onError={(message) => setError(message)}
            />
            <TurnArchivePanel gameId={gameId} refreshKey={state.turn_number} />
          </main>
          <MediaNarrativePanel cards={mediaTimeline} />
        </div>
      ) : (
        <section className="panel">
          <div className="panel-title">Simulation</div>
          <div className="muted">Use the game setup window to launch a new city simulation.</div>
        </section>
      )}

      {state && <ElectionOverlay result={electionResult} onContinue={onContinueAfterElection} />}
      {state && <GameOverOverlay state={state} visible={gameOverVisible} onPlayAgain={onNewGame} />}
      <PolicyImpactModal
        visible={Boolean(impactPolicy)}
        policy={impactPolicy}
        onClose={() => setImpactPolicy(null)}
      />
      <GameSetupOverlay
        visible={setupVisible}
        options={setupOptions}
        initialConfig={setupConfig}
        busy={setupBusy}
        profileRefreshCityId={profileRefreshCityId}
        error={setupError}
        canCancel={Boolean(state)}
        onCancel={() => setSetupVisible(false)}
        onStart={startGame}
        onRefreshCityProfile={refreshCityProfile}
      />
    </div>
  )
}
