import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronRight, ChevronDown, HelpCircle, Settings, Clock,
  Zap, Send, AlertTriangle, TrendingDown, Droplets,
  MapPin, Info,
  Newspaper, MessageCircle, TrendingUp, Loader2,
  Volume2, VolumeX
} from 'lucide-react'
import {
  openConsultation, messageMinister, closeConsultation,
  getPolicies, amendPolicy, executeTurnStreamV2, streamTurnBriefing,
  applyAccountability, resolveDilemmaStream, resolveEventResponseStream,
} from '../api'
import { parseReasoning, renderReasoningInline } from '../utils/reasoningFormat'
import type {
  GameState, TurnResult, Policy, Minister, ActiveEvent,
  MediaHeadline, CitizenVoice, WardReportEntry,
  GovernanceScorecard, TurnStreamV2Event,
  MinorActionInput, CounterFrameStrategy, TurnChoiceSnapshot,
  TurnForecast, EventResponseOption,
} from '../types'
import { PANEL, HDR_LABEL, MONO } from '../theme/tokens'
import {
  BRIEFING_THINKING_MAX_CHARS, GAMEPLAY_V2_AGENCY,
  PORTFOLIO_IMG, DEFAULT_IMG,
} from '../lib/gameConstants'
import {
  fmtNum, median, deriveWelfare, welfareDelta, isHotspot, isBrightSpot,
  isMediaHeadline, severityLabel,
} from '../lib/gameUtils'
import {
  MINISTER_COLORS, selectResponders, DRAFT_INTENT_RE, BROADCAST_RE, parseMentioned,
} from '../lib/advisorChat'
import { Avatar, AgentAvatar } from '../components/common/Avatar'
import { MiniBar } from '../components/common/MiniBar'
import type { WelfareStat } from '../components/dashboard/WelfareCard'
import { ScorecardOverlay } from '../components/overlays/ScorecardOverlay'
import { MinisterPickerModal } from '../components/overlays/MinisterPickerModal'
import { PolicyModal } from '../components/overlays/PolicyModal'
import { TurnPhaseCard, type TurnEntry } from '../components/dashboard/TurnPhaseCard'
import { HistoryCharts } from '../components/dashboard/HistoryCharts'
import { CityMap } from '../components/map/CityMap'
import { CitizenCrowd } from '../components/crowd/CitizenCrowd'
import { SpeechBubbleLayer } from '../components/crowd/SpeechBubbleLayer'
import { ApprovalMeter } from '../components/crowd/ApprovalMeter'
import { buildCityLayout } from '../lib/cityLayout'
import { voteBus } from '../lib/voteBus'
import { sound } from '../lib/sound'
import { useGameHistory } from '../hooks/useGameHistory'
import {
  TurnExecutionOverlay,
  type TurnOverlayPhase, type TurnOverlayItem,
} from '../components/broadcast/TurnExecutionOverlay'

// ─── Types used internally ────────────────────────────────────────────────────

interface ChatMsg {
  isMayor: boolean
  sender: string
  senderRole: string
  text: string
  time: string
  ringColor: string
  seed: string
  isSystem?: boolean
  isSystemFallback?: boolean
}

interface RoundReply {
  name: string
  portfolio: string
  text: string
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GameDashboard({ gameId, initialState }: { gameId: string; initialState: GameState }) {
  const [gameState, setGameState] = useState<GameState>(initialState)
  const [lastTurn, setLastTurn] = useState<TurnResult | null>(initialState.last_turn)
  const [turnHistory, setTurnHistory] = useState<TurnEntry[]>([])
  const initialTreasury = useRef(initialState.treasury)
  const historyTurns = useGameHistory(gameId, gameState.turn_history_count)

  // Living city map + left-column tabs
  const [leftTab, setLeftTab] = useState<'advisors' | 'feed'>('advisors')
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null)

  // Overlay collapses to a bottom band while the crowd is voting, so the live
  // city map + reacting citizens are visible during the poll.
  const [pollPhase, setPollPhase] = useState(voteBus.phase)
  useEffect(() => voteBus.onPhase(setPollPhase), [])

  // Shared city layout (map + speech bubbles must use the identical layout)
  const mapLayoutForBubbles = useMemo(() => {
    const locations = (gameState.ward_report ?? []).filter(w => w.group_type === 'location')
    return buildCityLayout(
      gameState.city_name,
      locations.map(l => ({ name: l.group_name, populationPct: l.population_pct })),
    )
  }, [gameState.city_name, gameState.ward_report])

  // Unified council chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [consultLoading, setConsultLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  // Track who is open in backend (one at a time)
  const activeConsultRef = useRef<string | null>(null)

  // Minister expand
  const [expandedMinisterId, setExpandedMinisterId] = useState<string | null>(null)

  // All parameters panel
  const [showAllParams, setShowAllParams] = useState(false)

  // Minor Action


  // Policy modal
  const [policyOptions, setPolicyOptions] = useState<Policy[] | null>(null)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [fetchingPolicies, setFetchingPolicies] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [discussingPolicyIndex, setDiscussingPolicyIndex] = useState<number | null>(null)

  // Minister picker (v2 flow)
  const [pendingPolicyIndex, setPendingPolicyIndex] = useState<number | null>(null)
  const [showMinisterPicker, setShowMinisterPicker] = useState(false)

  // Turn execution
  const [isTurnExecuting, setIsTurnExecuting] = useState(false)
  const [executingPolicyName, setExecutingPolicyName] = useState<string | null>(null)
  const [turnError, setTurnError] = useState<string | null>(null)
  const [selectedMinorAction, setSelectedMinorAction] = useState<MinorActionInput>({
    type: 'governance_upkeep',
    target: 'admin_efficiency',
    budget: 60,
  })
  const [selectedCounterFrame, setSelectedCounterFrame] = useState<CounterFrameStrategy>('Delivery Receipts')
  const [selectedPowerMove, setSelectedPowerMove] = useState<{ type: string; target_event_id?: string }>({ type: 'none' })
  const [turnChoices, setTurnChoices] = useState<TurnChoiceSnapshot[]>([])
  const [turnOverlayPaceMode, setTurnOverlayPaceMode] = useState<'cinematic' | 'fast' | 'skip'>('cinematic')
  const turnOverlayPaceModeRef = useRef<'cinematic' | 'fast' | 'skip'>('cinematic')
  const turnStartedAtRef = useRef<number | null>(null)
  const lastActionableAtRef = useRef<number | null>(null)
  const overlayOpenedAtRef = useRef<number | null>(null)
  const [turnTelemetryRows, setTurnTelemetryRows] = useState<{
    turn: number
    decisionCount: number
    turnDurationMs: number
    overlayDwellMs: number
    timeToDecisionMs: number | null
    policyName: string
  }[]>([])

  // Live approval — updated from approval_final event so top bar updates before complete
  // Initialized from initialState so the number is always visible (never resets to blank)
  const [liveApproval, setLiveApproval] = useState<number | null>(initialState.interim_approval)
  const [turnOverlayOpen, setTurnOverlayOpen] = useState(false)
  const [turnOverlayComplete, setTurnOverlayComplete] = useState(false)
  const [turnOverlayPhase, setTurnOverlayPhase] = useState<TurnOverlayPhase>('announcement')
  const [turnOverlayItems, setTurnOverlayItems] = useState<TurnOverlayItem[]>([])
  const [turnOverlayExecutionPct, setTurnOverlayExecutionPct] = useState<number | null>(null)
  const [turnOverlayApprovalPct, setTurnOverlayApprovalPct] = useState<number | null>(initialState.interim_approval)
  const [turnOverlayTreasuryDelta, setTurnOverlayTreasuryDelta] = useState<number | null>(null)
  // Dilemma state
  const [dilemmaOptions, setDilemmaOptions] = useState<{
    situation: string
    option_a: { label: string; description: string; effect_key: string; effect_delta: number; ideology_tag?: string }
    option_b: { label: string; description: string; effect_key: string; effect_delta: number; ideology_tag?: string }
  } | null>(null)
  const dilemmaResolverRef = useRef<((choice: 'a' | 'b') => void) | null>(null)
  // Event response state
  const [eventResponseOptions, setEventResponseOptions] = useState<EventResponseOption[] | null>(null)
  const eventResponseResolverRef = useRef<((responses: { event_id: string; strategy: string; minister_id?: string }[]) => void) | null>(null)
  // Accountability state
  const [accountabilityResolved, setAccountabilityResolved] = useState(true)
  const [accountabilityMinister, setAccountabilityMinister] = useState<{ id: string; name: string } | null>(null)
  const [accountabilityBudgetStolen, setAccountabilityBudgetStolen] = useState(0)
  const [accountabilityLoading, setAccountabilityLoading] = useState(false)
  const turnOverlayQueueCancelledRef = useRef(false)
  const turnOverlayItemIdRef = useRef(0)
  const turnOverlayRunIdRef = useRef(0)
  // Approval at end of the previous turn — stable baseline for the delta indicator.
  // Null on turn 1 (no prior turn), so delta is hidden until the first turn completes.
  const prevTurnApprovalRef = useRef<number | null>(
    initialState.last_turn?.interim_approval ?? null
  )
  // Holds the approval_final breakdown until complete fires and attaches it to TurnEntry
  const pendingVoteBreakdownRef = useRef<{ approve: number; disapprove: number; total: number } | null>(null)

  // Accumulated feed: voices + media accumulate turn-over-turn with a turn number tag
  const [allVoices, setAllVoices] = useState<(CitizenVoice & { turnNum: number })[]>([])
  const [allHeadlines, setAllHeadlines] = useState<(MediaHeadline & { turnNum: number; isBreaking?: boolean })[]>([])

  // Turn-start briefing
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [briefingStage, setBriefingStage] = useState(0) // 0-4 progress steps
  const [briefingThinking, setBriefingThinking] = useState('')
  const [briefingUnlockedTurn, setBriefingUnlockedTurn] = useState(initialState.current_turn)
  const briefingFetchedForTurn = useRef<number>(0)
  const briefingThinkingRef = useRef<HTMLDivElement>(null)
  const briefingQueueCancelledRef = useRef(false)
  const reasoningBlocks = useMemo(() => parseReasoning(briefingThinking), [briefingThinking])
  // Minister briefing scene
  const [briefingLines, setBriefingLines] = useState<{ minister_name: string; portfolio: string; line: string }[]>([])
  const [briefingVisibleLines, setBriefingVisibleLines] = useState<
    { minister_name: string; portfolio: string; line: string; typewriterText: string; done: boolean }[]
  >([])
  const briefingSceneScrollRef = useRef<HTMLDivElement>(null)
  const [ministersDone, setMinistersDone] = useState(false)
  const [currentPolicyIdx, setCurrentPolicyIdx] = useState(0)
  const currentPolicyIdxRef = useRef(0)
  // Pending deltas from time-profiled policies (turn → param → delta)
  const [pendingDeltas, setPendingDeltas] = useState<Record<string, Record<string, number>>>({})
  // Loading ticker
  const [briefingTickerItems, setBriefingTickerItems] = useState<{ type: string; text: string; id: number }[]>([])
  const briefingTickerIdRef = useRef(0)
  const briefingTickerEndRef = useRef<HTMLDivElement>(null)

  // Game over
  const [gameOver, setGameOver] = useState(false)
  const [scorecard, setScorecard] = useState<GovernanceScorecard | null>(null)
  // Next-turn forecast
  const [turnForecast, setTurnForecast] = useState<TurnForecast | null>(null)

  // Identity groups filter + expansion
  const [identityFilter, setIdentityFilter] = useState<string>('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const mediaScrollRef = useRef<HTMLDivElement>(null)
  const chatterScrollRef = useRef<HTMLDivElement>(null)
  const hasChatThisTurnRef = useRef(false)
  // Cabinet is "in session" after @all — stays open until mayor addresses someone directly
  const cabinetInSessionRef = useRef(false)

  // Theme music
  const TRACKS = ['/theme.mp3', '/theme2.mp3']
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isMuted, setIsMuted] = useState(false)

  // Initialize with a random track
  const [currentTrackIndex, setCurrentTrackIndex] = useState(() => Math.floor(Math.random() * TRACKS.length))
  const musicStartedRef = useRef(false)

  // Start music + unlock the WebAudio SFX engine on first user interaction
  // (browser autoplay policy requires a gesture).
  useEffect(() => {
    const startMusic = () => {
      sound.unlock()
      if (musicStartedRef.current) return
      const audio = audioRef.current
      if (audio) {
        audio.volume = 0.3
        audio.play().then(() => {
          musicStartedRef.current = true
          setIsMuted(false)
        }).catch(() => { })
      }
    }
    document.addEventListener('click', startMusic, { once: true })
    return () => document.removeEventListener('click', startMusic)
  }, [])

