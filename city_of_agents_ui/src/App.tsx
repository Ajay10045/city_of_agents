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
  DeliveryReport,
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
import StreamFeedPanel, { type StreamCardItem } from './components/StreamFeedPanel'
import TurnResultBanner from './components/TurnResultBanner'
import ElectionOverlay from './components/ElectionOverlay'
import GameOverOverlay from './components/GameOverOverlay'
import GameSetupOverlay from './components/GameSetupOverlay'
import UnifiedMediaPanel from './components/UnifiedMediaPanel'
import AdvisoryChamberPanel from './components/AdvisoryChamberPanel'
import CityChatterPanel from './components/CityChatterPanel'
import TopMetricsPanel from './components/TopMetricsPanel'
import GeneratedPoliciesPanel from './components/GeneratedPoliciesPanel'

const DEFAULT_TOTAL_TURNS = 50

function buildInitialSetup(options: SetupOptions): GameSetupConfig {
  return {
    turns: options.defaults.turns ?? DEFAULT_TOTAL_TURNS,
    city_id: options.defaults.city_id,
    agent_count: options.defaults.agent_count,
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
  const [stream, setStream] = useState<StreamCardItem[]>([])
  const [mediaTimeline, setMediaTimeline] = useState<MediaTimelineCard[]>([])
  const [debates, setDebates] = useState<DebateResult[]>([])
  const [streetChatter, setStreetChatter] = useState<StreetChatterItem[]>([])
  const [statChanges, setStatChanges] = useState<Record<string, number>>({})
  const [eventChances, setEventChances] = useState<Record<string, number>>({})
  const [turnResultVisible, setTurnResultVisible] = useState(false)
  const [turnMayorAction, setTurnMayorAction] = useState<DynamicPolicy | null>(null)
  const [turnOppAction, setTurnOppAction] = useState<DynamicPolicy | null>(null)
  const [turnTriggeredEvents, setTurnTriggeredEvents] = useState<string[]>([])
  const [electionResult, setElectionResult] = useState<ElectionResult | null>(null)
  const [gameOverVisible, setGameOverVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [implementingPolicyId, setImplementingPolicyId] = useState<string | null>(null)
  const [councilBusy, setCouncilBusy] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [profileRefreshCityId, setProfileRefreshCityId] = useState<string | null>(null)
  const [setupVisible, setSetupVisible] = useState(true)
  const [setupOptions, setSetupOptions] = useState<SetupOptions | null>(null)
  const [setupConfig, setSetupConfig] = useState<GameSetupConfig | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastDeliveryReport, setLastDeliveryReport] = useState<DeliveryReport | null>(null)
  const [lastImplementedPolicyName, setLastImplementedPolicyName] = useState<string | null>(null)

  const formatTopStatDeltas = (deltas: Record<string, number>, limit = 3): string => {
    const rows = Object.entries(deltas)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, limit)
      .map(([key, value]) => `${key} ${value >= 0 ? '+' : ''}${value.toFixed(1)}`)
    return rows.join(' · ')
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
    setLastDeliveryReport(null)
    setLastImplementedPolicyName(null)
  }

  const prepareTurnPanels = () => {
    setStatChanges({})
    setEventChances({})
    setTurnResultVisible(false)
    setTurnMayorAction(null)
    setTurnOppAction(null)
    setTurnTriggeredEvents([])
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
      void loadMedia(gid).catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load media timeline'),
      )
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Failed to start simulation')
    } finally {
      setSetupBusy(false)
    }
  }

  useEffect(() => {
    bootstrapSetup()
  }, [])

  const runTurnForPolicy = async (policyId: string) => {
    if (busy || !gameId || !state) return
    setBusy(true)
    setImplementingPolicyId(policyId)
    setError(null)
    let activePolicyId = policyId
    let activeAdvisorSessionId = advisorSessionId

    try {
      const latest = await fetchPolicies(gameId)
      setPolicies(latest.policies)
      setAdvisorSessionId(latest.advisorSessionId)
      activeAdvisorSessionId = latest.advisorSessionId
      if (!latest.policies.some((option) => option.id === activePolicyId)) {
        throw new Error('Generated policy set changed. Generate a fresh set before implementing.')
      }
    } catch (syncErr) {
      setBusy(false)
      setError(syncErr instanceof Error ? syncErr.message : 'Failed to sync latest options before play.')
      return
    }

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
            setLastImplementedPolicyName(action.name)
            setLastDeliveryReport(null)
            setStream((s) => [
              ...s,
              {
                kind: 'mayor',
                turn: messageTurn,
                phase: 'Policy Proposed',
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
                phase: 'Opposition Response',
                label: `⚔ Opposition: ${action.name}`,
                name: action.description || action.name,
                rationale:
                  msg.type === 'opposition_frame_primary'
                    ? msg.message ?? action.rationale
                    : action.rationale,
              },
            ])
          }

          if (msg.type === 'agent_impact_assessed') {
            const s = msg.summary
            setStream((prev) => [
              ...prev,
              {
                kind: 'impact',
                turn: messageTurn,
                phase: 'Initial Public Reception',
                label: '👥 Agent Impact Assessed',
                name: `${s.agent_count_evaluated} agents evaluated · avg happiness ${s.avg_happiness_delta >= 0 ? '+' : ''}${s.avg_happiness_delta.toFixed(2)}`,
                why: `LLM panels: ${s.llm_panel_count} (${(s.llm_panel_coverage_ratio * 100).toFixed(0)}% coverage)`,
                meta: `Dominant fronts: ${(s.dominant_fronts ?? []).join(', ') || 'none'}`,
              },
            ])
          }

          if (msg.type === 'implementation_gap_assessed') {
            const dr = msg.delivery_report
            setLastDeliveryReport(dr)
            const targets = (dr.targets ?? []).slice(0, 3).map((t) => ({
              label: t.label,
              unit: t.unit,
              proposed: t.proposed,
              delivered: t.delivered,
              completionRatio: t.completion_ratio,
            }))
            setStream((prev) => [
              ...prev,
              {
                kind: 'impact',
                turn: messageTurn,
                phase: 'Execution Check',
                label: '🔍 Execution: Promised vs Implemented',
                name: `Completion ${((dr.execution_score ?? 0) * 100).toFixed(1)}% · Gap ${((dr.implementation_gap ?? 0) * 100).toFixed(1)}%`,
                why: dr.summary || undefined,
                delivery: {
                  completionPct: (dr.execution_score ?? 0) * 100,
                  implementationGapPct: (dr.implementation_gap ?? 0) * 100,
                  budgetRequired: dr.budget_required ?? 0,
                  budgetSpent: dr.budget_spent ?? 0,
                  summary: dr.summary || undefined,
                  targets,
                },
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
            const perceptionItems = (chatterItems.length > 0 ? chatterItems : []).slice(0, 3)
            if (perceptionItems.length > 0) {
              setStream((s) => [
                ...s,
                {
                  kind: 'media',
                  turn: messageTurn,
                  phase: 'Post-Implementation Perception',
                  label: '💬 Street Perception',
                  name: `${perceptionItems.length} citizen reactions · Fronts: ${(msg.dominant_fronts ?? []).join(', ') || 'none'}`,
                  perception: perceptionItems.map((c) => ({
                    speaker: c.speaker ?? 'Citizen',
                    sentiment: String(c.sentiment ?? 'mixed'),
                    line: c.line ?? '',
                  })),
                },
              ])
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
                phase: 'City Stats Changed',
                label: '📉 Simulation Stats Applied',
                name: topDeltas || `${Object.keys(msg.stat_deltas ?? {}).length} major stat deltas`,
                statDeltas: msg.stat_deltas ?? {},
                why: topDeltas ? `Top movers: ${topDeltas}` : undefined,
                meta:
                  `Events: ${(msg.triggered_events ?? []).join(', ') || 'none'}` +
                  ` · Escalations: ${(msg.escalated_events ?? []).join(', ') || 'none'}`,
              },
            ])
          }

          if (msg.type === 'cohort_shift_aggregated') {
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                turn: messageTurn,
                phase: 'Initial Public Reception',
                label: '👥 Cohort Shifts Aggregated',
                name: `${msg.cohorts.length} cohort impact rows`,
                cohortShifts: msg.cohorts,
              },
            ])
          }

          if (msg.type === 'popularity_recalculated') {
            setStream((s) => [
              ...s,
              {
                kind: 'impact',
                turn: messageTurn,
                phase: 'City Stats Changed',
                label: '📊 Popularity Recalculated',
                name: `Mayor ${msg.mayor_popularity.toFixed(1)}% · Opp ${msg.opposition_popularity.toFixed(1)}%`,
                popularity: {
                  mayor: msg.mayor_popularity,
                  opposition: msg.opposition_popularity,
                },
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
                  phase: 'Crisis Event',
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
                  phase: 'Media Narrative',
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
            const deliverySummary = msg.delivery_report?.summary ?? msg.turn_summary.delivery_summary
            setStream((s) => [
              ...s,
              {
                kind: 'event',
                turn: messageTurn,
                phase: 'Turn Finalized',
                label: '🏁 Turn Closed',
                name: `Mayor: ${msg.turn_summary.mayor_action} · Opp: ${msg.turn_summary.opposition_action}`,
                statDeltas: msg.stat_deltas ?? {},
                why: deliverySummary || undefined,
                turnSummary: {
                  mayorAction: msg.turn_summary.mayor_action,
                  oppositionAction: msg.turn_summary.opposition_action,
                  dominantFronts: msg.turn_summary.dominant_fronts ?? [],
                  keyEvents: msg.key_events ?? [],
                },
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
              setPolicies([])
              setAdvisorSessionId(null)
              loadMedia(gameId).catch(() => undefined)
            } else {
              setPolicies([])
              setAdvisorSessionId(null)
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
          } else {
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
      setImplementingPolicyId(null)
    }
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
            <IdentityGroupsPanel state={state} debates={debates} compact />
            <UnifiedMediaPanel state={state} cards={mediaTimeline} />
            <CityChatterPanel items={streetChatter} />
          </aside>

          <main className="layout-center">
            <TopMetricsPanel state={state} />
            <CityStatsPanel stats={state.city_stats} changes={statChanges} />
            <GeneratedPoliciesPanel
              policies={policies}
              disabled={busy || gameCompleted}
              implementingPolicyId={implementingPolicyId}
              onImplementPolicy={(policyId) => {
                if (state && hasMayorLostElection(state)) {
                  setError('Simulation is over because the Mayor lost the election.')
                  return
                }
                if (!policies.some((policy) => policy.id === policyId)) {
                  setError('Policy is no longer current. Generate a fresh policy set.')
                  return
                }
                void runTurnForPolicy(policyId)
              }}
              deliveryReport={lastDeliveryReport}
              implementedPolicyName={lastImplementedPolicyName}
            />
            <StreamFeedPanel
              items={stream}
              visible={busy || stream.length > 0}
            />
          </main>
          <aside className="layout-right">
            <AdvisoryChamberPanel
              gameId={gameId}
              advisorSessionId={advisorSessionId}
              turnNumber={state.turn_number}
              disabled={busy || gameCompleted}
              onCouncilBusyChange={setCouncilBusy}
              onPoliciesGenerated={(nextPolicies) => {
                setPolicies(nextPolicies.slice(0, 3))
              }}
              onSessionUpdate={(nextSessionId) => setAdvisorSessionId(nextSessionId)}
              onError={(message) => setError(message)}
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
