import { useEffect, useState } from 'react'
import {
  createGame,
  fetchMediaTimeline,
  fetchPolicies,
  fetchSetupOptions,
  generateCityProfile,
  streamTurn,
} from './api'
import type {
  DebateResult,
  DynamicPolicy,
  ElectionResult,
  GameSetupConfig,
  MediaTimelineCard,
  SetupOptions,
  StateSnapshot,
  StreetChatterItem,
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
import ElectionOverlay from './components/ElectionOverlay'
import GameOverOverlay from './components/GameOverOverlay'
import GameSetupOverlay from './components/GameSetupOverlay'
import MediaNarrativePanel from './components/MediaNarrativePanel'
import AdvisorConsole from './components/AdvisorConsole'
import PolicyImpactModal from './components/PolicyImpactModal'
import TopMetricsPanel from './components/TopMetricsPanel'

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

function hasMayorLostElection(snapshot: StateSnapshot | null): boolean {
  if (!snapshot || snapshot.election_results.length === 0) return false
  const latest = snapshot.election_results[snapshot.election_results.length - 1] as Record<string, unknown>
  const mayorRaw = latest['mayor_vote_share']
  const oppositionRaw = latest['opposition_vote_share']
  const mayor =
    typeof mayorRaw === 'number' ? mayorRaw : Number(typeof mayorRaw === 'string' ? mayorRaw : NaN)
  const opposition =
    typeof oppositionRaw === 'number'
      ? oppositionRaw
      : Number(typeof oppositionRaw === 'string' ? oppositionRaw : NaN)
  return Number.isFinite(mayor) && Number.isFinite(opposition) && mayor < opposition
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
  const [streetChatter, setStreetChatter] = useState<StreetChatterItem[]>([])
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
  const [councilBusy, setCouncilBusy] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [profileRefreshCityId, setProfileRefreshCityId] = useState<string | null>(null)
  const [setupVisible, setSetupVisible] = useState(true)
  const [setupOptions, setSetupOptions] = useState<SetupOptions | null>(null)
  const [setupConfig, setSetupConfig] = useState<GameSetupConfig | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [advisorFocusOptionId, setAdvisorFocusOptionId] = useState<string | null>(null)
  const [impactPolicy, setImpactPolicy] = useState<DynamicPolicy | null>(null)

  const formatTopStatDeltas = (deltas: Record<string, number>, limit = 3): string => {
    const rows = Object.entries(deltas)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, limit)
      .map(([key, value]) => `${key} ${value >= 0 ? '+' : ''}${value.toFixed(1)}`)
    return rows.join(' · ')
  }

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

  const resetSimulationPanels = () => {
    setDebates([])
    setStreetChatter([])
    setStream([])
    setMediaTimeline([])
    setPolicies([])
    setStatChanges({})
    setEventChances({})
    setTurnResultVisible(false)
    setTurnMayorAction(null)
    setTurnOppAction(null)
    setTurnTriggeredEvents([])
    setAdvisorFocusOptionId(null)
    setImpactPolicy(null)
  }

  const prepareTurnPanels = () => {
    setStatChanges({})
    setEventChances({})
    setTurnResultVisible(false)
    setTurnMayorAction(null)
    setTurnOppAction(null)
    setTurnTriggeredEvents([])
    setAdvisorFocusOptionId(null)
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
      resetSimulationPanels()
      setElectionResult(null)
      setGameOverVisible(false)
      setSetupVisible(false)
      setAdvisorFocusOptionId(null)
      void loadPolicies(gid).catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load policies'),
      )
      void loadMedia(gid).catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load media timeline'),
      )
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

  const runTurnForPolicy = async (policyId: string) => {
    if (busy || councilBusy || !gameId || !state) return
    setBusy(true)
    setError(null)
    let activePolicyId = policyId
    let activeAdvisorSessionId = advisorSessionId

    try {
      const latest = await fetchPolicies(gameId)
      setPolicies(latest.policies)
      setAdvisorSessionId(latest.advisorSessionId)
      activeAdvisorSessionId = latest.advisorSessionId
      if (!latest.policies.some((option) => option.id === activePolicyId)) {
        setSelectedPolicyId(null)
        throw new Error('Selected option was refreshed by advisor. Please reselect and play.')
      }
    } catch (syncErr) {
      setBusy(false)
      setError(syncErr instanceof Error ? syncErr.message : 'Failed to sync latest options before play.')
      return
    }

    setSelectedPolicyId(activePolicyId)
    prepareTurnPanels()

    let mayorAction: DynamicPolicy | null = null
    let oppAction: DynamicPolicy | null = null

    const selectedPolicyName =
      policies.find((policy) => policy.id === activePolicyId)?.name ?? null

    const streamOnce = async (policyToPlay: string, advisorId: string | null) =>
      await streamTurn(
        gameId,
        policyToPlay,
        lastEventId,
        (msg: StreamMessage, eventId: number) => {
          setLastEventId((prev) => Math.max(prev, eventId))
          const messageTurn = 'turn' in msg && typeof msg.turn === 'number' ? msg.turn : state.turn_number + 1
          if (msg.type === 'mayor_action_submitted' || (msg.type === 'mayor_action' && !mayorAction)) {
            const action = msg.action
            mayorAction = action
            setTurnMayorAction(action)
            setStream((s) => [
              ...s,
              {
                kind: 'mayor',
                turn: messageTurn,
                label: `🏛 Mayor: ${action.name}`,
                name: action.description || action.name,
                rationale:
                  msg.type === 'mayor_action_submitted'
                    ? msg.message ?? action.rationale
                    : action.rationale,
              },
            ])
          }
          if (
            msg.type === 'opposition_frame_primary' ||
            (msg.type === 'opposition_action' && !oppAction)
          ) {
            const action = msg.action
            oppAction = action
            setTurnOppAction(action)
            setStream((s) => [
              ...s,
              {
                kind: 'opposition',
                turn: messageTurn,
                label: `⚔ Opposition: ${action.name}`,
                name: action.description || action.name,
                rationale:
                  msg.type === 'opposition_frame_primary'
                    ? msg.message ?? action.rationale
                    : action.rationale,
              },
            ])
          }

          if (msg.type === 'street_chatter_synthesized') {
            const chatterItems = (msg.chatter_items ?? []).map((item) => ({
              ...item,
              turn: item.turn ?? messageTurn,
            }))
            if (chatterItems.length > 0) {
              setStreetChatter((current) => [...chatterItems, ...current].slice(0, 250))
            } else if ((msg.summary ?? []).length > 0) {
              const fallback = (msg.summary ?? []).slice(0, 3).map((line, idx) => ({
                turn: messageTurn,
                speaker: `Citizen ${idx + 1}`,
                role: 'Resident',
                group_name: 'Citywide',
                line,
                sentiment: 'mixed',
                heat: 0.5,
                tags: ['street', 'pulse'],
              }))
              setStreetChatter((current) => [...fallback, ...current].slice(0, 250))
            }
          }

          if (msg.type === 'simulation_stats_applied') {
            setStatChanges(msg.stat_deltas ?? {})
            setEventChances(msg.event_chances ?? {})
            setTurnTriggeredEvents(msg.triggered_events ?? [])
            const topDeltas = formatTopStatDeltas(msg.stat_deltas ?? {})
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                turn: messageTurn,
                label: '📉 Simulation Stats Applied',
                name: topDeltas || `${Object.keys(msg.stat_deltas ?? {}).length} major stat deltas`,
                meta:
                  `Events: ${(msg.triggered_events ?? []).join(', ') || 'none'}` +
                  ` · Escalations: ${(msg.escalated_events ?? []).join(', ') || 'none'}`,
              },
            ])
          }

          if (msg.type === 'popularity_recalculated') {
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                turn: messageTurn,
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
                  turn: messageTurn,
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
                  turn: messageTurn,
                  label: '🗞 Media Narrative',
                  name: msg.cards[0].headline,
                  meta: `${msg.cards.length} media card${msg.cards.length === 1 ? '' : 's'}`,
                },
              ])
            }
          }

          if (msg.type === 'debate') {
            setDebates((d) => [...d, { ...msg.debate, turn: messageTurn }])
          }

          if (msg.type === 'turn_closed') {
            setTurnResultVisible(true)
            setState(msg.state)
            setStream((s) => [
              ...s,
              {
                kind: 'event',
                turn: messageTurn,
                label: '🏁 Turn Closed',
                name: `Mayor: ${msg.turn_summary.mayor_action} · Opp: ${msg.turn_summary.opposition_action}`,
                description:
                  `Fronts: ${(msg.turn_summary.dominant_fronts ?? []).join(', ') || 'none'}` +
                  ` · Events: ${(msg.key_events ?? []).join(', ') || 'none'}`,
                meta:
                  `In Power: ${msg.state.governing_party}` +
                  ` · Mayor ${msg.state.mayor_popularity.toFixed(1)}% · Opp ${msg.state.opposition_popularity.toFixed(1)}%`,
              },
            ])
            setElectionResult(msg.election_result)
            setGameOverVisible(Boolean(msg.game_over && !msg.election_result))
            if (!msg.game_over) {
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
          advisorSessionId: advisorId ?? undefined,
        },
      )

    try {
      let nextEventId: number
      try {
        nextEventId = await streamOnce(activePolicyId, activeAdvisorSessionId)
      } catch (rawErr) {
        const err = rawErr as Error & {
          code?: number
          details?: Record<string, unknown>
        }
        const errorText = String(err.message || '')
        const needsResync =
          err.code === 409 &&
          (errorText.includes('advisor session mismatch') ||
            errorText.includes('policy_id is not in the current option set'))
        if (!needsResync) {
          throw err
        }

        const refreshed = await fetchPolicies(gameId)
        setPolicies(refreshed.policies)
        setAdvisorSessionId(refreshed.advisorSessionId)
        activeAdvisorSessionId = refreshed.advisorSessionId

        let retryPolicyId = activePolicyId
        if (!refreshed.policies.some((policy) => policy.id === retryPolicyId)) {
          const byName =
            selectedPolicyName != null
              ? refreshed.policies.find((policy) => policy.name === selectedPolicyName)
              : null
          if (byName) {
            retryPolicyId = byName.id
            setSelectedPolicyId(byName.id)
          } else {
            setSelectedPolicyId(null)
            throw new Error('Options changed after advisor update. Please select one of the latest options.')
          }
        }
        nextEventId = await streamOnce(retryPolicyId, activeAdvisorSessionId)
      }
      setLastEventId((prev) => Math.max(prev, nextEventId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stream connection error')
    } finally {
      setBusy(false)
      setSelectedPolicyId(null)
    }
  }

  const onPolicySelect = (policyId: string) => {
    if (
      busy ||
      councilBusy ||
      !state ||
      state.turn_number >= state.total_turns ||
      hasMayorLostElection(state)
    ) {
      return
    }
    setSelectedPolicyId(policyId)
    setAdvisorFocusOptionId(policyId)
    setError(null)
  }

  const onPlaySelectedPolicy = async () => {
    if (councilBusy) {
      setError('Council is still deliberating. Wait for advisor response before playing a policy.')
      return
    }
    if (state && hasMayorLostElection(state)) {
      setError('Simulation is over because the Mayor lost the election.')
      return
    }
    if (!selectedPolicyId) {
      setError('Select a policy first, then click "Play Selected Policy".')
      return
    }
    if (!policies.some((policy) => policy.id === selectedPolicyId)) {
      setSelectedPolicyId(null)
      setError('Selected policy is no longer current. Refresh options and reselect.')
      return
    }
    await runTurnForPolicy(selectedPolicyId)
  }

  const onNewGame = async () => {
    if (busy || setupBusy) return
    setSetupError(null)
    setSetupVisible(true)
  }

  const onContinueAfterElection = () => {
    const mayorLostElection =
      electionResult != null &&
      electionResult.mayor_vote_share < electionResult.opposition_vote_share
    setElectionResult(null)
    if (state && (state.turn_number >= state.total_turns || mayorLostElection)) {
      setGameOverVisible(true)
    }
  }

  useEffect(() => {
    if (!selectedPolicyId) return
    if (!policies.some((policy) => policy.id === selectedPolicyId)) {
      setSelectedPolicyId(null)
    }
  }, [policies, selectedPolicyId])

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
  const gameCompleted = Boolean(
    state && (state.turn_number >= state.total_turns || hasMayorLostElection(state)),
  )

  const nextTurn = state ? state.turn_number + 1 : 1
  const policyPrompt =
    !state
      ? 'Start a simulation from game setup.'
      : gameCompleted
      ? 'The simulation has ended.'
      : busy
        ? 'Simulating turn — watch agents respond in real time…'
        : `Turn ${nextTurn} — Select an option, deliberate with advisors, then play it.`

  return (
    <div id="app">
      {state ? (
        <HeaderBar state={state} onNewGame={onNewGame} busy={busy || councilBusy || setupBusy} />
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
        <div className="layout layout-v2">
          <aside className="layout-left">
            <IdentityGroupsPanel state={state} compact />
            <SidebarPanels state={state} panels={['media']} />
            <MediaNarrativePanel cards={mediaTimeline} />
          </aside>

          <main className="layout-center">
            <TopMetricsPanel state={state} />
            <CityStatsPanel stats={state.city_stats} changes={statChanges} />
            <PoliciesPanel
              policies={policies}
              busy={busy || councilBusy || gameCompleted}
              loading={policiesLoading}
              selectedPolicyId={selectedPolicyId}
              prompt={policyPrompt}
              onSelect={onPolicySelect}
              onPlaySelected={onPlaySelectedPolicy}
              onAskAdvisor={(optionId) => {
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
              disabled={busy || gameCompleted}
              onCouncilBusyChange={setCouncilBusy}
              focusOptionId={advisorFocusOptionId}
              onPoliciesUpdate={(nextPolicies) => {
                setPolicies(nextPolicies)
                setSelectedPolicyId((prev) =>
                  prev && nextPolicies.some((policy) => policy.id === prev) ? prev : null,
                )
                if (advisorFocusOptionId && !nextPolicies.some((policy) => policy.id === advisorFocusOptionId)) {
                  setAdvisorFocusOptionId(null)
                }
              }}
              onSessionUpdate={(nextSessionId) => {
                setAdvisorSessionId(nextSessionId)
              }}
              onError={(message) => setError(message)}
            />
            <StreamFeedPanel items={stream} visible={busy || stream.length > 0} />
          </main>
          <aside className="layout-right">
            <DebatesPanel
              debates={debates}
              streetChatter={streetChatter}
              visible={debates.length > 0 || streetChatter.length > 0}
            />
            <CrisesPanel state={state} eventChances={eventChances} />
          </aside>
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