  const toggleMusic = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isMuted) {
      sound.setSfxEnabled(true)
      audio.play().then(() => setIsMuted(false)).catch(() => { })
    } else {
      sound.setSfxEnabled(false)
      audio.pause()
      setIsMuted(true)
    }
  }

  const nextTrack = () => {
    // Pick a random track that isn't the current one
    let nextIdx;
    if (TRACKS.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * TRACKS.length)
      } while (nextIdx === currentTrackIndex)
    } else {
      nextIdx = 0
    }

    setCurrentTrackIndex(nextIdx)
    const audio = audioRef.current
    if (audio) {
      audio.src = TRACKS[nextIdx]
      if (!isMuted && musicStartedRef.current) {
        audio.play().catch(() => { })
      }
    }
  }

  // ── Auto-briefing + auto-policies on turn start ──────────────────────────

  useEffect(() => {
    // Keep queue active even if this effect returns early (important for React StrictMode double-invoke).
    briefingQueueCancelledRef.current = false

    const turn = gameState.current_turn
    if (briefingFetchedForTurn.current >= turn) return
    if (briefingUnlockedTurn < turn) return
    if (isTurnExecuting) return
    if (gameOver) return

    briefingFetchedForTurn.current = turn
    setBriefingLoading(true)
    setBriefingStage(0)
    setBriefingThinking('')
    setBriefingLines([])
    setBriefingVisibleLines([])
    setMinistersDone(false)
    setCurrentPolicyIdx(0)
    currentPolicyIdxRef.current = 0
    setBriefingTickerItems([])
    briefingTickerIdRef.current = 0

    const run = async () => {
      try {
        for await (const event of streamTurnBriefing(gameId)) {
          const type = event.type as string

          const pushTickerItems = async (items: { type: string; text: string }[], delayMs = 350) => {
            for (const item of items) {
              if (briefingQueueCancelledRef.current) return
              const id = ++briefingTickerIdRef.current
              setBriefingTickerItems(prev => [...prev, { ...item, id }])
              briefingTickerEndRef.current?.scrollIntoView({ behavior: 'smooth' })
              await new Promise(r => setTimeout(r, delayMs))
            }
          }

          if (type === 'city_snapshot') {
            setBriefingStage(1)
            const worst = (event.worst_3 as { key: string; value: number }[]) || []
            const best = (event.best_3 as { key: string; value: number }[]) || []
            const crises = (event.active_events as { name: string }[]) || []
            const items: { type: string; text: string }[] = [
              ...worst.map(w => ({ type: 'alert', text: `⚠ ${w.key.replace(/_/g, ' ')} at ${w.value}` })),
              ...best.map(b => ({ type: 'good', text: `✓ ${b.key.replace(/_/g, ' ')} at ${b.value}` })),
              ...crises.map(c => ({ type: 'crisis', text: `🔴 Active crisis: ${c.name}` })),
            ]
            if (event.pending_deltas) {
              setPendingDeltas(event.pending_deltas as Record<string, Record<string, number>>)
            }
            void pushTickerItems(items, 350)
          }

          if (type === 'headlines') {
            setBriefingStage(2)
            const headlines = (event.headlines as MediaHeadline[]) || []
            setAllHeadlines(prev => [
              ...prev,
              ...headlines.map(h => ({ ...h, turnNum: turn })),
            ])
            void pushTickerItems(
              headlines.map(h => ({ type: 'headline', text: `📰 ${h.outlet}: ${h.headline}` })),
              400,
            )
          }

          if (type === 'voices') {
            setBriefingStage(3)
            const voices = (event.voices as CitizenVoice[]) || []
            setAllVoices(prev => [
              ...prev,
              ...voices.map(v => ({ ...v, turnNum: turn })),
            ])
            void pushTickerItems(
              voices.map(v => ({ type: 'voice', text: `💬 ${v.reaction}` })),
              400,
            )
          }

          if (type === 'minister_briefing') {
            const lines = event.lines as { minister_name: string; portfolio: string; line: string }[]
            setBriefingLines(lines)
            setBriefingVisibleLines([])
            let step = 0
            const showNext = async () => {
              if (briefingQueueCancelledRef.current) return
              // Append this minister's entry (starts empty)
              setBriefingVisibleLines(prev => [
                ...prev,
                { ...lines[step], typewriterText: '', done: false },
              ])
              await new Promise(r => setTimeout(r, 50)) // let React render the entry
              const lineText = lines[step].line
              for (let ci = 1; ci <= lineText.length; ci++) {
                if (briefingQueueCancelledRef.current) return
                const captured = ci
                setBriefingVisibleLines(prev => prev.map((e, i) =>
                  i === step ? { ...e, typewriterText: lineText.slice(0, captured) } : e
                ))
                briefingSceneScrollRef.current?.scrollTo({ top: briefingSceneScrollRef.current.scrollHeight, behavior: 'smooth' })
                await new Promise(r => setTimeout(r, 28))
              }
              // Mark done
              setBriefingVisibleLines(prev => prev.map((e, i) =>
                i === step ? { ...e, done: true } : e
              ))
              await new Promise(r => setTimeout(r, 600))
              step++
              if (step < lines.length) {
                await showNext()
              } else {
                setMinistersDone(true)
              }
            }
            void showNext()
          }

          if (type === 'thinking') {
            setBriefingThinking(prev => {
              const appended = prev + (event.chunk as string)
              if (appended.length <= BRIEFING_THINKING_MAX_CHARS) return appended
              return appended.slice(appended.length - BRIEFING_THINKING_MAX_CHARS)
            })
            briefingThinkingRef.current?.scrollTo({ top: briefingThinkingRef.current.scrollHeight, behavior: 'smooth' })
          }

          if (type === 'policy_progress') {
            currentPolicyIdxRef.current = event.current as number
            setCurrentPolicyIdx(event.current as number)
          }

          if (type === 'policies') {
            setBriefingStage(4)
            setPolicyOptions((event.options as Policy[]) || [])
          }

          if (type === 'complete') {
            await new Promise(r => setTimeout(r, 300))
            setBriefingLoading(false)
            setShowPolicyModal(true)
          }

          if (type === 'error') {
            console.error('Briefing stream error:', event.message)
            setBriefingLoading(false)
          }
        }
      } catch (err) {
        console.error('Briefing stream failed:', err)
        setBriefingLoading(false)
      }
    }
    void run()
    return () => {
      briefingQueueCancelledRef.current = true
    }
  }, [gameState.current_turn, briefingUnlockedTurn, isTurnExecuting, gameOver, gameId])

  const canPlayNextTurn = !briefingLoading
    && !isTurnExecuting
    && !gameOver
    && briefingFetchedForTurn.current < gameState.current_turn
    && briefingUnlockedTurn < gameState.current_turn

  const handlePlayNextTurn = useCallback(() => {
    if (!canPlayNextTurn) return
    setShowPolicyModal(false)
    setPolicyOptions(null)
    setPolicyError(null)
    setDiscussingPolicyIndex(null)
    setBriefingUnlockedTurn(gameState.current_turn)
  }, [canPlayNextTurn, gameState.current_turn])

  const handleDismissTurnOverlay = useCallback(() => {
    if (!turnOverlayComplete || !accountabilityResolved) return
    turnOverlayQueueCancelledRef.current = true
    const now = performance.now()
    if (overlayOpenedAtRef.current !== null) {
      const overlayDwellMs = Math.max(0, now - overlayOpenedAtRef.current)
      setTurnTelemetryRows(prev => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (last.overlayDwellMs > 0) return prev
        const next = [...prev]
        next[next.length - 1] = { ...last, overlayDwellMs }
        return next
      })
    }
    lastActionableAtRef.current = now
    voteBus.setPhase('idle')
    setTurnOverlayOpen(false)
    setTurnOverlayItems([])
    setTurnOverlayComplete(false)
    setTurnOverlayPhase('announcement')
    setExecutingPolicyName(null)
  }, [turnOverlayComplete, accountabilityResolved])

  const handleAccountability = useCallback(async (action: string) => {
    if (!accountabilityMinister) return
    setAccountabilityLoading(true)
    try {
      const result = await applyAccountability(gameId, action, accountabilityMinister.id)
      // Update minister state in gameState
      if (result.ok) {
        setGameState(prev => ({
          ...prev,
          treasury: typeof result.treasury_after === 'number' ? result.treasury_after : prev.treasury,
          political_capital: typeof result.pc_earned === 'number'
            ? Math.min(50, (prev.political_capital ?? 0) + result.pc_earned)
            : prev.political_capital,
          ministers: prev.ministers.map(m =>
            m.id === accountabilityMinister.id
              ? {
                  ...m,
                  loyalty: typeof result.loyalty_after === 'number' ? result.loyalty_after : m.loyalty,
                  scandal_exposure: typeof result.scandal_after === 'number' ? result.scandal_after : m.scandal_exposure,
                  fatigue: typeof result.fatigue_after === 'number' ? result.fatigue_after : m.fatigue,
                }
              : m
          ),
        }))
        const label = typeof result.action === 'string' ? result.action.toUpperCase() : action.toUpperCase()
        const bits: string[] = []
        if (typeof result.loyalty_delta === 'number') bits.push(`Loyalty ${result.loyalty_delta >= 0 ? '+' : ''}${result.loyalty_delta}`)
        if (typeof result.scandal_delta === 'number') bits.push(`Scandal ${result.scandal_delta >= 0 ? '+' : ''}${result.scandal_delta}`)
        if (typeof result.fatigue_delta === 'number') bits.push(`Fatigue ${result.fatigue_delta >= 0 ? '+' : ''}${result.fatigue_delta}`)
        if (typeof result.recovered === 'number') bits.push(`Recovered ₹${fmtNum(Math.round(result.recovered))} Cr`)
        if (typeof result.treasury_cost === 'number') bits.push(`Cost ₹${fmtNum(Math.round(result.treasury_cost))} Cr`)
        if (typeof result.pc_earned === 'number') bits.push(`Political Capital +${result.pc_earned}`)
        const summary = bits.length > 0 ? bits.join(' · ') : 'No direct stat change.'
        setTurnOverlayItems(prev => [...prev, {
          id: ++turnOverlayItemIdRef.current,
          phase: 'complete',
          kind: 'status',
          title: `ACCOUNTABILITY · ${label}`,
          body: summary,
          accent: action === 'praise' ? '#4ade80' : action === 'reprimand' ? '#fbbf24' : action === 'investigate' ? '#f87171' : '#94a3b8',
          typed: false,
          displayText: summary,
          done: true,
        }])
      }
    } catch (e) {
      console.error('Accountability action failed:', e)
    } finally {
      setAccountabilityLoading(false)
      setAccountabilityResolved(true)
    }
  }, [gameId, accountabilityMinister])

  useEffect(() => {
    turnOverlayPaceModeRef.current = turnOverlayPaceMode
  }, [turnOverlayPaceMode])

  useEffect(() => {
    return () => {
      turnOverlayQueueCancelledRef.current = true
      turnOverlayRunIdRef.current += 1
    }
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])
  const mediaHoveredRef = useRef(false)
  const chatterHoveredRef = useRef(false)
  const mediaInnerRef = useRef<HTMLDivElement>(null)
  const chatterInnerRef = useRef<HTMLDivElement>(null)

  // Seamless marquee scroll for Media — content is rendered twice;
  // when scroll passes the first copy, snap back invisibly
  useEffect(() => {
    const id = setInterval(() => {
      const el = mediaScrollRef.current
      const inner = mediaInnerRef.current
      if (!el || !inner || mediaHoveredRef.current) return
      const oneHeight = inner.offsetHeight
      if (oneHeight === 0) return
      if (el.scrollTop >= oneHeight) {
        el.scrollTop -= oneHeight
      } else {
        el.scrollTop += 1
      }
    }, 40)
    return () => clearInterval(id)
  }, [])

  // When new headlines arrive, snap to just before the end of the first copy
  // so the newest item scrolls into view quickly (marquee will carry it forward)
  useEffect(() => {
    const el = mediaScrollRef.current
    const inner = mediaInnerRef.current
    if (!el || !inner || mediaHoveredRef.current) return
    // Snap to near-end of first copy so new item is immediately visible
    requestAnimationFrame(() => {
      if (el && inner) el.scrollTop = inner.offsetHeight - el.clientHeight - 4
    })
  }, [allHeadlines.length])

  // Seamless marquee scroll for City Chatter
  useEffect(() => {
    const id = setInterval(() => {
      const el = chatterScrollRef.current
      const inner = chatterInnerRef.current
      if (!el || !inner || chatterHoveredRef.current) return
      const oneHeight = inner.offsetHeight
      if (oneHeight === 0) return
      if (el.scrollTop >= oneHeight) {
        el.scrollTop -= oneHeight
      } else {
        el.scrollTop += 1
      }
    }, 40)
    return () => clearInterval(id)
  }, [])

  // When new voices arrive, snap to near-end of first copy
  useEffect(() => {
    const el = chatterScrollRef.current
    const inner = chatterInnerRef.current
    if (!el || !inner || chatterHoveredRef.current) return
    requestAnimationFrame(() => {
      if (el && inner) el.scrollTop = inner.offsetHeight - el.clientHeight - 4
    })
  }, [allVoices.length])

  // Auto-select first filterable identity type when ward report loads
  const wardReportKey = (gameState.ward_report ?? []).map(e => `${e.group_type}:${e.group_name}`).join(',')
  useEffect(() => {
    const source = lastTurn?.ward_report ?? gameState.ward_report ?? []
    const counts: Record<string, Set<string>> = {}
    for (const entry of source) {
      if (!counts[entry.group_type]) counts[entry.group_type] = new Set()
      counts[entry.group_type].add(entry.group_name)
    }
    const types = Object.entries(counts)
      .filter(([, names]) => names.size >= 2 && names.size <= 8)
      .map(([type]) => type)
    if (types.length > 0 && !types.includes(identityFilter)) {
      setIdentityFilter(types[0])
    }
  }, [wardReportKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Consultation helpers ─────────────────────────────────────────────────

  // Send message through one minister's consultation, get reply.
  // priorRoundReplies: replies already collected in THIS send-round (so each minister
  // can genuinely build on what their colleagues just said, not hallucinate).
  async function getMinisterReply(
    m: Minister,
    mayorMsg: string,
    isBroadcast: boolean = false,
    priorRoundReplies: RoundReply[] = []
  ): Promise<string> {
    // Close any different minister that's currently open
    if (activeConsultRef.current && activeConsultRef.current !== m.id) {
      console.log(`[getMinisterReply] Closing consultation with ${activeConsultRef.current} before opening ${m.name}`)
      await closeConsultation(gameId).catch((e) => { console.warn('[getMinisterReply] Close failed:', e) })
      activeConsultRef.current = null
    }
    // Open this minister's consultation if not already open.
    // For broadcast @all: skip the LLM opening statement (silent=true) — saves
    // one full LLM call per minister and avoids serial timeout chains.
    if (activeConsultRef.current !== m.id) {
      console.log(`[getMinisterReply] Opening consultation with ${m.name} (silent=${isBroadcast})`)
      await openConsultation(gameId, m.id, isBroadcast)
      activeConsultRef.current = m.id
      console.log(`[getMinisterReply] Opened. Sending message...`)
    }
    // Build context: only include messages from current turn (after last system separator)
    const lastSysIdx = [...chatMessages].reverse().findIndex(m => m.isSystem)
    const msgsThisTurn = lastSysIdx >= 0
      ? chatMessages.slice(chatMessages.length - lastSysIdx)
      : chatMessages
    // stale React state — only used for minister 1 (when no round replies yet)
    const recentContext = msgsThisTurn.slice(-6)
      .filter(msg => !msg.isMayor && !msg.isSystem)
      .map(msg => `${msg.sender} (${msg.senderRole}): ${msg.text}`)
      .join('\n')
    // Only include last-turn summary if player has actually chatted this turn
    const turnCtx = (lastTurn && hasChatThisTurnRef.current)
      ? `[Last turn: "${lastTurn.major_policy?.name}" · ${Math.round(lastTurn.execution_score * 100)}% exec · approval ${Math.round(lastTurn.approval_before ?? 0)}%→${Math.round(lastTurn.interim_approval)}%]\n`
      : ''
    const mediaCtx = allHeadlines.slice(-3)
      .map(h => `[${h.outlet}: "${h.headline}"]`)
      .join('\n')
    const cityChatterCtx = allVoices.slice(-5)
      .map(v => `[${v.name} (${v.sentiment ?? 'neutral'}): "${v.reaction}"]`)
      .join('\n')

    // Replies already collected THIS round — always fresh, no React state staleness
    // Frame as a live discussion thread so each minister feels they're jumping into a debate
    const thisRoundCtx = priorRoundReplies.length > 0
      ? priorRoundReplies.map(r => `${r.name} (${r.portfolio}): "${r.text}"`).join('\n')
      : ''
    // Only fall back to stale React context for the first minister (when no round replies yet)
    const priorSessionCtx = priorRoundReplies.length === 0 ? recentContext : ''
    // Label the mayor's message differently for cabinet-wide questions
    const mayorBlock = isBroadcast
      ? `[Cabinet Meeting, Turn ${gameState.current_turn} — The Mayor addresses the full cabinet:]\nMayor: ${mayorMsg}`
      : `Mayor: ${mayorMsg}`

    // If a policy is under discussion, inject its full details so all advisors have context
    const discussingPolicy = (discussingPolicyIndex !== null && policyOptions)
      ? policyOptions[discussingPolicyIndex]
      : null
    const policyCtx = discussingPolicy
      ? [
          `[Policy under cabinet review: "${discussingPolicy.name}" (${discussingPolicy.portfolio})]`,
          `Budget: ₹${fmtNum(discussingPolicy.budget_cost)} Cr`,
          `Description: ${discussingPolicy.description}`,
          Object.keys(discussingPolicy.target_effects).length > 0
            ? `Target effects: ${Object.entries(discussingPolicy.target_effects).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v >= 0 ? '+' : ''}${v}`).join(', ')}`
            : '',
          Object.keys(discussingPolicy.side_effects).length > 0
            ? `Side effects: ${Object.entries(discussingPolicy.side_effects).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v >= 0 ? '+' : ''}${v}`).join(', ')}`
            : '',
          discussingPolicy.tradeoffs ? `Tradeoffs: ${discussingPolicy.tradeoffs}` : '',
          discussingPolicy.why_now ? `Why now: ${discussingPolicy.why_now}` : '',
        ].filter(Boolean).join('\n')
      : ''

    const fullMsg = (policyCtx ? `${policyCtx}\n\n` : '')
      + turnCtx
      + (mediaCtx ? `[Recent media coverage:\n${mediaCtx}]\n` : '')
      + (cityChatterCtx ? `[What citizens are saying:\n${cityChatterCtx}]\n` : '')
      + (priorSessionCtx ? `[Council room — earlier this session:\n${priorSessionCtx}]\n\n` : '')
      + (thisRoundCtx ? `[Cabinet discussion so far — respond to these colleagues, don't just agree:\n${thisRoundCtx}]\n\n` : '')
      + mayorBlock
    const res = await messageMinister(gameId, fullMsg)
    return res.reply
  }

  // ── Main send handler ────────────────────────────────────────────────────

  async function handleSendMessage() {
    if (!chatInput.trim() || consultLoading) return

    const msg = chatInput.trim()
    setChatInput('')
    setChatError(null)
    hasChatThisTurnRef.current = true
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Add mayor's message
    setChatMessages(prev => [...prev, {
      isMayor: true, sender: 'Mayor', senderRole: '', text: msg,
      time: now, ringColor: '#d97706', seed: 'mayor',
    }])
    setConsultLoading(true)

    try {
      const ministers = gameState.ministers
      const isBroadcast = BROADCAST_RE.test(msg)
      const directMentions = parseMentioned(msg, ministers)

      // Cabinet session state:
      // - @all opens the session → all ministers engage
      // - Follow-up generic messages (no @name) → top 2-3 relevant ministers stay engaged
      // - @name closes the session → only addressed minister responds
      if (isBroadcast) {
        cabinetInSessionRef.current = true
      } else if (directMentions.length > 0) {
        cabinetInSessionRef.current = false
      }

      const cabinetHot = cabinetInSessionRef.current && !isBroadcast
      const responderIndices = selectResponders(msg, ministers, cabinetHot)

      console.log(`[Advisory Chat] Broadcast=${isBroadcast}, CabinetSession=${cabinetInSessionRef.current}, Responders=${responderIndices.length}:`, responderIndices.map(i => ministers[i]?.name))

      // Accumulate replies from this round so each minister genuinely sees
      // what colleagues already said — prevents hallucination of prior remarks
      const roundReplies: RoundReply[] = []

      for (let ri = 0; ri < responderIndices.length; ri++) {
        const idx = responderIndices[ri]
        const m = ministers[idx]
        if (!m) { console.warn(`[Advisory Chat] No minister at index ${idx}`); continue }
        const mColor = MINISTER_COLORS[idx % MINISTER_COLORS.length]

        // Staggered delay between ministers (skipped for the first one)
        if (roundReplies.length > 0) {
          const delay = 600 + Math.floor(Math.random() * 900) // 600–1500ms
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        console.log(`[Advisory Chat] Requesting reply ${ri + 1}/${responderIndices.length} from ${m.name} (${m.portfolio})`)

        try {
          const reply = await getMinisterReply(m, msg, isBroadcast, roundReplies)

          // Push BEFORE next iteration so the next minister sees this reply
          roundReplies.push({ name: m.name, portfolio: m.portfolio, text: reply })

          const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setChatMessages(prev => [...prev, {
            isMayor: false, sender: m.name, senderRole: m.portfolio,
            text: reply, time: replyTime,
            ringColor: mColor, seed: m.name,
          }])
          console.log(`[Advisory Chat] Got reply from ${m.name}`)
        } catch (e) {
          console.error(`[Advisory Chat] Reply from ${m.name} failed:`, e)
          // Show a subtle "unavailable" message so user knows this minister tried
          const failTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setChatMessages(prev => [...prev, {
            isMayor: false, sender: m.name, senderRole: m.portfolio,
            text: '(unavailable right now)', time: failTime,
            ringColor: '#334155', seed: m.name,
            isSystemFallback: true,
          }])
          // Don't push to roundReplies — next minister must not reference a ghost reply
        }
      }
      console.log(`[Advisory Chat] Loop complete. ${roundReplies.length} replies collected.`)

      // Auto-trigger Draft Policy if the mayor's message signals intent to finalise
      // and a policy discussion is currently active
      if (discussingPolicyIndex !== null && DRAFT_INTENT_RE.test(msg)) {
        console.log('[Advisory Chat] Draft intent detected — auto-triggering handleDraftPolicy')
        handleDraftPolicy()
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error(`[Advisory Chat] OUTER catch:`, e)
      setChatError(`Chat failed: ${errMsg}`)
    } finally {
      setConsultLoading(false)
    }
  }

  // ── Draft Policy → close consult → get policies ──────────────────────────

  async function handleDraftPolicy() {
    if (fetchingPolicies) return
    setFetchingPolicies(true)
    setPolicyError(null)
    try {
      // Close any open consultation so the transcript is sealed
      if (activeConsultRef.current) {
        await closeConsultation(gameId).catch(() => { })
        activeConsultRef.current = null
      }

      if (discussingPolicyIndex !== null && policyOptions) {
        // Amend only the discussed policy — collect chat messages since the discussion started as transcript
        let discussStartIdx = -1
        for (let i = chatMessages.length - 1; i >= 0; i--) {
          const msg = chatMessages[i]
          if (msg.isSystem && msg.senderRole === 'POLICY REVIEW') {
            discussStartIdx = i
            break
          }
        }
        const discussionMsgs = discussStartIdx >= 0 ? chatMessages.slice(discussStartIdx + 1) : []
        const transcript = discussionMsgs
          .map(m => `${m.sender}: ${m.text}`)
          .join('\n')
        const res = await amendPolicy(gameId, discussingPolicyIndex, transcript)
        setPolicyOptions(res.options)
        setDiscussingPolicyIndex(null)
      } else {
        // Fresh policy generation
        const res = await getPolicies(gameId)
        setPolicyOptions(res.options)
      }
      setShowPolicyModal(true)
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setPolicyError(`Failed to load policies: ${errMsg}`)
    } finally {
      setFetchingPolicies(false)
    }
  }


  // ── Execute Turn ─────────────────────────────────────────────────────────

  // Policy selected from modal → open minister picker
  function handleSelectPolicy(index: number) {
    if (isTurnExecuting) return
    setPendingPolicyIndex(index)
    setShowPolicyModal(false)
    setDiscussingPolicyIndex(null)
    setShowMinisterPicker(true)
  }

  // Policy selected for discussion → close modal, inject system message, return to chat
  async function handleDiscussPolicy(policy: Policy, index: number) {
    setShowPolicyModal(false)
    setDiscussingPolicyIndex(index)
    // Force-close any open minister consultation so the next open starts fresh with
    // policy context already in scope — prevents stale history without policy grounding
    if (activeConsultRef.current) {
      await closeConsultation(gameId).catch(() => { })
      activeConsultRef.current = null
    }
    // Keep policyOptions so we can amend in-place later
    const effectsSummary = Object.entries(policy.target_effects)
      .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v >= 0 ? '+' : ''}${v}`)
      .join(', ')
    const sideEffectsSummary = Object.entries(policy.side_effects)
      .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v >= 0 ? '+' : ''}${v}`)
      .join(', ')
    const summaryText = [
      `POLICY UNDER DISCUSSION: ${policy.name}`,
      `Portfolio: ${policy.portfolio} | Budget: ₹${fmtNum(policy.budget_cost)} Cr`,
      effectsSummary ? `Effects: ${effectsSummary}` : '',
      sideEffectsSummary ? `Side effects: ${sideEffectsSummary}` : '',
      policy.description,
      '',
      'Discuss this policy with your cabinet. When ready, click "Draft Policy" to get an amended version.',
    ].filter(Boolean).join('\n')

    setChatMessages(prev => [...prev, {
      isMayor: false, sender: 'System', senderRole: 'POLICY REVIEW',
      text: summaryText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ringColor: '#e8a030', seed: 'system', isSystem: true,
    }])
  }

  // Minister chosen → execute turn v2
  async function handleSelectMinister(
    ministerId: string,
    minorActionChoice: MinorActionInput,
    counterFrameChoice: CounterFrameStrategy,
    powerMoveChoice: { type: string; target_event_id?: string } = { type: 'none' },
  ) {
    if (isTurnExecuting || pendingPolicyIndex === null) {
      return
    }
    const index = pendingPolicyIndex
    setShowMinisterPicker(false)
    setPendingPolicyIndex(null)
    setIsTurnExecuting(true)
    setTurnError(null)
    setTurnForecast(null)
    // Freeze baseline before this turn runs — persists through the complete event so delta stays correct
    prevTurnApprovalRef.current = liveApproval ?? gameState.interim_approval
    hasChatThisTurnRef.current = false

    const selectedPolicy = policyOptions?.[index] ?? null
    setExecutingPolicyName(selectedPolicy?.name || 'Policy Execution')
    const streamTurnNum = gameState.current_turn

    const overlayRunId = ++turnOverlayRunIdRef.current
    turnOverlayQueueCancelledRef.current = false
    turnOverlayItemIdRef.current = 0
    setTurnOverlayOpen(true)
    setTurnOverlayComplete(false)
    setTurnOverlayPhase('announcement')
    setTurnOverlayItems([])
    setTurnOverlayExecutionPct(null)
    setTurnOverlayApprovalPct(Math.round(liveApproval ?? gameState.interim_approval))
    setTurnOverlayTreasuryDelta(null)
    setAccountabilityResolved(true)
    setAccountabilityMinister(null)
    setAccountabilityBudgetStolen(0)
    setAccountabilityLoading(false)
    setDilemmaOptions(null)
    setEventResponseOptions(null)
    setSelectedPowerMove({ type: 'none' })
    dilemmaResolverRef.current = null
    eventResponseResolverRef.current = null
    let receivedDilemma = false
    let receivedEventResponsePrompt = false
    overlayOpenedAtRef.current = performance.now()
    turnStartedAtRef.current = performance.now()

    const selectedMinister = gameState.ministers.find(m => m.id === ministerId)
    const timeToDecisionMs = lastActionableAtRef.current !== null
      ? Math.max(0, performance.now() - lastActionableAtRef.current)
      : null
    const choiceSnapshot: TurnChoiceSnapshot = {
      turn: streamTurnNum,
      policyIndex: index,
      policyName: selectedPolicy?.name ?? 'Policy Execution',
      ministerId,
      ministerName: selectedMinister?.name ?? 'Unknown',
      minorAction: minorActionChoice,
      counterFrame: counterFrameChoice,
      chosenAtIso: new Date().toISOString(),
    }

    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
    const humanize = (v: string) => v.replace(/_/g, ' ')
    const isOverlayRunAlive = () =>
      !turnOverlayQueueCancelledRef.current && turnOverlayRunIdRef.current === overlayRunId

    const appendOverlayItem = async (
      item: Omit<TurnOverlayItem, 'id' | 'displayText' | 'done'>,
      opts?: { charMs?: number; gapMs?: number }
    ) => {
      if (!isOverlayRunAlive()) return
      const pace = turnOverlayPaceModeRef.current
      const skip = pace === 'skip'
      const typed = item.typed && !skip
      const charMs = pace === 'skip' ? 0 : pace === 'fast' ? 5 : (opts?.charMs ?? 16)
      const gapMs = pace === 'skip' ? 0 : pace === 'fast' ? 45 : (opts?.gapMs ?? 220)
      const id = ++turnOverlayItemIdRef.current
      const entry: TurnOverlayItem = {
        ...item,
        id,
        typed,
        displayText: typed ? '' : item.body,
        done: !typed,
      }
      setTurnOverlayItems(prev => [...prev, entry])
      if (!skip) await sleep(pace === 'fast' ? 8 : 40)
      if (typed) {
        for (let ci = 1; ci <= item.body.length; ci++) {
          if (!isOverlayRunAlive()) return
          const snap = ci
          setTurnOverlayItems(prev => prev.map(e => (
            e.id === id ? { ...e, displayText: item.body.slice(0, snap) } : e
          )))
          if (charMs > 0) await sleep(charMs)
        }
        setTurnOverlayItems(prev => prev.map(e => (e.id === id ? { ...e, done: true } : e)))
      }
      if (gapMs > 0) await sleep(gapMs)
    }

    try {
      let approveWeight = 0
      let totalWeight = 0

      for await (const rawEvent of executeTurnStreamV2(gameId, index, ministerId, minorActionChoice, counterFrameChoice, powerMoveChoice)) {
        const rawType = typeof rawEvent.type === 'string' ? rawEvent.type : ''
        if (rawType === 'game_over') {
          setGameState(rawEvent.state as GameState)
          setGameOver(true)
          setTurnOverlayPhase('complete')
          setTurnOverlayComplete(true)
          await appendOverlayItem({
            phase: 'complete',
            kind: 'error',
            title: 'GAME OVER',
            body: String(rawEvent.loss_reason ?? 'Loss condition reached.'),
            accent: '#f87171',
            typed: true,
          }, { charMs: 12, gapMs: 50 })
          break
        }

        const event = rawEvent as unknown as TurnStreamV2Event

        if (event.type === 'complete') {
          const tr = event.turn_result as TurnResult
          const newState = event.state as GameState

          setGameState(newState)
          setLastTurn(tr)
          const newEntry: TurnEntry = {
            turn: tr.turn, result: tr, expanded: true,
            voteBreakdown: pendingVoteBreakdownRef.current ?? undefined,
            choice: choiceSnapshot,
          }
          pendingVoteBreakdownRef.current = null
          setTurnHistory(prev => [newEntry, ...prev.map(e => ({ ...e, expanded: false }))])
          setPolicyOptions(null)
          setDiscussingPolicyIndex(null)
          setPolicyError(null)
          setTurnOverlayTreasuryDelta((tr.tax_revenue ?? 0) - (tr.major_policy?.budget_cost ?? 0) - (tr.interest_paid ?? 0) - (tr.budget_stolen ?? 0))
          setTurnOverlayApprovalPct(Math.round(tr.interim_approval))

          // Add turn separator to chat
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setChatMessages(prev => [...prev, {
            isMayor: false, sender: 'SYSTEM', senderRole: '',
            text: `── Turn ${tr.turn} complete · ${tr.major_policy?.name ?? 'Policy'} · Approval ${Math.round(tr.approval_before ?? 0)}% → ${Math.round(tr.interim_approval)}% ──`,
            time: now, ringColor: '#1c3652', seed: 'system', isSystem: true,
          }])
          activeConsultRef.current = null

          // For v2: citizen_voices come in via streaming events, not the complete payload
          // Only accumulate media headlines from complete (voices already streamed)
          const turnNum = tr.turn
          if ((tr.media_headlines ?? []).length > 0) {
            setAllHeadlines(prev => [...prev, ...(tr.media_headlines ?? []).map(h => ({ ...h, turnNum }))])
          }
          if ((tr.citizen_voices ?? []).length > 0 && !allVoices.some(v => v.turnNum === turnNum)) {
            setAllVoices(prev => [...prev, ...(tr.citizen_voices ?? []).map(v => ({ ...v, turnNum }))])
          }

          if (event.game_over) {
            setGameOver(true)
            if (event.scorecard) setScorecard(event.scorecard as GovernanceScorecard)
          }
          if (event.forecast) setTurnForecast(event.forecast as TurnForecast)

          const turnDurationMs = turnStartedAtRef.current !== null
            ? Math.max(0, performance.now() - turnStartedAtRef.current)
            : 0
          setTurnChoices(prev => [...prev, choiceSnapshot])
          setTurnTelemetryRows(prev => [
            ...prev,
            {
              turn: tr.turn,
              decisionCount: GAMEPLAY_V2_AGENCY ? 4 : 2,
              turnDurationMs,
              overlayDwellMs: 0,
              timeToDecisionMs,
              policyName: tr.major_policy?.name ?? choiceSnapshot.policyName,
            },
          ])
          console.info('[Gameplay Telemetry]', {
            turn: tr.turn,
            decisionCount: GAMEPLAY_V2_AGENCY ? 4 : 2,
            turnDurationMs: Math.round(turnDurationMs),
            timeToDecisionMs: timeToDecisionMs === null ? null : Math.round(timeToDecisionMs),
            policyName: tr.major_policy?.name ?? choiceSnapshot.policyName,
          })

          setTurnOverlayPhase('complete')
          // Set up accountability review (skip on game over)
          if (!event.game_over) {
            setAccountabilityMinister({
              id: tr.assigned_minister_id ?? choiceSnapshot.ministerId,
              name: tr.assigned_minister_name ?? choiceSnapshot.ministerName,
            })
            setAccountabilityBudgetStolen(tr.budget_stolen ?? 0)
            setAccountabilityResolved(false)
          }
          setTurnOverlayComplete(true)
          await appendOverlayItem({
            phase: 'complete',
            kind: 'status',
            title: 'TURN COMPLETE',
            body: `Turn ${tr.turn} complete. Review minister performance below.`,
            accent: '#22c55e',
            typed: true,
          }, { charMs: 14, gapMs: 50 })
          break
        }
        if (event.type === 'error') {
          setTurnError(`Turn error: ${event.message}`)
          setTurnOverlayPhase('complete')
          setTurnOverlayComplete(true)
          await appendOverlayItem({
            phase: 'complete',
            kind: 'error',
            title: 'STREAM ERROR',
            body: event.message,
            accent: '#f87171',
            typed: true,
          }, { charMs: 12, gapMs: 50 })
          break
        }

        if (event.type === 'announcement') {
          setTurnOverlayPhase('announcement')
          sound.play('breaking')
          const pol = event.policy
          setExecutingPolicyName(pol.name)
          setAllHeadlines(prev => [...prev, {
            outlet: "MAYOR'S OFFICE",
            lean: 'mayor' as const,
            headline: `BREAKING: Mayor announces "${pol.name}" — led by ${event.minister_name}`,
            turnNum: streamTurnNum,
            isBreaking: true,
          }])
          await appendOverlayItem({
            phase: 'announcement',
            kind: 'headline',
            title: 'POLICY BROADCAST',
            body: `${pol.name} announced. ${event.minister_name} is leading execution under ${event.minister_portfolio}.`,
            accent: '#e8a030',
            typed: true,
          }, { charMs: 14 })
        }

        if (event.type === 'announcement_voices' || event.type === 'implementation_voices') {
          setTurnOverlayPhase('reactions')
          const voices = event.voices
          setAllVoices(prev => [...prev, ...voices.map(v => ({ ...v, turnNum: streamTurnNum }))])
          for (const voice of voices) {
            const accent =
              voice.sentiment === 'approve' ? '#22c55e'
                : voice.sentiment === 'disapprove' ? '#f87171'
                  : '#e8a030'
            await appendOverlayItem({
              phase: 'reactions',
              kind: 'voice',
              title: `PUBLIC PULSE · ${voice.name.toUpperCase()}`,
              body: voice.reaction,
              accent,
              typed: true,
            }, { charMs: 11, gapMs: 150 })
          }
        }

        if (event.type === 'assignment') {
          setTurnOverlayPhase('assignment')
          await appendOverlayItem({
            phase: 'assignment',
            kind: 'status',
            title: 'CABINET COMMAND',
            body: `${event.minister_name} assigned · Competence ${event.competence}% · Loyalty ${event.loyalty}% · Risk ${event.scandal_exposure}%.`,
            accent: '#7dd3fc',
            typed: false,
          })
        }

        if (event.type === 'evaluation') {
          setTurnOverlayPhase('evaluation')
          setTurnOverlayExecutionPct(Math.round(event.execution_pct))
          setAllHeadlines(prev => [...prev, {
            outlet: 'WIRE SERVICE',
            lean: 'neutral' as const,
            headline: `Implementation: ${event.execution_pct}% delivered${event.leakage_cr > 1 ? ` · ₹${event.leakage_cr.toFixed(1)}Cr leaked` : ''}`,
            turnNum: streamTurnNum,
          }])
          const topDelta = Object.entries(event.city_param_deltas ?? {})
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
          await appendOverlayItem({
            phase: 'evaluation',
            kind: 'analysis',
            title: 'FIELD ASSESSMENT',
            body: `Projected execution ${event.execution_pct}%${event.leakage_cr > 1 ? ` · leakage ₹${event.leakage_cr.toFixed(1)} Cr` : ''}${topDelta ? ` · strongest effect ${humanize(topDelta[0])} ${topDelta[1] >= 0 ? '+' : ''}${Math.round(topDelta[1])}` : ''}.`,
            accent: '#60a5fa',
            typed: false,
          })
          if (event.reasoning) {
            await appendOverlayItem({
              phase: 'evaluation',
              kind: 'analysis',
              title: 'MODEL ANALYSIS',
              body: event.reasoning,
              accent: '#93c5fd',
              typed: true,
            }, { charMs: 10, gapMs: 180 })
          }
        }

        if (event.type === 'dilemma') {
          setTurnOverlayPhase('evaluation')
          await appendOverlayItem({
            phase: 'evaluation',
            kind: 'headline',
            title: 'FIELD REPORT',
            body: event.situation,
            accent: '#fbbf24',
            typed: true,
          }, { charMs: 16, gapMs: 200 })
          // Show dilemma options — stream 1 ends after this event
          receivedDilemma = true
          setDilemmaOptions({
            situation: event.situation,
            option_a: event.option_a,
            option_b: event.option_b,
          })
          // Don't break — the stream will end naturally after this event
        }

        if (event.type === 'dilemma_resolved') {
          setDilemmaOptions(null)
          const sign = event.effect_delta >= 0 ? '+' : ''
          await appendOverlayItem({
            phase: 'evaluation',
            kind: 'status',
            title: 'DECISION APPLIED',
            body: `${event.label} — ${humanize(event.effect_key)} ${sign}${event.effect_delta.toFixed(1)}`,
            accent: event.effect_delta >= 0 ? '#22c55e' : '#f87171',
            typed: false,
          })
        }

        if (event.type === 'ideology_update') {
          setGameState(prev => ({ ...prev, ideology_track: event.track as Record<string, number> }))
          if (event.passive_unlocked) {
            const passiveName = String(event.passive_unlocked).replace(/_/g, ' ').replace(/(\d)/, ' $1')
            await appendOverlayItem({
              phase: 'evaluation',
              kind: 'status',
              title: 'IDEOLOGY PASSIVE UNLOCKED',
              body: passiveName.toUpperCase(),
              accent: '#a78bfa',
              typed: false,
            })
          }
        }

        if (event.type === 'power_move_applied') {
          setGameState(prev => ({ ...prev, political_capital: event.political_capital_after as number }))
          await appendOverlayItem({
            phase: 'announcement',
            kind: 'status',
            title: 'POWER MOVE',
            body: `${String(event.move_type).replace(/_/g, ' ').toUpperCase()} — ${event.effect_summary} (−${event.pc_cost} PC)`,
            accent: '#a855f7',
            typed: true,
          }, { charMs: 14, gapMs: 200 })
        }

        if (event.type === 'pc_earned') {
          setGameState(prev => ({ ...prev, political_capital: event.total as number }))
          const reasons = (event.reasons as string[]).join(', ')
          await appendOverlayItem({
            phase: 'debrief',
            kind: 'status',
            title: 'POLITICAL CAPITAL',
            body: `+${event.amount} PC earned (${reasons}). Total: ${event.total}`,
            accent: '#a855f7',
            typed: false,
          })
        }

        if (event.type === 'wellbeing_update') {
          setTurnOverlayPhase('evaluation')
          const upCount = event.ward_report.filter(w => w.trend === 'up').length
          const downCount = event.ward_report.filter(w => w.trend === 'down').length
          await appendOverlayItem({
            phase: 'evaluation',
            kind: 'analysis',
            title: 'WELLBEING UPDATE',
            body: `${upCount} groups improving · ${downCount} groups declining.`,
            accent: upCount >= downCount ? '#22c55e' : '#f87171',
            typed: false,
          })
        }

        if (event.type === 'approval_vote') {
          setTurnOverlayPhase('poll')
          const voice = event.voice
          const weight = event.population_weight
          // Kick the crowd into "polling" on the first vote of this turn.
          if (voteBus.phase !== 'polling') voteBus.setPhase('polling')
          voteBus.emitVote({ voice, weight })
          sound.play(voice.sentiment === 'approve' ? 'vote_up' : voice.sentiment === 'disapprove' ? 'vote_down' : 'phase', { throttleMs: 90 })
          setAllVoices(prev => [...prev, { ...voice, turnNum: streamTurnNum }])
          totalWeight += weight
          if (voice.sentiment === 'approve') approveWeight += weight
          if (totalWeight > 0) {
            setTurnOverlayApprovalPct(Math.round((approveWeight / totalWeight) * 100))
          }
          await appendOverlayItem({
            phase: 'poll',
            kind: 'voice',
            title: `POLL VOTE · ${voice.name.toUpperCase()}`,
            body: `${voice.sentiment.toUpperCase()} (${weight.toFixed(2)} wt) — ${voice.reaction}`,
            accent: voice.sentiment === 'approve' ? '#22c55e' : voice.sentiment === 'disapprove' ? '#f87171' : '#e8a030',
            typed: false,
          }, { gapMs: 110 })
        }

        if (event.type === 'approval_final') {
          setTurnOverlayPhase('poll')
          voteBus.setPhase('done')
          const before = Math.round(event.approval_before)
          const after = Math.round(event.approval)
          sound.play(after >= before ? 'win' : 'crisis')
          const dir = after >= before ? '↑' : '↓'
          const bd = event.breakdown
          // Stash breakdown so it can be attached to TurnEntry when complete fires
          pendingVoteBreakdownRef.current = { approve: bd.approve, disapprove: bd.disapprove, total: bd.total }
          // Update live approval so top bar reflects result before complete event fires
          setLiveApproval(after)
          setTurnOverlayApprovalPct(after)
          setAllHeadlines(prev => [...prev, {
            outlet: 'PULSE',
            lean: after >= before ? 'mayor' as const : 'opposition' as const,
            headline: `Approval ${dir} ${before}% → ${after}% | ${bd.approve} approve · ${bd.disapprove} disapprove (${bd.total} polled)`,
            turnNum: streamTurnNum,
          }])
          await appendOverlayItem({
            phase: 'poll',
            kind: 'status',
            title: 'MANDATE SHIFT',
            body: `Approval ${dir} ${before}% → ${after}% · ${bd.approve} approve / ${bd.disapprove} disapprove (${bd.total} votes).`,
            accent: after >= before ? '#22c55e' : '#f87171',
            typed: true,
          }, { charMs: 11, gapMs: 160 })
        }

        if (event.type === 'events') {
          setTurnOverlayPhase('events')
          const evts = event.events_triggered
          if (evts.length > 0) {
            setAllHeadlines(prev => [...prev, {
              outlet: 'ALERT',
              lean: 'opposition' as const,
              headline: `${evts.length} event(s): ${evts.map(e => e.name).join(', ')}`,
              turnNum: streamTurnNum,
            }])
            for (const ev of evts) {
              await appendOverlayItem({
                phase: 'events',
                kind: 'event',
                title: ev.type === 'crisis' ? 'CRISIS TRIGGERED' : 'OPPORTUNITY OPENED',
                body: `${ev.name} · severity ${Math.round(ev.severity)} · ${ev.turns_remaining} turn(s)`,
                accent: ev.type === 'crisis' ? '#f87171' : '#22c55e',
                typed: false,
              })
            }
          } else {
            await appendOverlayItem({
              phase: 'events',
              kind: 'status',
              title: 'CITY SHOCKWAVE',
              body: 'No new events triggered this turn.',
              accent: '#64748b',
              typed: false,
            })
          }
        }

        if (event.type === 'event_response_prompt') {
          receivedEventResponsePrompt = true
          setEventResponseOptions(event.options as unknown as EventResponseOption[])
        }

        if (event.type === 'event_response_applied') {
          await appendOverlayItem({
            phase: 'events',
            kind: 'status',
            title: 'EVENT RESPONSE',
            body: event.effect as string,
            accent: '#22c55e',
            typed: true,
          }, { charMs: 14, gapMs: 160 })
        }

        if (event.type === 'narrative_chunk') {
          setTurnOverlayPhase('debrief')
          if (event.key === 'headlines' && Array.isArray(event.value)) {
            const headlines = event.value as MediaHeadline[]
            setAllHeadlines(prev => [...prev, ...headlines.map(h => ({ ...h, turnNum: streamTurnNum }))])
            for (const h of headlines) {
              await appendOverlayItem({
                phase: 'debrief',
                kind: 'headline',
                title: `MEDIA · ${h.outlet.toUpperCase()}`,
                body: h.headline,
                accent: h.lean === 'mayor' ? '#22c55e' : h.lean === 'opposition' ? '#f87171' : '#60a5fa',
                typed: true,
              }, { charMs: 11, gapMs: 140 })
            }
          }
          if (event.key === 'delivery' && typeof event.value === 'string') {
            await appendOverlayItem({
              phase: 'debrief',
              kind: 'analysis',
              title: 'ON THE GROUND',
              body: event.value,
              accent: '#7dd3fc',
              typed: true,
            }, { charMs: 11, gapMs: 160 })
          }
          if (event.key === 'advisor' && typeof event.value === 'string') {
            await appendOverlayItem({
              phase: 'debrief',
              kind: 'analysis',
              title: 'ADVISOR DEBRIEF',
              body: event.value,
              accent: '#e8a030',
              typed: true,
            }, { charMs: 11, gapMs: 160 })
          }
        }
      }

      // ── Dilemma pause: wait for player choice, then resume stream 2 ──
      if (receivedDilemma) {
        // Wait for the player to click Option A or Option B via a Promise
        const dilemmaChoice = await new Promise<'a' | 'b'>((resolve) => {
          dilemmaResolverRef.current = resolve
        })
        dilemmaResolverRef.current = null
        setDilemmaOptions(null)

        // Resume turn with stream 2
        for await (const rawEvent of resolveDilemmaStream(gameId, dilemmaChoice)) {
          const rawType = typeof rawEvent.type === 'string' ? rawEvent.type : ''
          if (rawType === 'game_over') {
            setGameState(rawEvent.state as GameState)
            setGameOver(true)
            setTurnOverlayPhase('complete')
            setTurnOverlayComplete(true)
            await appendOverlayItem({
              phase: 'complete', kind: 'error', title: 'GAME OVER',
              body: String(rawEvent.loss_reason ?? 'Loss condition reached.'),
              accent: '#f87171', typed: true,
            }, { charMs: 12, gapMs: 50 })
            break
          }

          const event = rawEvent as unknown as TurnStreamV2Event

          if (event.type === 'complete') {
            const tr = event.turn_result as TurnResult
            const newState = event.state as GameState
            setGameState(newState)
            setLastTurn(tr)
            const newEntry: TurnEntry = {
              turn: tr.turn, result: tr, expanded: true,
              voteBreakdown: pendingVoteBreakdownRef.current ?? undefined,
              choice: choiceSnapshot,
            }
            pendingVoteBreakdownRef.current = null
            setTurnHistory(prev => [newEntry, ...prev.map(e => ({ ...e, expanded: false }))])
            setPolicyOptions(null)
            setDiscussingPolicyIndex(null)
            setPolicyError(null)
            setTurnOverlayTreasuryDelta((tr.tax_revenue ?? 0) - (tr.major_policy?.budget_cost ?? 0) - (tr.interest_paid ?? 0) - (tr.budget_stolen ?? 0))
            setTurnOverlayApprovalPct(Math.round(tr.interim_approval))
            const now2 = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            setChatMessages(prev => [...prev, {
              isMayor: false, sender: 'SYSTEM', senderRole: '',
              text: `── Turn ${tr.turn} complete · ${tr.major_policy?.name ?? 'Policy'} · Approval ${Math.round(tr.approval_before ?? 0)}% → ${Math.round(tr.interim_approval)}% ──`,
              time: now2, ringColor: '#1c3652', seed: 'system', isSystem: true,
            }])
            activeConsultRef.current = null
            const turnNum = tr.turn
            if ((tr.media_headlines ?? []).length > 0) {
              setAllHeadlines(prev => [...prev, ...(tr.media_headlines ?? []).map(h => ({ ...h, turnNum }))])
            }
            if ((tr.citizen_voices ?? []).length > 0 && !allVoices.some(v => v.turnNum === turnNum)) {
              setAllVoices(prev => [...prev, ...(tr.citizen_voices ?? []).map(v => ({ ...v, turnNum }))])
            }
            if (event.game_over) {
              setGameOver(true)
              if (event.scorecard) setScorecard(event.scorecard as GovernanceScorecard)
            }
            if (event.forecast) setTurnForecast(event.forecast as TurnForecast)
            setTurnOverlayPhase('complete')
            if (!event.game_over) {
              setAccountabilityMinister({
                id: tr.assigned_minister_id ?? choiceSnapshot.ministerId,
                name: tr.assigned_minister_name ?? choiceSnapshot.ministerName,
              })
              setAccountabilityBudgetStolen(tr.budget_stolen ?? 0)
              setAccountabilityResolved(false)
            }
            setTurnOverlayComplete(true)
            await appendOverlayItem({
              phase: 'complete', kind: 'status', title: 'TURN COMPLETE',
              body: `Turn ${tr.turn} complete. Review minister performance below.`,
              accent: '#22c55e', typed: true,
            }, { charMs: 14, gapMs: 50 })
            break
          }
          if (event.type === 'error') {
            setTurnError(`Turn error: ${event.message}`)
            setTurnOverlayPhase('complete')
            setTurnOverlayComplete(true)
            await appendOverlayItem({
              phase: 'complete', kind: 'error', title: 'STREAM ERROR',
              body: event.message, accent: '#f87171', typed: true,
            }, { charMs: 12, gapMs: 50 })
            break
          }

          // Re-use the same event handlers for stream 2 events
          if (event.type === 'dilemma_resolved') {
            setDilemmaOptions(null)
            const sign = event.effect_delta >= 0 ? '+' : ''
            await appendOverlayItem({
              phase: 'evaluation', kind: 'status', title: 'DECISION APPLIED',
              body: `${event.label} — ${humanize(event.effect_key)} ${sign}${event.effect_delta.toFixed(1)}`,
              accent: event.effect_delta >= 0 ? '#22c55e' : '#f87171', typed: false,
            })
          }
          if (event.type === 'ideology_update') {
            setGameState(prev => ({ ...prev, ideology_track: event.track as Record<string, number> }))
            if (event.passive_unlocked) {
              const passiveName = String(event.passive_unlocked).replace(/_/g, ' ').replace(/(\d)/, ' $1')
              await appendOverlayItem({
                phase: 'evaluation', kind: 'status', title: 'IDEOLOGY PASSIVE UNLOCKED',
                body: passiveName.toUpperCase(), accent: '#a78bfa', typed: false,
              })
            }
          }
          if (event.type === 'power_move_applied') {
            setGameState(prev => ({ ...prev, political_capital: event.political_capital_after as number }))
            await appendOverlayItem({
              phase: 'announcement', kind: 'status', title: 'POWER MOVE',
              body: `${String(event.move_type).replace(/_/g, ' ').toUpperCase()} — ${event.effect_summary} (−${event.pc_cost} PC)`,
              accent: '#a855f7', typed: true,
            }, { charMs: 14, gapMs: 200 })
          }
          if (event.type === 'pc_earned') {
            setGameState(prev => ({ ...prev, political_capital: event.total as number }))
            const reasons = (event.reasons as string[]).join(', ')
            await appendOverlayItem({
              phase: 'debrief', kind: 'status', title: 'POLITICAL CAPITAL',
              body: `+${event.amount} PC earned (${reasons}). Total: ${event.total}`,
              accent: '#a855f7', typed: false,
            })
          }
          if (event.type === 'wellbeing_update') {
            setTurnOverlayPhase('evaluation')
            const upCount = event.ward_report.filter(isBrightSpot).length
            const downCount = event.ward_report.filter(isHotspot).length
            await appendOverlayItem({
              phase: 'evaluation', kind: 'analysis', title: 'WELLBEING UPDATE',
              body: `${upCount} groups improving · ${downCount} groups declining.`,
              accent: upCount >= downCount ? '#22c55e' : '#f87171', typed: false,
            })
          }
          if (event.type === 'announcement_voices' || event.type === 'implementation_voices') {
            setTurnOverlayPhase('reactions')
            const voices = event.voices
            setAllVoices(prev => [...prev, ...voices.map(v => ({ ...v, turnNum: streamTurnNum }))])
            for (const voice of voices) {
              const accent = voice.sentiment === 'approve' ? '#22c55e' : voice.sentiment === 'disapprove' ? '#f87171' : '#e8a030'
              await appendOverlayItem({
                phase: 'reactions', kind: 'voice', title: `PUBLIC PULSE · ${voice.name.toUpperCase()}`,
                body: voice.reaction, accent, typed: true,
              }, { charMs: 11, gapMs: 150 })
            }
          }
          if (event.type === 'approval_vote') {
            setTurnOverlayPhase('poll')
            const voice = event.voice
            const weight = event.population_weight
            if (voteBus.phase !== 'polling') voteBus.setPhase('polling')
            voteBus.emitVote({ voice, weight })
            sound.play(voice.sentiment === 'approve' ? 'vote_up' : voice.sentiment === 'disapprove' ? 'vote_down' : 'phase', { throttleMs: 90 })
            setAllVoices(prev => [...prev, { ...voice, turnNum: streamTurnNum }])
            totalWeight += weight
            if (voice.sentiment === 'approve') approveWeight += weight
            if (totalWeight > 0) setTurnOverlayApprovalPct(Math.round((approveWeight / totalWeight) * 100))
            await appendOverlayItem({
              phase: 'poll', kind: 'voice', title: `POLL VOTE · ${voice.name.toUpperCase()}`,
              body: `${voice.sentiment.toUpperCase()} (${weight.toFixed(2)} wt) — ${voice.reaction}`,
              accent: voice.sentiment === 'approve' ? '#22c55e' : voice.sentiment === 'disapprove' ? '#f87171' : '#e8a030',
              typed: false,
            }, { gapMs: 110 })
          }
          if (event.type === 'approval_final') {
            setTurnOverlayPhase('poll')
            voteBus.setPhase('done')
            const before = Math.round(event.approval_before)
            const after = Math.round(event.approval)
            sound.play(after >= before ? 'win' : 'crisis')
            const dir = after >= before ? '↑' : '↓'
            const bd = event.breakdown
            pendingVoteBreakdownRef.current = { approve: bd.approve, disapprove: bd.disapprove, total: bd.total }
            setLiveApproval(after)
            setTurnOverlayApprovalPct(after)
            await appendOverlayItem({
              phase: 'poll', kind: 'status', title: 'MANDATE SHIFT',
              body: `Approval ${dir} ${before}% → ${after}% · ${bd.approve} approve / ${bd.disapprove} disapprove (${bd.total} votes).`,
              accent: after >= before ? '#22c55e' : '#f87171', typed: false,
            })
          }
          if (event.type === 'events') {
            setTurnOverlayPhase('events')
            for (const ev of event.events_triggered ?? []) {
              const isC = ev.type === 'crisis'
              if (isC) sound.play('crisis', { throttleMs: 400 })
              await appendOverlayItem({
                phase: 'events', kind: 'headline',
                title: isC ? 'CRISIS TRIGGERED' : 'OPPORTUNITY',
                body: `${ev.name} · severity ${ev.severity} · ${ev.turns_remaining} turns remaining`,
                accent: isC ? '#f87171' : '#22c55e', typed: true,
              }, { charMs: 12, gapMs: 120 })
            }
          }
          if (event.type === 'event_response_prompt') {
            receivedEventResponsePrompt = true
            setEventResponseOptions(event.options as unknown as EventResponseOption[])
          }
          if (event.type === 'event_response_applied') {
            await appendOverlayItem({
              phase: 'events', kind: 'status', title: 'EVENT RESPONSE',
              body: event.effect,
              accent: '#22c55e', typed: true,
            }, { charMs: 14, gapMs: 160 })
          }
          if (event.type === 'narrative_chunk') {
            setTurnOverlayPhase('debrief')
            if (event.key === 'headlines' && Array.isArray(event.value)) {
              for (const h of event.value.filter(isMediaHeadline)) {
                await appendOverlayItem({
                  phase: 'debrief', kind: 'headline', title: `MEDIA · ${h.outlet.toUpperCase()}`,
                  body: h.headline, accent: '#93c5fd', typed: true,
                }, { charMs: 11, gapMs: 160 })
              }
            }
            if (event.key === 'delivery' && typeof event.value === 'string') {
              await appendOverlayItem({
                phase: 'debrief', kind: 'analysis', title: 'ON THE GROUND',
                body: event.value, accent: '#7dd3fc', typed: true,
              }, { charMs: 11, gapMs: 160 })
            }
            if (event.key === 'advisor' && typeof event.value === 'string') {
              await appendOverlayItem({
                phase: 'debrief', kind: 'analysis', title: 'ADVISOR DEBRIEF',
                body: event.value, accent: '#e8a030', typed: true,
              }, { charMs: 11, gapMs: 160 })
            }
          }
        }
      }

      // ── Event Response pause: wait for player choices, then resume stream 3 ──
      if (receivedEventResponsePrompt) {
        const eventResponses = await new Promise<{ event_id: string; strategy: string; minister_id?: string }[]>((resolve) => {
          eventResponseResolverRef.current = resolve
        })
        eventResponseResolverRef.current = null
        setEventResponseOptions(null)

        // Resume turn with stream 3
        for await (const rawEvent of resolveEventResponseStream(gameId, eventResponses)) {
          const rawType = typeof rawEvent.type === 'string' ? rawEvent.type : ''
          if (rawType === 'game_over') {
            setGameState(rawEvent.state as GameState)
            setGameOver(true)
            setTurnOverlayPhase('complete')
            setTurnOverlayComplete(true)
            await appendOverlayItem({
              phase: 'complete', kind: 'error', title: 'GAME OVER',
              body: String(rawEvent.loss_reason ?? 'Loss condition reached.'),
              accent: '#f87171', typed: true,
            }, { charMs: 12, gapMs: 50 })
            break
          }

          const event = rawEvent as unknown as TurnStreamV2Event

          if (event.type === 'complete') {
            const tr = event.turn_result as TurnResult
            const newState = event.state as GameState
            setGameState(newState)
            setLastTurn(tr)
            const newEntry: TurnEntry = {
              turn: tr.turn, result: tr, expanded: true,
              voteBreakdown: pendingVoteBreakdownRef.current ?? undefined,
              choice: choiceSnapshot,
            }
            pendingVoteBreakdownRef.current = null
            setTurnHistory(prev => [newEntry, ...prev.map(e => ({ ...e, expanded: false }))])
            setPolicyOptions(null)
            setDiscussingPolicyIndex(null)
            setPolicyError(null)
            setTurnOverlayTreasuryDelta((tr.tax_revenue ?? 0) - (tr.major_policy?.budget_cost ?? 0) - (tr.interest_paid ?? 0) - (tr.budget_stolen ?? 0))
            setTurnOverlayApprovalPct(Math.round(tr.interim_approval))
            const now3 = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            setChatMessages(prev => [...prev, {
              isMayor: false, sender: 'SYSTEM', senderRole: '',
              text: `── Turn ${tr.turn} complete · ${tr.major_policy?.name ?? 'Policy'} · Approval ${Math.round(tr.approval_before ?? 0)}% → ${Math.round(tr.interim_approval)}% ──`,
              time: now3, ringColor: '#1c3652', seed: 'system', isSystem: true,
            }])
            activeConsultRef.current = null
            const turnNum = tr.turn
            if ((tr.media_headlines ?? []).length > 0) {
              setAllHeadlines(prev => [...prev, ...(tr.media_headlines ?? []).map(h => ({ ...h, turnNum }))])
            }
            if ((tr.citizen_voices ?? []).length > 0 && !allVoices.some(v => v.turnNum === turnNum)) {
              setAllVoices(prev => [...prev, ...(tr.citizen_voices ?? []).map(v => ({ ...v, turnNum }))])
            }
            if (event.game_over) {
              setGameOver(true)
              if (event.scorecard) setScorecard(event.scorecard as GovernanceScorecard)
            }
            if (event.forecast) setTurnForecast(event.forecast as TurnForecast)
            setTurnOverlayPhase('complete')
            if (!event.game_over) {
              setAccountabilityMinister({
                id: tr.assigned_minister_id ?? choiceSnapshot.ministerId,
                name: tr.assigned_minister_name ?? choiceSnapshot.ministerName,
              })
              setAccountabilityBudgetStolen(tr.budget_stolen ?? 0)
              setAccountabilityResolved(false)
            }
            setTurnOverlayComplete(true)
            await appendOverlayItem({
              phase: 'complete', kind: 'status', title: 'TURN COMPLETE',
              body: `Turn ${tr.turn} complete. Review minister performance below.`,
              accent: '#22c55e', typed: true,
            }, { charMs: 14, gapMs: 50 })
            break
          }
          if (event.type === 'error') {
            setTurnError(`Turn error: ${event.message}`)
            setTurnOverlayPhase('complete')
            setTurnOverlayComplete(true)
            await appendOverlayItem({
              phase: 'complete', kind: 'error', title: 'STREAM ERROR',
              body: event.message, accent: '#f87171', typed: true,
            }, { charMs: 12, gapMs: 50 })
            break
          }

          if (event.type === 'event_response_applied') {
            await appendOverlayItem({
              phase: 'events', kind: 'status', title: 'EVENT RESPONSE',
              body: event.effect,
              accent: '#22c55e', typed: true,
            }, { charMs: 14, gapMs: 160 })
          }
          if (event.type === 'power_move_applied') {
            setGameState(prev => ({ ...prev, political_capital: event.political_capital_after as number }))
            await appendOverlayItem({
              phase: 'announcement', kind: 'status', title: 'POWER MOVE',
              body: `${String(event.move_type).replace(/_/g, ' ').toUpperCase()} — ${event.effect_summary} (−${event.pc_cost} PC)`,
              accent: '#a855f7', typed: true,
            }, { charMs: 14, gapMs: 200 })
          }
          if (event.type === 'pc_earned') {
            setGameState(prev => ({ ...prev, political_capital: event.total as number }))
            const reasons = (event.reasons as string[]).join(', ')
            await appendOverlayItem({
              phase: 'debrief', kind: 'status', title: 'POLITICAL CAPITAL',
              body: `+${event.amount} PC earned (${reasons}). Total: ${event.total}`,
              accent: '#a855f7', typed: false,
            })
          }
          if (event.type === 'narrative_chunk') {
            setTurnOverlayPhase('debrief')
            if (event.key === 'headlines' && Array.isArray(event.value)) {
              for (const h of event.value.filter(isMediaHeadline)) {
                await appendOverlayItem({
                  phase: 'debrief', kind: 'headline', title: `MEDIA · ${h.outlet.toUpperCase()}`,
                  body: h.headline, accent: '#93c5fd', typed: true,
                }, { charMs: 11, gapMs: 160 })
              }
            }
            if (event.key === 'delivery' && typeof event.value === 'string') {
              await appendOverlayItem({
                phase: 'debrief', kind: 'analysis', title: 'ON THE GROUND',
                body: event.value, accent: '#7dd3fc', typed: true,
              }, { charMs: 11, gapMs: 160 })
            }
            if (event.key === 'advisor' && typeof event.value === 'string') {
              await appendOverlayItem({
                phase: 'debrief', kind: 'analysis', title: 'ADVISOR DEBRIEF',
                body: event.value, accent: '#e8a030', typed: true,
              }, { charMs: 11, gapMs: 160 })
            }
          }
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[handleSelectMinister] Turn failed:', e)
      setTurnError(`Turn execution failed: ${errMsg}`)
      setTurnOverlayPhase('complete')
      setTurnOverlayItems(prev => [...prev, {
        id: ++turnOverlayItemIdRef.current,
        phase: 'complete',
        kind: 'error',
        title: 'STREAM FAILURE',
        body: `Turn execution failed: ${errMsg}`,
        accent: '#f87171',
        typed: false,
        displayText: `Turn execution failed: ${errMsg}`,
        done: true,
      }])
      setTurnOverlayComplete(true)
    } finally {
      setIsTurnExecuting(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const cp = gameState.city_params
  const wf = deriveWelfare(cp)
  const wd = lastTurn?.city_params_after && lastTurn?.city_params_before
    ? welfareDelta(lastTurn.city_params_after, lastTurn.city_params_before)
    : { health: 0, wealth: 0, safety: 0, social: 0 }

  const welfareStats: WelfareStat[] = [
    { label: 'Health', score: wf.health, delta: wd.health, color: '#22c55e', icon: '♥' },
    { label: 'Wealth', score: wf.wealth, delta: wd.wealth, color: '#38bdf8', icon: '◈' },
    { label: 'Safety', score: wf.safety, delta: wd.safety, color: '#f59e0b', icon: '⬡' },
    { label: 'Society', score: wf.social, delta: wd.social, color: '#f87171', icon: '✦' },
  ]

  const treasury = gameState.treasury
  const initTreasury = initialTreasury.current
  const spent = Math.max(0, initTreasury - treasury)
  const spentPct = initTreasury > 0 ? Math.min(100, (spent / initTreasury) * 100) : 0

  // Use liveApproval (from approval_final event) when available for real-time top bar update
  const approval = liveApproval ?? gameState.interim_approval
  // Delta vs previous turn's end. prevTurnApprovalRef is frozen at each turn start so it
  // doesn't chase liveApproval — avoids the delta collapsing to 0 after complete fires.
  // Null on the very first turn (no prior turn) → delta hidden.
  const approvalDelta = prevTurnApprovalRef.current !== null
    ? approval - prevTurnApprovalRef.current
    : 0
  const crises = gameState.active_events.filter(e => e.type === 'crisis')
  const opportunities = gameState.active_events.filter(e => e.type === 'opportunity')
  const allCrises: ActiveEvent[] = [...crises, ...opportunities]

  const streamImg = lastTurn?.major_policy
    ? (PORTFOLIO_IMG[lastTurn.major_policy.portfolio] ?? DEFAULT_IMG)
    : DEFAULT_IMG
  const streamTitle = lastTurn?.major_policy?.name ?? (crises[0]?.name ?? 'City Overview')
  const streamLocation = lastTurn?.major_policy?.portfolio ?? crises[0]?.portfolio ?? ''

  const streamEffects = lastTurn?.actual_deltas
    ? Object.entries(lastTurn.actual_deltas)
      .filter(([, v]) => Math.abs(v as number) >= 1)
      .sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))
      .slice(0, 3)
      .map(([k, v]) => ({
        label: `${k.replace(/_/g, ' ')} ${(v as number) >= 0 ? '+' : ''}${Math.round(v as number)}`,
        color: (v as number) >= 0 ? '#22c55e' : '#f87171',
        up: (v as number) >= 0,
      }))
    : []

  // Use last turn's ward report if available, fall back to state snapshot (no-delta baseline)
  const wardReport: WardReportEntry[] = lastTurn?.ward_report ?? gameState.ward_report ?? []

  // Compute which group types have 2–8 unique values (meaningful to filter on)
  const groupTypeCounts: Record<string, Set<string>> = {}
  for (const entry of wardReport) {
    if (!groupTypeCounts[entry.group_type]) groupTypeCounts[entry.group_type] = new Set()
    groupTypeCounts[entry.group_type].add(entry.group_name)
  }
  const filterableTypes = Object.entries(groupTypeCounts)
    .filter(([, names]) => names.size >= 2 && names.size <= 8)
    .map(([type]) => type)

  const leanColor = (lean: string) =>
    lean === 'mayor' ? '#22c55e' : lean === 'opposition' ? '#f87171' : '#60a5fa'
  const leanBg = (lean: string) =>
    lean === 'mayor' ? '#991b1b' : lean === 'opposition' ? '#1e40af' : '#065f46'
  const sentimentRing = (s: string) =>
    s === 'approve' ? '#22c55e' : s === 'disapprove' ? '#f87171' : '#e8a030'

  const medianDecisionLatency = median(
    turnTelemetryRows
      .map(r => r.timeToDecisionMs)
      .filter((v): v is number => typeof v === 'number')
  )
  const medianTurnDuration = median(turnTelemetryRows.map(r => r.turnDurationMs))
  const medianOverlayDwell = median(
    turnTelemetryRows
      .map(r => r.overlayDwellMs)
      .filter(v => v > 0)
  )
  const avgDecisionsPerTurn = turnTelemetryRows.length > 0
    ? turnTelemetryRows.reduce((s, r) => s + r.decisionCount, 0) / turnTelemetryRows.length
    : 0
  const recentChoiceNames = turnChoices.slice(-10).map(c => c.policyName.trim().toLowerCase())
  const duplicateChoices = recentChoiceNames.length - new Set(recentChoiceNames).size
  const policyRepeatRate = recentChoiceNames.length > 0 ? (duplicateChoices / recentChoiceNames.length) * 100 : 0

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden"
      style={{ background: '#050d1b', color: '#fff', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* Modals */}

      {/* Briefing loading overlay */}
      {briefingLoading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(5,13,27,0.95)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 560, maxWidth: '92vw' }}>
            {/* Title */}
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              fontSize: 22, letterSpacing: '0.12em', color: '#e8a030',
              textAlign: 'center', marginBottom: 16,
            }}>
              CITY BRIEFING — TURN {gameState.current_turn}
            </div>

            {briefingLines.length === 0 ? (() => {
              const snapshotItems = briefingTickerItems.filter(i => ['alert', 'good', 'crisis'].includes(i.type))
              const headlineItems = briefingTickerItems.filter(i => i.type === 'headline')
              const voiceItems = briefingTickerItems.filter(i => i.type === 'voice')
              const SectionLabel = ({ children }: { children: React.ReactNode }) => (
                <div style={{
                  fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 9,
                  letterSpacing: '0.2em', color: '#2d4a63',
                  borderBottom: '1px solid #1c3652',
                  paddingBottom: 4, marginBottom: 6,
                }}>
                  {children}
                </div>
              )
              return (
                /* ── Phase 1: Loading — progress bar + sectioned feed ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Progress bar */}
                  <div>
                    <div style={{
                      width: '100%', height: 3, background: '#0d1f33',
                      borderRadius: 2, overflow: 'hidden', marginBottom: 8,
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: 'linear-gradient(90deg, #1c3652, #e8a030)',
                        width: `${(briefingStage / 4) * 100}%`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontFamily: "'Rajdhani', sans-serif", fontSize: 9,
                    }}>
                      {(['Snapshot', 'Media', 'Chatter', 'Ministers'] as const).map((label, i) => (
                        <span key={label} style={{
                          color: briefingStage > i ? '#e8a030' : briefingStage === i ? '#7dd3fc' : '#1c3652',
                          fontWeight: 700, letterSpacing: '0.1em',
                        }}>
                          {briefingStage > i ? '✓ ' : briefingStage === i ? '● ' : '○ '}{label.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Sectioned feed panel */}
                  <div style={{
                    ...PANEL,
                    padding: '12px 16px',
                    maxHeight: 300, overflowY: 'auto',
                    display: 'flex', flexDirection: 'column', gap: 0,
                    position: 'relative',
                  }}>
                    {/* ── CITY SNAPSHOT section ── */}
                    {snapshotItems.length > 0 && (
                      <div style={{ marginBottom: 10, animation: 'briefingFadeIn 0.3s ease' }}>
                        <SectionLabel>CITY SNAPSHOT</SectionLabel>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                          {snapshotItems.map(item => (
                            <div key={item.id} style={{
                              fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
                              color: item.type === 'crisis' ? '#f87171' : item.type === 'alert' ? '#f59e0b' : '#22c55e',
                              animation: 'briefingFadeIn 0.3s ease',
                              padding: '2px 0',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>{item.text}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── MEDIA section ── */}
                    {headlineItems.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <SectionLabel>MEDIA</SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {headlineItems.map(item => (
                            <div key={item.id} style={{
                              fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
                              borderLeft: '2px solid rgba(96,165,250,0.3)',
                              paddingLeft: 8, color: '#60a5fa',
                              animation: 'briefingFadeIn 0.3s ease',
                              lineHeight: 1.4,
                            }}>{item.text}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── CITY CHATTER section ── */}
                    {voiceItems.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <SectionLabel>CITY CHATTER</SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {voiceItems.map(item => (
                            <div key={item.id} style={{
                              fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
                              borderLeft: '2px solid rgba(167,139,250,0.3)',
                              paddingLeft: 8, color: '#a78bfa',
                              fontStyle: 'italic',
                              animation: 'briefingFadeIn 0.3s ease',
                              lineHeight: 1.5,
                            }}>{item.text}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {briefingTickerItems.length === 0 && (
                      <div style={{
                        fontSize: 11, color: '#5a8fc0', textAlign: 'center', padding: '24px 0',
                        fontFamily: "'Share Tech Mono', monospace",
                        animation: 'pulse 2s ease-in-out infinite',
                      }}>Scanning city systems...</div>
                    )}

                    <div ref={briefingTickerEndRef} />

                    {/* ── Status bar — pinned at bottom, never an inline item ── */}
                    {briefingStage >= 1 && briefingStage <= 3 && (
                      <div style={{
                        position: 'sticky', bottom: 0,
                        background: 'linear-gradient(0deg, #091422 60%, transparent)',
                        paddingTop: 10, marginTop: 4,
                        display: 'flex', alignItems: 'center', gap: 7,
                        fontFamily: "'Rajdhani', sans-serif", fontSize: 10,
                        fontWeight: 700, letterSpacing: '0.12em',
                        color: '#2d6a8a',
                      }}>
                        <div style={{
                          width: 5, height: 5, borderRadius: '50%', background: '#2d6a8a',
                          animation: 'pulse 1.4s ease-in-out infinite', flexShrink: 0,
                        }} />
                        {briefingStage === 1 ? 'SCANNING MEDIA OUTLETS...'
                          : briefingStage === 2 ? 'LISTENING TO CITY CHATTER...'
                          : 'ASSEMBLING MINISTER BRIEFING...'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })() : (
              /* ── Phase 2: Minister scene — left-aligned chat thread ── */
              <div
                ref={briefingSceneScrollRef}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 18,
                  maxHeight: 380, overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {/* Section header */}
                {briefingVisibleLines.length > 0 && (
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 9,
                    letterSpacing: '0.2em', color: '#2d4a63',
                    borderBottom: '1px solid #1c3652',
                    paddingBottom: 4,
                    animation: 'briefingFadeIn 0.5s ease',
                  }}>MINISTER BRIEFING</div>
                )}
                {briefingVisibleLines.map((entry, idx) => {
                  const mIdx = gameState.ministers.findIndex(m => m.name === entry.minister_name)
                  const col = MINISTER_COLORS[mIdx >= 0 ? mIdx % MINISTER_COLORS.length : idx % MINISTER_COLORS.length]
                  return (
                    <div key={idx} style={{
                      display: 'flex', gap: 14, alignItems: 'flex-start',
                      animation: 'briefingFadeIn 0.5s ease',
                    }}>
                      {/* Avatar */}
                      <div style={{ flexShrink: 0 }}>
                        <AgentAvatar seed={entry.minister_name} ministers={gameState.ministers} size={56} ring={col} />
                      </div>
                      {/* Name + bubble */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{entry.minister_name}</span>
                          <span style={{
                            marginLeft: 8,
                            fontSize: 10, color: col,
                            fontFamily: "'Rajdhani', sans-serif",
                            letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase',
                          }}>{entry.portfolio}</span>
                        </div>
                        <div style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${col}33`,
                          borderLeft: `3px solid ${col}`,
                          borderRadius: 6,
                          padding: '12px 16px',
                          fontSize: 13, color: '#e2e8f0',
                          lineHeight: 1.65, fontStyle: 'italic',
                        }}>
                          &ldquo;{entry.typewriterText}&rdquo;
                          {!entry.done && (
                            <span style={{ animation: 'pulse 0.8s infinite' }}>▌</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Policy handoff line — after all ministers done */}
                {briefingVisibleLines.length > 0 && briefingVisibleLines.every(e => e.done) && (
                  <div style={{
                    textAlign: 'center', fontSize: 12, color: '#7ba8d1',
                    fontFamily: "'Share Tech Mono', monospace",
                    animation: 'briefingFadeIn 0.6s ease',
                    paddingTop: 4,
                  }}>
                    We have reviewed the situation and prepared policy options for your consideration.
                  </div>
                )}

                {/* Policy drafting spinner — shows after ministers finish, before thinking block appears */}
                {ministersDone && !briefingThinking && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 4 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      border: '2px solid #1c3652', borderTopColor: '#e8a030',
                      animation: 'spin 1s linear infinite',
                    }} />
                    <span style={{ fontSize: 11, color: '#7ba8d1', fontFamily: "'Share Tech Mono', monospace" }}>
                      DRAFTING POLICIES...
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Model thinking / reasoning stream — only shown after ministers finish */}
            {briefingThinking && ministersDone && (
              <div ref={briefingThinkingRef} style={{
                ...PANEL, padding: '10px 14px', marginTop: 10,
                maxHeight: 160, overflowY: 'auto',
              }}>
                <div style={{
                  ...HDR_LABEL, fontSize: 10, marginBottom: 6,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {briefingStage < 4 && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#e8a030',
                      animation: 'pulse 1s ease-in-out infinite',
                    }} />
                  )}
                  MODEL REASONING
                </div>
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 11, color: '#64748b', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {reasoningBlocks.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {reasoningBlocks.map((block, idx) => {
                        if (block.kind === 'header') {
                          const headerText = (block.raw || '').toUpperCase()
                          const isPolicyHeader = headerText.startsWith('POLICY ')
                          return (
                            <div key={`h-${idx}`} style={{
                              color: isPolicyHeader ? '#f0c040' : '#8bb7e5',
                              fontSize: isPolicyHeader ? 11 : 10,
                              fontFamily: "'Rajdhani', sans-serif",
                              letterSpacing: '0.08em',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              marginTop: idx === 0 ? 0 : (isPolicyHeader ? 8 : 2),
                              paddingTop: isPolicyHeader ? 6 : 0,
                              borderTop: isPolicyHeader ? '1px solid rgba(232,160,48,0.25)' : 'none',
                            }}>
                              {renderReasoningInline(block.parts, `h-${idx}`)}
                            </div>
                          )
                        }

                        if (block.kind === 'bullet') {
                          return (
                            <div key={`b-${idx}`} style={{
                              display: 'grid',
                              gridTemplateColumns: '10px 1fr',
                              gap: 6,
                              alignItems: 'start',
                            }}>
                              <span style={{ color: '#e8a030', fontSize: 10, lineHeight: 1.5 }}>•</span>
                              <span style={{ color: '#9eb2c8' }}>
                                {renderReasoningInline(block.parts, `b-${idx}`)}
                              </span>
                            </div>
                          )
                        }

                        return (
                          <div key={`t-${idx}`} style={{ color: '#94a3b8' }}>
                            {renderReasoningInline(block.parts, `t-${idx}`)}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    briefingThinking
                  )}
                </div>

                {/* Pulsing status bar — same pattern as Phase 1, shows which policy is being drafted */}
                {briefingStage < 4 && currentPolicyIdx > 0 && (
                  <div style={{
                    position: 'sticky', bottom: 0,
                    background: 'linear-gradient(0deg, #091422 80%, transparent)',
                    paddingTop: 8,
                    display: 'flex', alignItems: 'center', gap: 7,
                    fontFamily: "'Rajdhani', sans-serif", fontSize: 10,
                    fontWeight: 700, letterSpacing: '0.12em',
                    color: '#2d6a8a',
                  }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%', background: '#2d6a8a',
                      animation: 'pulse 1.4s ease-in-out infinite', flexShrink: 0,
                    }} />
                    {`DRAFTING POLICY OPTION ${currentPolicyIdx}...`}
                  </div>
                )}
              </div>
            )}
          </div>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg) } }
            @keyframes briefingFadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
            @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
          `}</style>
        </div>
      )}

      <TurnExecutionOverlay
        open={turnOverlayOpen}
        collapsed={pollPhase === 'polling' && turnOverlayPaceMode === 'cinematic'}
        canDismiss={turnOverlayComplete}
        phase={turnOverlayPhase}
        items={turnOverlayItems}
        policyName={executingPolicyName}
        executionPct={turnOverlayExecutionPct}
        approvalPct={turnOverlayApprovalPct}
        treasuryDelta={turnOverlayTreasuryDelta}
        paceMode={turnOverlayPaceMode}
        onPaceModeChange={setTurnOverlayPaceMode}
        onDismiss={handleDismissTurnOverlay}
        accountabilityResolved={accountabilityResolved}
        accountabilityMinister={accountabilityMinister}
        accountabilityBudgetStolen={accountabilityBudgetStolen}
        accountabilityLoading={accountabilityLoading}
        onAccountability={handleAccountability}
        dilemmaOptions={dilemmaOptions}
        onDilemmaChoice={(choice) => { if (dilemmaResolverRef.current) dilemmaResolverRef.current(choice) }}
        eventResponseOptions={eventResponseOptions}
        onEventResponses={(responses) => { if (eventResponseResolverRef.current) eventResponseResolverRef.current(responses) }}
        ministers={gameState.ministers}
      />

      {gameOver && scorecard && <ScorecardOverlay sc={scorecard} />}

      {/* Minister Info Popup — rendered as fixed overlay but visually near left panel */}
      {expandedMinisterId && (() => {
        const mIdx = gameState.ministers.findIndex(m => m.id === expandedMinisterId)
        const m = gameState.ministers[mIdx]
        if (!m) return null
        const col = MINISTER_COLORS[mIdx % MINISTER_COLORS.length]
        return (
          <div
            onClick={() => setExpandedMinisterId(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              // No full backdrop — just a very subtle dim so the panel stays visible
              background: 'rgba(5,13,27,0.35)',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                // Anchor left panel width (380px) + 8px gap + 8px outer padding
                left: 396, top: 60,
                width: 300, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                background: '#0a1929', border: `1px solid ${col}55`,
                borderTop: `3px solid ${col}`, borderRadius: 8,
                boxShadow: `0 0 40px ${col}25, 0 12px 40px rgba(0,0,0,0.7)`,
                padding: '14px 16px 16px',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              {/* Header: avatar + name + close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AgentAvatar seed={m.name} ministers={gameState?.ministers || []} size={44} ring={col} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.01em', lineHeight: 1.2 }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: col, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.06em', marginTop: 2 }}>{m.portfolio}</div>
                  {m.extra_portfolios?.map(p => (
                    <span key={p} style={{ fontSize: 8, color: '#e8a030', marginRight: 4, background: 'rgba(232,160,48,0.1)', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(232,160,48,0.25)' }}>+{p}</span>
                  ))}
                </div>
                <button
                  onClick={() => setExpandedMinisterId(null)}
                  style={{ fontSize: 16, color: '#7bb3d4', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}
                >✕</button>
              </div>

              {/* Demographics */}
              {m.demographics && (
                <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.6, background: 'rgba(255,255,255,0.02)', borderRadius: 5, padding: '7px 10px', border: '1px solid #1c3652' }}>
                  {[m.demographics.profession, m.demographics.age_group, m.demographics.location, m.demographics.income_bracket].filter(Boolean).join('  ·  ')}
                </div>
              )}

              {/* ── CORE STATS ── */}
              <div>
                <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', fontWeight: 700, color: col, marginBottom: 8 }}>CORE ATTRIBUTES</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { label: 'COMPETENCE', value: m.capability?.competence != null ? Math.round(m.capability.competence) : '—', color: '#38bdf8' },
                    { label: 'ALIGNMENT', value: (m.mayor_alignment > 0 ? '+' : '') + Math.round(m.mayor_alignment), color: m.mayor_alignment > 20 ? '#22c55e' : m.mayor_alignment < -20 ? '#f87171' : '#94a3b8' },
                    { label: 'INTEGRITY', value: m.personality?.['integrity'] != null ? Math.round(m.personality['integrity']) : '—', color: '#a78bfa' },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '8px 4px', border: '1px solid #1c3652' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Share Tech Mono', monospace", color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 9, color: '#7bb3d4', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── DERIVED STATUS ── */}
              <div>
                <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>POLITICAL STATUS</div>
                {[
                  { label: 'Loyalty', value: m.loyalty, color: '#22c55e' },
                  { label: 'Political Capital', value: m.political_capital ?? 50, color: '#38bdf8' },
                  { label: 'Scandal Exposure', value: m.scandal_exposure, color: m.scandal_exposure > 50 ? '#f87171' : '#fb923c' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', width: 120, flexShrink: 0, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>{s.label}</span>
                    <div style={{ flex: 1, height: 5, background: '#071422', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, s.value))}%`, background: s.color, borderRadius: 3, transition: 'width 0.3s ease', boxShadow: `0 0 8px ${s.color}50` }} />
                    </div>
                    <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono', monospace", color: s.color, width: 26, textAlign: 'right', fontWeight: 700 }}>{Math.round(s.value)}</span>
                  </div>
                ))}
              </div>

              {/* ── PERSONALITY TRAITS ── */}
              {m.personality && Object.keys(m.personality).length > 0 && (
                <div>
                  <div style={{ fontSize: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>PERSONALITY</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {Object.entries(m.personality).filter(([t]) => t !== 'integrity').map(([trait, val]) => {
                      const v = Math.round(val as number)
                      const barColor = v > 65 ? '#22c55e' : v < 35 ? '#f87171' : '#60a5fa'
                      return (
                        <div key={trait} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 10, color: '#94a3b8', width: 120, flexShrink: 0, textTransform: 'capitalize' }}>{trait.replace(/_/g, ' ')}</span>
                          <div style={{ flex: 1, height: 4, background: '#071422', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${v}%`, background: barColor, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: barColor, width: 26, textAlign: 'right', fontWeight: 700 }}>{v}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 9, color: '#6b9cc9', textAlign: 'center', fontStyle: 'italic' }}>Click outside to close</div>
            </div>
          </div>
        )
      })()}
      {showPolicyModal && policyOptions && (
        <PolicyModal
          options={policyOptions}
          ministers={gameState.ministers}
          onSelect={handleSelectPolicy}
          onDiscuss={handleDiscussPolicy}
          onClose={() => { if (!isTurnExecuting) { setShowPolicyModal(false); setPolicyOptions(null); setPolicyError(null); setDiscussingPolicyIndex(null) } }}
          loading={isTurnExecuting}
          error={turnError}
          treasury={gameState.treasury}
        />
      )}
      {showMinisterPicker && pendingPolicyIndex !== null && policyOptions && (
        <MinisterPickerModal
          policy={policyOptions[pendingPolicyIndex]}
          ministers={gameState.ministers}
          onSelect={handleSelectMinister}
          agencyEnabled={GAMEPLAY_V2_AGENCY}
          minorAction={GAMEPLAY_V2_AGENCY ? selectedMinorAction : { type: 'governance_upkeep', target: 'admin_efficiency', budget: 0 }}
          onMinorActionChange={setSelectedMinorAction}
          counterFrame={GAMEPLAY_V2_AGENCY ? selectedCounterFrame : 'Delivery Receipts'}
          onCounterFrameChange={setSelectedCounterFrame}
          politicalCapital={gameState.political_capital ?? 15}
          activeEvents={(gameState.active_events ?? []).map(e => ({ id: e.id, name: e.name, type: e.type }))}
          selectedPowerMove={selectedPowerMove}
          onPowerMoveChange={setSelectedPowerMove}
          onBack={() => { setShowMinisterPicker(false); setShowPolicyModal(true) }}
        />
      )}

      {/* ── TOP BAR ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 shrink-0"
        style={{
          height: 52, background: 'linear-gradient(90deg, #071320 0%, #0a1828 40%, #071320 100%)',
          borderBottom: '1px solid #1c3652', boxShadow: '0 2px 20px rgba(0,0,0,0.5)', zIndex: 10
        }}>

        {/* Emblem + City */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center justify-center rounded-full shrink-0" style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #92400e 100%)',
            boxShadow: '0 0 12px rgba(217,119,6,0.5), inset 0 1px 1px rgba(255,255,255,0.2)',
            border: '1.5px solid #f59e0b', fontSize: 16,
          }}>🏛</div>
          <div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15,
              color: '#f0c040', letterSpacing: '0.06em', textShadow: '0 0 12px rgba(240,192,64,0.5)'
            }}>
              City of {gameState.city_name}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0 rounded" style={{
                fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                letterSpacing: '0.1em', color: '#e8a030',
                background: 'rgba(232,160,48,0.12)', border: '1px solid rgba(232,160,48,0.25)',
              }}>TERM 1</span>
              <ChevronRight size={9} color="#4b6280" />
              <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: '#7ba8d1' }}>
                Turn {gameState.current_turn} / {gameState.total_turns}
              </span>
            </div>
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Budget */}
        <div className="flex-1 max-w-md">
          <div className="flex items-center justify-between mb-1">
            <span style={{
              fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              letterSpacing: '0.2em', color: '#7ba8d1'
            }}>BUDGET</span>
            <span style={{
              fontSize: 9, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              letterSpacing: '0.12em', color: '#7ba8d1'
            }}>FISCAL YEAR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <span style={{ fontSize: 12, fontWeight: 700, ...MONO('#f87171') }}>
                ₹{fmtNum(spent)} Cr
              </span>
              <span style={{ fontSize: 9, color: '#64748b' }}>Spent</span>
            </div>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: '#071018' }}>
              <div className="h-full rounded-full" style={{
                width: `${spentPct}%`,
                background: 'linear-gradient(90deg, #dc2626, #f59e0b)',
                boxShadow: '0 0 6px rgba(245,158,11,0.5)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span style={{ fontSize: 9, color: '#64748b' }}>Left</span>
              <span style={{ fontSize: 12, fontWeight: 700, ...MONO('#4ade80') }}>
                ₹{fmtNum(Math.max(0, treasury))} Cr
              </span>
            </div>
          </div>
        </div>

        {/* Political Capital */}
        <div className="flex flex-col gap-0.5 shrink-0" style={{ minWidth: 50 }}>
          <div style={{
            fontSize: 8, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
            letterSpacing: '0.15em', color: '#a78bfa',
          }}>POLITICAL CAPITAL</div>
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 9, color: '#a78bfa' }}>🛡</span>
            <span style={{ fontSize: 14, fontWeight: 700, ...MONO('#a78bfa'), lineHeight: 1 }}>
              {Math.round(gameState.political_capital ?? 0)}
            </span>
            <span style={{ fontSize: 9, color: '#64748b' }}>/50</span>
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Mayor Approval */}
        <div className="flex flex-col gap-1 shrink-0" style={{ minWidth: 120 }}>
          <div style={{
            fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
            color: '#7ba8d1', fontWeight: 700,
          }}>MAYOR APPROVAL</div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 20, fontWeight: 700, ...MONO('#f0c040'), lineHeight: 1 }}>
              {Math.round(approval)}%
            </span>
            {approvalDelta !== 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: approvalDelta >= 0 ? '#4ade80' : '#f87171',
                fontFamily: "'Share Tech Mono', monospace",
              }}>
                {approvalDelta >= 0 ? '▲+' : '▼'}{Math.round(approvalDelta)}%
              </span>
            )}
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, approval))}%`,
              background: approval >= 50 ? '#22c55e' : approval >= 35 ? '#f59e0b' : '#f87171',
              borderRadius: 2,
              transition: 'width 0.7s ease',
            }} />
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Ideology Track */}
        {gameState.ideology_track && Object.values(gameState.ideology_track).some(v => v > 0) && (
          <div className="flex flex-col gap-1 shrink-0" style={{ minWidth: 100 }}>
            <div style={{
              fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em',
              color: '#7ba8d1', fontWeight: 700,
            }}>IDEOLOGY</div>
            <div className="flex gap-1">
              {([
                ['pragmatist', '#60a5fa', 'P'],
                ['populist', '#f87171', 'O'],
                ['institutionalist', '#fbbf24', 'I'],
                ['strongman', '#94a3b8', 'S'],
              ] as const).map(([key, color, letter]) => {
                const count = gameState.ideology_track[key] || 0
                if (count === 0) return null
                return (
                  <div key={key} title={`${key}: ${count} choices (passive at 2, 4)`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      padding: '1px 5px', borderRadius: 3,
                      background: `${color}18`, border: `1px solid ${color}40`,
                    }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color, fontFamily: "'Rajdhani', sans-serif" }}>{letter}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "'Share Tech Mono', monospace" }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="h-8 w-px" style={{ background: '#1c3652' }} />

        {/* Controls */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {canPlayNextTurn && (
            <button
              onClick={handlePlayNextTurn}
              className="shrink-0"
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 7,
                border: '1px solid rgba(255, 205, 96, 0.75)',
                background: 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)',
                color: '#1a1200',
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
                textTransform: 'uppercase',
              }}
              title={`Start turn ${gameState.current_turn} briefing`}
            >
              Play Next Turn
            </button>
          )}
          {[{ Icon: Clock, label: 'History' }, { Icon: HelpCircle, label: 'Help' }, { Icon: Settings, label: 'Settings' }]
            .map(({ Icon, label }) => (
              <button key={label} title={label}
                className="flex items-center justify-center rounded transition-all"
                style={{
                  width: 30, height: 30, background: 'rgba(255,255,255,0.04)', border: '1px solid #1c3652',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#e8a030'; e.currentTarget.style.background = 'rgba(232,160,48,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1c3652'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}>
                <Icon size={13} color="#4b6280" />
              </button>
            ))}
          <button title={isMuted ? 'Play Music' : 'Mute Music'} onClick={toggleMusic}
            className="flex items-center justify-center rounded transition-all"
            style={{
              width: 30, height: 30,
              background: isMuted ? 'rgba(255,255,255,0.04)' : 'rgba(232,160,48,0.15)',
              border: isMuted ? '1px solid #1c3652' : '1px solid rgba(232,160,48,0.4)',
              cursor: 'pointer'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#e8a030'; e.currentTarget.style.background = 'rgba(232,160,48,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = isMuted ? '#1c3652' : 'rgba(232,160,48,0.4)'; e.currentTarget.style.background = isMuted ? 'rgba(255,255,255,0.04)' : 'rgba(232,160,48,0.15)' }}>
            {isMuted ? <VolumeX size={13} color="#4b6280" /> : <Volume2 size={13} color="#e8a030" />}
          </button>
          <audio ref={audioRef} src={TRACKS[currentTrackIndex]} onEnded={nextTrack} preload="auto" />
        </div>
      </div>

      <div style={{
        borderBottom: '1px solid #1c3652',
        background: 'rgba(7,19,32,0.92)',
        padding: '5px 12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(100px, 1fr))',
        gap: 10,
      }}>
        <div style={{ fontSize: 9, color: '#7ba8d1' }}>
          <span style={{ color: '#4b6280', marginRight: 6 }}>Decisions/Turn</span>
          <strong style={{ color: avgDecisionsPerTurn >= 3 ? '#22c55e' : '#f87171' }}>
            {turnTelemetryRows.length > 0 ? avgDecisionsPerTurn.toFixed(1) : '—'}
          </strong>
          <span style={{ color: '#4b6280', marginLeft: 4 }}>(target ≥3)</span>
        </div>
        <div style={{ fontSize: 9, color: '#7ba8d1' }}>
          <span style={{ color: '#4b6280', marginRight: 6 }}>Decision Latency</span>
          <strong style={{ color: medianDecisionLatency !== null && medianDecisionLatency <= 20000 ? '#22c55e' : '#f87171' }}>
            {medianDecisionLatency === null ? '—' : `${Math.round(medianDecisionLatency / 1000)}s`}
          </strong>
          <span style={{ color: '#4b6280', marginLeft: 4 }}>(target ≤20s)</span>
        </div>
        <div style={{ fontSize: 9, color: '#7ba8d1' }}>
          <span style={{ color: '#4b6280', marginRight: 6 }}>Policy Repeat</span>
          <strong style={{ color: policyRepeatRate < 35 ? '#22c55e' : '#f87171' }}>
            {turnChoices.length > 0 ? `${policyRepeatRate.toFixed(0)}%` : '—'}
          </strong>
          <span style={{ color: '#4b6280', marginLeft: 4 }}>(target &lt;35%)</span>
        </div>
        <div style={{ fontSize: 9, color: '#7ba8d1' }}>
          <span style={{ color: '#4b6280', marginRight: 6 }}>Median Turn</span>
          <strong style={{ color: '#60a5fa' }}>
            {medianTurnDuration === null ? '—' : `${Math.round(medianTurnDuration / 1000)}s`}
          </strong>
        </div>
        <div style={{ fontSize: 9, color: '#7ba8d1' }}>
          <span style={{ color: '#4b6280', marginRight: 6 }}>Overlay Dwell</span>
          <strong style={{ color: '#60a5fa' }}>
            {medianOverlayDwell === null ? '—' : `${Math.round(medianOverlayDwell / 1000)}s`}
          </strong>
        </div>
        <div style={{ fontSize: 9, color: '#7ba8d1' }}>
          <span style={{ color: '#4b6280', marginRight: 6 }}>Pace Mode</span>
          <strong style={{ color: '#e8a030', textTransform: 'uppercase' }}>{turnOverlayPaceMode}</strong>
        </div>
      </div>

      {/* Policy error bar (outside modal, e.g. if modal closed before error) */}
      {policyError && !showPolicyModal && (
        <div style={{
          background: 'rgba(248,113,113,0.1)', borderBottom: '1px solid #7f1d1d',
          padding: '6px 16px', fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertTriangle size={13} />
          {policyError}
          <button onClick={() => setPolicyError(null)} style={{
            marginLeft: 'auto', background: 'none',
            border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14
          }}>✕</button>
        </div>
      )}

      {/* ── MAIN 3-COLUMN ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-2 p-2 overflow-hidden min-h-0">

        {/* ── LEFT: Advisory Chat / Game Feed tabs + Crises ───────────────── */}
        <div className="w-[380px] flex flex-col gap-2 shrink-0" style={{ position: 'relative' }}>

          {/* Tab bar */}
          <div className="flex shrink-0" style={{ gap: 4 }}>
            {([['advisors', '⚡ ADVISORS'], ['feed', '▶ GAME FEED']] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 6,
                  border: `1px solid ${leftTab === tab ? '#e8a03066' : '#1c3652'}`,
                  background: leftTab === tab ? 'rgba(232,160,48,0.1)' : 'rgba(255,255,255,0.02)',
                  color: leftTab === tab ? '#f0c040' : '#7ba8d1',
                  fontSize: 10, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: '0.12em', cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Advisory Chat Panel */}
          <div className="flex flex-col" style={{ ...PANEL, minHeight: 500, display: leftTab === 'advisors' ? 'flex' : 'none' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: '1px solid #1c3652', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-2">
                <Zap size={12} color="#e8a030" />
                <span style={HDR_LABEL}>SC ADVISORY CHAT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px #22c55e' }} />
                <span className="text-green-400" style={{ fontSize: 10 }}>Online</span>
              </div>
            </div>

            {/* Minister List */}
            <div style={{ borderBottom: '1px solid #1c3652' }}>
              {/* Minister grid — 3 per row, max 2 rows */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
              }}>
                {gameState.ministers.slice(0, 6).map((m, idx) => {
                  const col = MINISTER_COLORS[idx % MINISTER_COLORS.length]
                  const isExpanded = expandedMinisterId === m.id
                  return (
                    <div
                      key={m.id}
                      onClick={() => setExpandedMinisterId(isExpanded ? null : m.id)}
                      className="flex flex-col items-center cursor-pointer transition-colors"
                      style={{
                        padding: '10px 8px 8px',
                        gap: 4,
                        background: isExpanded ? 'rgba(255,255,255,0.05)' : '',
                        borderBottom: isExpanded ? `2px solid ${col}` : '2px solid transparent',
                        borderRight: (idx % 3 < 2) ? '1px solid rgba(28,54,82,0.3)' : 'none',
                      }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '' }}
                    >
                      <AgentAvatar seed={m.name} ministers={gameState?.ministers || []} size={36} ring={col} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: isExpanded ? '#fff' : '#94a3b8', textAlign: 'center', lineHeight: 1.2, width: '100%' }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: 9, color: col, textAlign: 'center', lineHeight: 1.1, opacity: 0.85, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
                        {m.portfolio}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Council hint */}
            <div style={{
              padding: '5px 12px', fontSize: 10, color: '#7bb3d4',
              background: 'rgba(232,160,48,0.03)', borderBottom: '1px solid rgba(28,54,82,0.4)',
              fontStyle: 'italic', lineHeight: 1.4
            }}>
              Click a minister to view their full profile. Use @name to address someone directly.
            </div>

            {/* Chat Messages */}
            <div className="overflow-y-auto space-y-2.5" style={{ height: 320, padding: '10px' }}>
              {chatMessages.map((msg, i) => msg.isSystem ? (
                <div key={i} style={{
                  textAlign: 'center', fontSize: 9, color: '#6b9cc9', fontStyle: 'italic',
                  padding: '4px 0', borderTop: '1px solid #1c3652', borderBottom: '1px solid #1c3652',
                  letterSpacing: '0.04em', margin: '2px 0',
                }}>{msg.text}</div>
              ) : (
                <div key={i} className="flex gap-2">
                  <div className="shrink-0 mt-0.5" style={{ width: 26, height: 26 }}>
                    {msg.isMayor ? (
                      <div className="rounded-full flex items-center justify-center text-white"
                        style={{
                          width: 26, height: 26,
                          background: `linear-gradient(135deg, ${msg.ringColor}, ${msg.ringColor}88)`,
                          fontSize: 9, fontWeight: 700, border: `1.5px solid ${msg.ringColor}`
                        }}>M</div>
                    ) : (
                      <AgentAvatar seed={msg.seed} ministers={gameState?.ministers || []} size={26} ring={msg.ringColor} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: 10, fontWeight: 700, color: msg.isMayor ? '#e8a030' : '#7dd3fc' }}>
                        {msg.sender}
                      </span>
                      {msg.senderRole && <span style={{ fontSize: 10, color: '#7bb3d4' }}>· {msg.senderRole}</span>}
                      <span style={{ fontSize: 9, color: '#6b9cc9', marginLeft: 'auto' }}>{msg.time}</span>
                    </div>
                    <div className="mt-1 px-2 py-1.5 rounded-lg" style={{
                      fontSize: 11,
                      color: msg.isSystemFallback ? '#475569' : '#c0cfe0',
                      fontStyle: msg.isSystemFallback ? 'italic' : undefined,
                      background: msg.isMayor ? 'rgba(216,160,48,0.1)' : 'rgba(255,255,255,0.05)',
                      borderLeft: `2px solid ${msg.ringColor}44`, lineHeight: 1.5,
                    }}>{msg.text}</div>
                  </div>
                </div>
              ))}
              {consultLoading && (
                <div className="flex gap-2 items-center">
                  <Loader2 size={14} color="#4b6280" className="animate-spin" />
                  <div style={{ fontSize: 11, color: '#7bb3d4', fontStyle: 'italic' }}>
                    Ministers are responding...
                  </div>
                </div>
              )}
              {chatError && (
                <div style={{
                  fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', background: 'rgba(248,113,113,0.08)', border: '1px solid #7f1d1d',
                  borderRadius: 4
                }}>
                  <AlertTriangle size={11} />
                  {chatError}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-2 py-2 flex gap-1.5" style={{ borderTop: '1px solid #1c3652' }}>
              <input
                type="text" value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !consultLoading && chatInput.trim() && handleSendMessage()}
                placeholder="Message the council... (@name to address directly)"
                disabled={consultLoading}
                className="flex-1 text-white placeholder-gray-600 focus:outline-none"
                style={{
                  background: '#071018', border: '1px solid #1c3652', borderRadius: 4,
                  padding: '5px 8px', fontSize: 11
                }}
                onFocus={e => (e.target.style.borderColor = '#e8a030')}
                onBlur={e => (e.target.style.borderColor = '#1c3652')}
              />
              <button onClick={handleSendMessage}
                disabled={!chatInput.trim() || consultLoading}
                className="shrink-0 flex items-center justify-center transition-all"
                style={{
                  background: 'linear-gradient(135deg, #c47d10, #e8a030)', borderRadius: 4,
                  width: 30, height: 30, boxShadow: '0 0 8px rgba(232,160,48,0.4)',
                  opacity: (!chatInput.trim() || consultLoading) ? 0.4 : 1,
                  cursor: (!chatInput.trim() || consultLoading) ? 'not-allowed' : 'pointer',
                  border: 'none'
                }}>
                {consultLoading ? <Loader2 size={13} color="white" className="animate-spin" /> : <Send size={13} color="white" />}
              </button>
              <button onClick={handleDraftPolicy} disabled={fetchingPolicies}
                className="shrink-0 text-xs px-2 transition-all"
                style={{
                  background: 'rgba(59,130,246,0.15)', border: '1px solid #1e40af', borderRadius: 4,
                  color: '#60a5fa', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                  fontFamily: "'Rajdhani', sans-serif",
                  opacity: fetchingPolicies ? 0.5 : 1, cursor: fetchingPolicies ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={e => { if (!fetchingPolicies) e.currentTarget.style.background = 'rgba(59,130,246,0.25)' }}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}>
                {fetchingPolicies ? <Loader2 size={10} className="animate-spin" /> : 'Draft Policy'}
              </button>
            </div>
          </div>

          {/* Game Feed Panel (moved from center; shown via tab) */}
          {leftTab === 'feed' && (
            <div style={PANEL} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center"
                    style={{ background: 'rgba(232,160,48,0.15)', border: '1px solid #92400e' }}>
                    <span style={{ color: '#e8a030', fontSize: 10 }}>▶</span>
                  </div>
                  <span style={HDR_LABEL}>GAME STREAM</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
                  style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #991b1b' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ boxShadow: '0 0 4px #f87171' }} />
                  <span style={{
                    color: '#f87171', fontSize: 9, fontWeight: 700,
                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em'
                  }}>LIVE</span>
                </div>
              </div>

              {/* Stream Image Banner */}
              <div className="relative shrink-0 overflow-hidden" style={{ height: 120, background: '#050d1b' }}>
                <img src={streamImg} alt={streamTitle} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(5,13,27,0.97) 0%, rgba(5,13,27,0.3) 55%, transparent 100%)' }} />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="text-white uppercase tracking-wide"
                    style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>
                    {streamTitle}
                  </div>
                  {streamLocation && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <MapPin size={10} color="#94a3b8" />
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{streamLocation}</span>
                    </div>
                  )}
                  {streamEffects.length > 0 && (
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      {streamEffects.map((effect, i) => (
                        <span key={i} className="flex items-center gap-1"
                          style={{
                            fontSize: 10, fontWeight: 700, color: effect.color,
                            fontFamily: "'Share Tech Mono', monospace"
                          }}>
                          <span style={{ fontSize: 8 }}>{effect.up ? '▲' : '▼'}</span>
                          {effect.label}
                        </span>
                      ))}
                      <button className="ml-auto flex items-center justify-center rounded transition-all"
                        style={{
                          width: 20, height: 20, background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
                        }}>
                        <Info size={11} color="#94a3b8" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Turn History */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {turnHistory.length === 0 && (
                  <div style={{ fontSize: 11, color: '#6b9cc9', textAlign: 'center', padding: '16px' }}>
                    No turns yet. Draft a policy to begin.
                  </div>
                )}
                {turnHistory.map((entry, i) => (
                  <TurnPhaseCard
                    key={entry.turn}
                    entry={entry}
                    ministers={gameState.ministers}
                    onToggle={() => setTurnHistory(prev =>
                      prev.map((e, j) => j === i ? { ...e, expanded: !e.expanded } : e)
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active Crises */}
          <div className="shrink-0" style={PANEL}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={11} color="#e8a030" />
                <span style={HDR_LABEL}>ACTIVE CRISES</span>
              </div>
              <ChevronRight size={14} color="#4b6280" />
            </div>
            <div className="p-2 space-y-1.5">
              {allCrises.length === 0 && (
                <div style={{ fontSize: 11, color: '#6b9cc9', textAlign: 'center', padding: '8px 0' }}>No active crises</div>
              )}
              {allCrises.slice(0, 3).map((crisis) => {
                const sv = severityLabel(crisis.severity)
                const CrisisIcon = crisis.type === 'crisis' ? (crisis.severity >= 60 ? AlertTriangle : TrendingDown) : Droplets
                return (
                  <div key={crisis.id}
                    className="flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(28,54,82,0.6)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                    <CrisisIcon size={14} color={sv.color} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-white truncate" style={{ fontSize: 11, fontWeight: 600 }}>{crisis.name}</div>
                      {crisis.portfolio && <div style={{ fontSize: 10, color: '#64748b' }}>{crisis.portfolio}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded" style={{
                        fontSize: 9, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif",
                        letterSpacing: '0.08em', color: sv.color, background: sv.bg, border: `1px solid ${sv.border}`,
                      }}>{sv.label}</span>
                      <span style={{ fontSize: 10, color: '#64748b' }}>{crisis.turns_remaining}T</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Next Turn Intelligence Brief */}
          {turnForecast && (
            <div className="shrink-0" style={{
              ...PANEL,
              border: '1px solid rgba(56,189,248,0.2)',
              background: 'linear-gradient(180deg, rgba(11,25,41,0.98) 0%, rgba(9,20,34,0.98) 100%)',
            }}>
              <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(56,189,248,0.12)' }}>
                <span style={{ fontSize: 12 }}>📡</span>
                <span style={{ ...HDR_LABEL, color: '#38bdf8' }}>INTELLIGENCE BRIEF</span>
              </div>
              <div className="p-2 space-y-1">
                {turnForecast.hotspots.map((h, i) => (
                  <div key={`h${i}`} className="flex items-start gap-2" style={{ padding: '3px 4px' }}>
                    <span style={{ fontSize: 10, flexShrink: 0 }}>⚠</span>
                    <span style={{ fontSize: 10, color: '#fca5a5', lineHeight: 1.4 }}>{h}</span>
                  </div>
                ))}
                {turnForecast.opportunities.map((o, i) => (
                  <div key={`o${i}`} className="flex items-start gap-2" style={{ padding: '3px 4px' }}>
                    <span style={{ fontSize: 10, flexShrink: 0 }}>💡</span>
                    <span style={{ fontSize: 10, color: '#86efac', lineHeight: 1.4 }}>{o}</span>
                  </div>
                ))}
                {turnForecast.pressure_note.map((p, i) => (
                  <div key={`p${i}`} className="flex items-start gap-2" style={{ padding: '3px 4px' }}>
                    <span style={{ fontSize: 10, flexShrink: 0 }}>🗳</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── CENTER: Welfare + Game Stream ──────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">

          {/* Election Countdown Banner */}
          {(() => {
            const turnsToElection = gameState.election_turn - gameState.current_turn
            if (turnsToElection > 2 || gameState.phase !== 'pre_election') return null
            const electionApproval = approval
            const approvalColor = electionApproval >= 55 ? '#4ade80' : electionApproval >= 45 ? '#f59e0b' : '#f87171'
            const label = turnsToElection <= 0 ? 'ELECTION THIS TURN' : turnsToElection === 1 ? 'ELECTION NEXT TURN' : 'ELECTION IN 2 TURNS'
            const borderColor = turnsToElection <= 0 ? '#f87171' : turnsToElection === 1 ? '#f59e0b' : '#e8a030'
            const bgColor = turnsToElection <= 0 ? 'rgba(248,113,113,0.08)' : 'rgba(232,160,48,0.06)'
            return (
              <div className="shrink-0" style={{
                background: bgColor,
                border: `1px solid ${borderColor}55`,
                borderRadius: 8, padding: '8px 12px',
                boxShadow: `0 0 12px ${borderColor}20`,
              }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 16 }}>🗳</span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, fontFamily: "'Rajdhani', sans-serif",
                      letterSpacing: '0.1em', color: borderColor, textTransform: 'uppercase',
                    }}>{label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: "'Share Tech Mono', monospace" }}>
                      Approval: <span style={{ color: approvalColor, fontWeight: 700 }}>{electionApproval.toFixed(1)}%</span>
                    </span>
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 4,
                      background: electionApproval >= 50 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                      border: `1px solid ${electionApproval >= 50 ? '#14532d' : '#7f1d1d'}`,
                      color: electionApproval >= 50 ? '#4ade80' : '#f87171',
                      fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.08em',
                    }}>
                      {electionApproval >= 50 ? 'ON TRACK TO WIN' : 'AT RISK — BELOW 50%'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-4 mt-1.5">
                  {[
                    { label: 'Health',  v: Math.round(wf.health) },
                    { label: 'Wealth',  v: Math.round(wf.wealth) },
                    { label: 'Safety',  v: Math.round(wf.safety) },
                    { label: 'Society', v: Math.round(wf.social) },
                  ].map(({ label: lbl, v }) => {
                    const c = v > 60 ? '#4ade80' : v > 40 ? '#f59e0b' : '#f87171'
                    return (
                      <span key={lbl} style={{ fontSize: 9, color: '#94a3b8', fontFamily: "'Share Tech Mono', monospace" }}>
                        {lbl}: <span style={{ color: c, fontWeight: 700 }}>{v}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Welfare Indicators */}
          <div style={PANEL} className="shrink-0">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-amber-400" style={{ boxShadow: '0 0 6px #f59e0b' }} />
                <span style={HDR_LABEL}>WELFARE INDICATORS</span>
              </div>
              <button
                onClick={() => setShowAllParams(p => !p)}
                className="flex items-center gap-1.5 px-2 py-1 rounded transition-all"
                style={{
                  border: '1px solid #1c3652', fontSize: 10, color: showAllParams ? '#e8a030' : '#4b6280',
                  fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em', background: showAllParams ? 'rgba(232,160,48,0.08)' : 'none', cursor: 'pointer'
                }}>
                {showAllParams ? 'Hide' : 'View All Parameters'} {showAllParams ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            </div>
            <div className="px-3 py-2 flex gap-2">
              {welfareStats.map(stat => {
                const scoreColor = stat.score >= 65 ? '#4ade80' : stat.score >= 40 ? '#f59e0b' : '#f87171'
                const deltaColor = stat.delta > 0 ? '#4ade80' : stat.delta < 0 ? '#f87171' : '#64748b'
                return (
                  <div key={stat.label} style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.025)', border: `1px solid ${stat.color}22`,
                    display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#64748b',
                      fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em', textTransform: 'uppercase',
                    }} className="truncate">{stat.icon} {stat.label}</span>
                    <span style={{
                      fontSize: 18, fontWeight: 700, lineHeight: 1, marginLeft: 'auto',
                      fontFamily: "'Share Tech Mono', monospace", color: scoreColor,
                    }}>{Math.round(stat.score)}</span>
                    {stat.delta !== 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: deltaColor, fontFamily: "'Share Tech Mono', monospace" }}>
                        {stat.delta > 0 ? `▲+${Math.round(stat.delta)}` : `▼${Math.round(stat.delta)}`}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {/* All Parameters Grid */}
            {showAllParams && (() => {
              const paramDeltas: Record<string, number> = {}
              if (lastTurn?.city_params_after && lastTurn?.city_params_before) {
                for (const [k, v] of Object.entries(lastTurn.city_params_after)) {
                  paramDeltas[k] = v - (lastTurn.city_params_before[k] ?? v)
                }
              }
              const barColor = (v: number) => v > 65 ? '#22c55e' : v > 35 ? '#f59e0b' : '#f87171'
              const groups: { label: string; params: [string, string][] }[] = [
                { label: 'HEALTH', params: [['hospitals_and_clinics', 'Hospitals & Clinics'], ['air_quality_and_pollution', 'Air Quality']] },
                { label: 'WEALTH', params: [['jobs_and_commerce', 'Jobs & Commerce'], ['affordable_housing', 'Affordable Housing']] },
                { label: 'SAFETY', params: [['police_and_emergency', 'Police & Emergency'], ['courts_and_legal', 'Courts & Legal']] },
                { label: 'SOCIETY', params: [['community_and_spaces', 'Community & Spaces'], ['schools_and_universities', 'Schools & Universities']] },
                { label: 'INFRASTRUCTURE', params: [['transit_and_roads', 'Transit & Roads'], ['water_power_sanitation', 'Water & Sanitation']] },
                { label: 'GOVERNANCE', params: [['admin_efficiency', 'Admin Efficiency'], ['anti_corruption', 'Anti-Corruption'], ['media_freedom', 'Media Freedom']] },
              ]
              return (
                <div style={{ borderTop: '1px solid #1c3652', padding: '8px 12px 10px' }}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                    {groups.map(g => (
                      <div key={g.label} className="mb-2">
                        <div style={{ ...HDR_LABEL, fontSize: 8, marginBottom: 4, color: '#6b7280' }}>{g.label}</div>
                        {g.params.map(([key, label]) => {
                          const val = (cp as unknown as Record<string, number>)[key] ?? 0
                          const delta = paramDeltas[key] ?? 0
                          const roundDelta = Math.round(delta)
                          // Compute total deferred delta for this param across all pending turns
                          const deferredTotal = Object.values(pendingDeltas).reduce((sum, turnDeltas) => sum + (turnDeltas[key] ?? 0), 0)
                          const roundDeferred = Math.round(deferredTotal * 10) / 10
                          return (
                            <div key={key} className="mb-1">
                              <div className="flex items-center gap-2" style={{ height: 18 }}>
                                <span style={{ fontSize: 9, color: '#94a3b8', width: 90, flexShrink: 0 }} className="truncate">{label}</span>
                                <MiniBar value={val} color={barColor(val)} width={50} />
                                <span style={{ fontSize: 9, ...MONO('#fff'), width: 20, textAlign: 'right' }}>{Math.round(val)}</span>
                                {roundDelta !== 0 && (
                                  <span style={{
                                    fontSize: 8, fontFamily: "'Share Tech Mono', monospace",
                                    color: roundDelta > 0 ? '#4ade80' : '#f87171'
                                  }}>
                                    {roundDelta > 0 ? `▲+${roundDelta}` : `▼${roundDelta}`}
                                  </span>
                                )}
                              </div>
                              {roundDeferred !== 0 && (
                                <div style={{ paddingLeft: 92, marginTop: -1 }}>
                                  <span style={{
                                    fontSize: 7, fontFamily: "'Share Tech Mono', monospace",
                                    color: roundDeferred > 0 ? '#67e8f9' : '#fda4af',
                                    background: roundDeferred > 0 ? 'rgba(103,232,249,0.08)' : 'rgba(253,164,175,0.08)',
                                    border: `1px solid ${roundDeferred > 0 ? 'rgba(103,232,249,0.2)' : 'rgba(253,164,175,0.2)'}`,
                                    borderRadius: 3, padding: '0px 4px', letterSpacing: '0.03em',
                                  }}>
                                    {roundDeferred > 0 ? `+${roundDeferred}` : `${roundDeferred}`} deferred
                                  </span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Living City Map */}
          <div style={PANEL} className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 12 }}>🏙</span>
                <span style={HDR_LABEL}>{gameState.city_name.toUpperCase()} — LIVE CITY VIEW</span>
              </div>
              <div className="flex items-center gap-2">
                {turnError && !turnOverlayOpen && (
                  <div style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    background: 'rgba(248,113,113,0.12)', border: '1px solid #7f1d1d',
                    borderRadius: 5, padding: '3px 8px', maxWidth: 420,
                  }}>
                    <span style={{ color: '#f87171', fontSize: 10 }} className="truncate">⚠ {turnError}</span>
                    <button
                      onClick={() => setTurnError(null)}
                      style={{
                        fontSize: 9, color: '#94a3b8', background: 'rgba(255,255,255,0.06)',
                        border: '1px solid #1c3652', borderRadius: 4, padding: '1px 6px', cursor: 'pointer',
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {(() => {
                  const crises = (gameState.active_events ?? []).filter(e => e.type === 'crisis').length
                  const opps = (gameState.active_events ?? []).filter(e => e.type === 'opportunity').length
                  return (
                    <div className="flex items-center gap-1.5">
                      {crises > 0 && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: '#f87171', fontFamily: "'Rajdhani', sans-serif",
                          letterSpacing: '0.08em', background: 'rgba(248,113,113,0.1)',
                          border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4, padding: '2px 7px',
                        }}>⚠ {crises} CRISIS{crises > 1 ? 'ES' : ''}</span>
                      )}
                      {opps > 0 && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: '#4ade80', fontFamily: "'Rajdhani', sans-serif",
                          letterSpacing: '0.08em', background: 'rgba(34,197,94,0.1)',
                          border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '2px 7px',
                        }}>✦ {opps} OPPORTUNIT{opps > 1 ? 'IES' : 'Y'}</span>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
            <div className="flex-1 min-h-0 relative" style={{ padding: 6 }}>
              <ApprovalMeter baseApproval={approval} />
              <CityMap
                cityName={gameState.city_name}
                wardReport={gameState.ward_report ?? []}
                activeEvents={gameState.active_events ?? []}
                avgWellbeing={gameState.avg_wellbeing}
                approval={approval}
                hoveredDistrict={hoveredDistrict}
                onHoverDistrict={setHoveredDistrict}
                overlay={(mapLayout) => (
                  gameState.citizens && gameState.citizens.length > 0
                    ? <CitizenCrowd citizens={gameState.citizens} layout={mapLayout} />
                    : null
                )}
              />
              {gameState.citizens && gameState.citizens.length > 0 && (
                <SpeechBubbleLayer citizens={gameState.citizens} layout={mapLayoutForBubbles} />
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Identity + Media + City Chatter ──────────────────────── */}
        <div className="w-[340px] flex flex-col gap-2 shrink-0 overflow-hidden min-h-0">

          {/* Trend sparklines (needs ≥2 turns) */}
          <HistoryCharts turns={historyTurns} />

          {/* Identity Groups */}
          <div style={{ ...PANEL, maxHeight: 380 }} className="shrink-0 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 6px #a855f7' }} />
                <span style={HDR_LABEL}>IDENTITY GROUPS</span>
              </div>
            </div>
            {/* Pill filter tabs */}
            <div className="px-3 py-1.5 shrink-0 flex gap-1 flex-wrap" style={{ borderBottom: '1px solid rgba(28,54,82,0.4)' }}>
              {filterableTypes.map(t => (
                <button
                  key={t}
                  onClick={() => { setIdentityFilter(t); setExpandedGroup(null) }}
                  style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    fontFamily: "'Rajdhani', sans-serif",
                    padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: 'none',
                    background: identityFilter === t ? '#a855f7' : 'rgba(168,85,247,0.12)',
                    color: identityFilter === t ? '#fff' : '#a855f7',
                    transition: 'all 0.15s',
                  }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="px-2 py-1.5 overflow-y-auto flex-1" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {wardReport
                .filter(e => e.group_type === identityFilter)
                .slice(0, 12)
                .map((entry, i) => {
                  const wb = Math.min(100, Math.max(0, entry.avg_wellbeing ?? 50))
                  const appr = Math.min(100, Math.max(0, entry.approval ?? 50))
                  const scoreColor = entry.hotspot ? '#f87171'
                    : entry.bright_spot ? '#a855f7'
                      : wb >= 65 ? '#22c55e'
                        : wb >= 45 ? '#f59e0b'
                          : '#f87171'
                  const apprColor = appr >= 60 ? '#22c55e' : appr >= 40 ? '#f59e0b' : '#f87171'
                  const trendIcon = entry.trend === 'up' ? '↑' : entry.trend === 'down' ? '↓' : '─'
                  const trendColor = entry.trend === 'up' ? '#22c55e' : entry.trend === 'down' ? '#f87171' : '#475569'
                  const groupKey = `${entry.group_type}:${entry.group_name}`
                  const isExpanded = expandedGroup === groupKey

                  // Per-turn history for this group from turnHistory
                  const groupHistory = isExpanded ? turnHistory.map(te => {
                    const wr = te.result.ward_report?.find(
                      e => e.group_type === entry.group_type && e.group_name === entry.group_name
                    )
                    return wr ? { turn: te.turn, wb: wr.avg_wellbeing, appr: wr.approval ?? 50, pulse: wr.pulse_summary || '' } : null
                  }).filter(Boolean) as { turn: number; wb: number; appr: number; pulse: string }[] : []

                  const isMapHovered = entry.group_type === 'location' && hoveredDistrict === entry.group_name
                  return (
                    <div key={i}
                      onClick={() => setExpandedGroup(isExpanded ? null : groupKey)}
                      onMouseEnter={() => { if (entry.group_type === 'location') setHoveredDistrict(entry.group_name) }}
                      onMouseLeave={() => { if (entry.group_type === 'location') setHoveredDistrict(null) }}
                      style={{
                        background: isExpanded ? 'rgba(30,41,59,0.7)' : isMapHovered ? 'rgba(30,41,59,0.55)' : 'rgba(15,23,42,0.4)',
                        borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                        border: `1px solid ${isMapHovered ? 'rgba(125,211,252,0.5)' : entry.hotspot ? 'rgba(248,113,113,0.3)' : entry.bright_spot ? 'rgba(168,85,247,0.3)' : 'rgba(51,65,85,0.5)'}`,
                        boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
                        transition: 'all 0.2s ease',
                      }}>
                      {/* Row 1: name + wellbeing score + trend */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span className="flex-1 truncate" style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1' }}>{entry.group_name}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Share Tech Mono', monospace", color: scoreColor }}>{Math.round(wb)}</span>
                        <span style={{ fontSize: 8, color: '#7ba8d1', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em', fontWeight: 600 }}>WB</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: trendColor, width: 14, textAlign: 'center' }}>{trendIcon}</span>
                      </div>
                      {/* Row 2: wellbeing bar */}
                      <div style={{ height: 4, background: '#071422', borderRadius: 3, overflow: 'hidden', marginBottom: 5 }}>
                        <div style={{
                          height: '100%', width: `${wb}%`, borderRadius: 3,
                          background: `linear-gradient(90deg, ${scoreColor}88, ${scoreColor})`,
                          boxShadow: `0 0 6px ${scoreColor}40`,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      {/* Row 3: population + approval */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                        <span style={{ color: '#64748b', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.02em' }}>
                          Representing {Math.round(entry.population_pct ?? 0)}% of population
                        </span>
                        <span style={{ marginLeft: 'auto', fontFamily: "'Share Tech Mono', monospace", fontWeight: 800, color: apprColor, letterSpacing: '0.05em' }}>
                          {Math.round(appr)}%
                        </span>
                        <span style={{ color: '#7ba8d1', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em', fontWeight: 700, fontSize: 9 }}>APPR</span>
                      </div>
                      {/* Expanded: per-turn history */}
                      {isExpanded && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(51,65,85,0.6)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {groupHistory.length > 0 ? groupHistory.map(h => {
                            const twbColor = h.wb >= 65 ? '#22c55e' : h.wb >= 45 ? '#f59e0b' : '#f87171'
                            const taColor = h.appr >= 60 ? '#22c55e' : h.appr >= 40 ? '#f59e0b' : '#f87171'
                            return (
                              <div key={h.turn} style={{ background: 'rgba(15,23,42,0.3)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid #3b82f6' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, marginBottom: 4 }}>
                                  <span style={{
                                    fontSize: 9, fontWeight: 800, color: '#3b82f6',
                                    background: 'rgba(59,130,246,0.15)',
                                    borderRadius: 3, padding: '1px 5px',
                                    fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.06em',
                                  }}>TURN {h.turn}</span>
                                  <span style={{ color: '#64748b', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: 9 }}>WB</span>
                                  <span style={{ fontFamily: "'Share Tech Mono', monospace", color: twbColor, fontWeight: 700 }}>{Math.round(h.wb)}</span>
                                  <span style={{ color: '#6b9cc9' }}>│</span>
                                  <span style={{ color: '#64748b', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: 9 }}>APPR</span>
                                  <span style={{ fontFamily: "'Share Tech Mono', monospace", color: taColor, fontWeight: 700 }}>{Math.round(h.appr)}%</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.4, fontStyle: 'italic' }}>
                                  "{h.pulse || 'Sentiment remains stable amid policy adjustments.'}"
                                </div>
                              </div>
                            )
                          }) : (
                            <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>Run a turn to see this group's reaction history.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              {wardReport.filter(e => e.group_type === identityFilter).length === 0 && (
                <div style={{ fontSize: 11, color: '#6b9cc9', textAlign: 'center', paddingTop: 16 }}>No data yet — run a turn to see group welfare</div>
              )}
            </div>
          </div>

          {/* Media */}
          <div style={PANEL} className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <Newspaper size={11} color="#e8a030" />
                <span style={HDR_LABEL}>MEDIA</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={10} color="#22c55e" />
                <span style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", color: '#7ba8d1' }}>Campaign Rate</span>
              </div>
            </div>
            <div ref={mediaScrollRef} className="p-2 overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'none' }}
              onMouseEnter={() => { mediaHoveredRef.current = true }}
              onMouseLeave={() => { mediaHoveredRef.current = false }}
            >
              {allHeadlines.length === 0 && (
                <div style={{ fontSize: 11, color: '#6b9cc9', textAlign: 'center', padding: '8px 0' }}>
                  {briefingLoading ? 'Loading city briefing...' : 'No headlines yet'}
                </div>
              )}
              {allHeadlines.length > 0 && [0, 1].map(copy => (
                <div key={copy} ref={copy === 0 ? mediaInnerRef : undefined} className="space-y-2" style={copy === 1 ? { paddingTop: 8 } : undefined}>
                  {allHeadlines.map((item, i) => {
                    const col = leanColor(item.lean)
                    const bg = leanBg(item.lean)
                    const initials = item.outlet.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    const itemBg = item.isBreaking ? 'rgba(232,160,48,0.06)' : 'rgba(255,255,255,0.02)'
                    const itemBorder = item.isBreaking ? '1px solid rgba(232,160,48,0.25)' : '1px solid transparent'
                    return (
                      <div key={`${copy}-${i}`} className="flex gap-2 p-1.5 rounded"
                        style={{ background: itemBg, border: itemBorder }}>
                        <div className="shrink-0 rounded flex items-center justify-center"
                          style={{
                            width: 32, height: 32, background: bg,
                            border: `1px solid ${col}44`, fontSize: 9, fontWeight: 700, color: col,
                            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em',
                          }}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: 10, fontWeight: 700, color: col }}>{item.outlet}</span>
                            <span style={{
                              fontSize: 8, fontWeight: 700, color: '#7ba8d1',
                              background: '#0b1929', border: '1px solid #1c3652',
                              borderRadius: 3, padding: '0 3px', fontFamily: "'Rajdhani', sans-serif"
                            }}>T{item.turnNum}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.45 }}>
                            {item.headline}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* City Chatter */}
          <div style={PANEL} className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #1c3652' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={11} color="#e8a030" />
                <span style={HDR_LABEL}>CITY CHATTER</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingDown size={10} color="#f87171" />
                <span style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", color: '#7ba8d1' }}>Sentiment</span>
              </div>
            </div>
            <div ref={chatterScrollRef} className="p-2 overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'none' }}
              onMouseEnter={() => { chatterHoveredRef.current = true }}
              onMouseLeave={() => { chatterHoveredRef.current = false }}
            >
              {allVoices.length === 0 && (
                <div style={{ fontSize: 11, color: '#6b9cc9', textAlign: 'center', padding: '8px 0' }}>
                  {briefingLoading ? 'Loading city briefing...' : 'No citizen voices yet'}
                </div>
              )}
              {allVoices.length > 0 && [0, 1].map(copy => (
                <div key={copy} ref={copy === 0 ? chatterInnerRef : undefined} className="space-y-2.5" style={copy === 1 ? { paddingTop: 10 } : undefined}>
                  {allVoices.filter(v => !v.citizen_id.startsWith('politics-')).map((v, i) => {
                    const ring = sentimentRing(v.sentiment)
                    return (
                      <div key={`${copy}-${i}`} className="flex gap-1.5">
                        <div className="shrink-0" style={{ position: 'relative', width: 26, height: 26, marginTop: 2 }}>
                          <Avatar seed={v.name} size={26} ring={ring} />
                          <div className="absolute bottom-0 right-0 rounded-full"
                            style={{
                              width: 6, height: 6,
                              background: v.sentiment === 'approve' ? '#22c55e' : v.sentiment === 'disapprove' ? '#f87171' : '#e8a030',
                              border: '1px solid #050d1b',
                            }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1" style={{ marginBottom: 2 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>{v.name.split(' ')[0]}</span>
                            <span style={{ fontSize: 8, color: '#6b9cc9' }}>· {v.demographics_summary.split(',')[0]}</span>
                            {v.turnNum != null && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, color: '#f59e0b',
                                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                                borderRadius: 3, padding: '0 3px',
                                fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.06em',
                              }}>T{v.turnNum}</span>
                            )}
                          </div>
                          {/* Speech bubble */}
                          <div style={{
                            background: v.sentiment === 'approve'
                              ? 'rgba(34,197,94,0.06)'
                              : v.sentiment === 'disapprove'
                                ? 'rgba(248,113,113,0.06)'
                                : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${ring}22`,
                            borderRadius: '0 8px 8px 8px',
                            padding: '5px 8px',
                            fontSize: 10,
                            color: '#cbd5e1',
                            lineHeight: 1.55,
                            fontStyle: 'normal',
                          }}>
                            {v.reaction}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
