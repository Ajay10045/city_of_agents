import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Send, Shield, Sparkles } from 'lucide-react'
import {
  closeConsultation,
  executeTurnStreamV2,
  getPolicies,
  messageMinister,
  openConsultation,
} from '../api'
import type {
  GameState,
  MediaHeadline,
  MicroEvent,
  Minister,
  Policy,
  TurnResult,
  UISignals,
} from '../types'
import CityPulse from './game/CityPulse'
import HighlightReel from './game/HighlightReel'
import MediaClimate from './game/MediaClimate'
import MinisterMoodStrip from './game/MinisterMoodStrip'
import PromiseDelivery from './game/PromiseDelivery'

interface ChatMsg {
  who: 'mayor' | 'minister' | 'system'
  name: string
  text: string
  time: string
}

const PANEL = {
  background: 'linear-gradient(180deg, #0b1929 0%, #091422 100%)',
  border: '1px solid #1c3652',
  borderRadius: 8,
} as const

function avg(nums: number[]) {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function fmt(n: number) {
  return Math.round(n).toLocaleString()
}

function riskAura(risk: Policy['risk_tone']) {
  if (risk === 'high') return { boxShadow: '0 0 16px #ef444455', borderColor: '#7f1d1d' }
  if (risk === 'structural') return { boxShadow: '0 0 16px #8b5cf655', borderColor: '#5b21b6' }
  if (risk === 'transformative') return { boxShadow: '0 0 16px #eab30866', borderColor: '#854d0e' }
  return { boxShadow: '0 0 10px #22c55e33', borderColor: '#14532d' }
}

function ministerName(ministers: Minister[], id: string | null) {
  if (!id) return null
  return ministers.find(m => m.id === id)?.name ?? null
}

function SectorGroup({
  label,
  score,
  advanced,
}: {
  label: string
  score: number
  advanced: boolean
}) {
  const color = score >= 65 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1c3652', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ height: 8, background: '#0b1929', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', background: color, borderRadius: 6 }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: '#cbd5e1' }}>
        {advanced ? `Index ${Math.round(score)}` : score >= 65 ? 'Resilient' : score >= 45 ? 'Under Strain' : 'Destabilizing'}
      </div>
    </div>
  )
}

function PolicyModal({
  open,
  policies,
  loading,
  onClose,
  onSelect,
}: {
  open: boolean
  policies: Policy[]
  loading: boolean
  onClose: () => void
  onSelect: (idx: number) => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(3,8,17,0.85)' }}>
      <div style={{ ...PANEL, width: 'min(980px, 96vw)', padding: 16 }}>
        <div className="mb-3 flex items-center justify-between">
          <div style={{ fontSize: 12, color: '#e2e8f0', letterSpacing: '0.08em' }}>SELECT POLICY</div>
          <button onClick={onClose} style={{ color: '#94a3b8' }}>Close</button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {policies.map((p, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              disabled={loading}
              className="rounded-lg p-3 text-left"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid #1c3652',
                ...riskAura(p.risk_tone),
              }}
            >
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>{p.portfolio}</div>
              <div style={{ color: '#f8fafc', fontWeight: 700, marginBottom: 6 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 8 }}>{p.description}</div>
              <div style={{ fontSize: 11, color: '#f59e0b' }}>₹{fmt(p.budget_cost)} Cr</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MinisterPicker({
  open,
  ministers,
  onClose,
  onChoose,
}: {
  open: boolean
  ministers: Minister[]
  onClose: () => void
  onChoose: (id: string) => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(3,8,17,0.85)' }}>
      <div style={{ ...PANEL, width: 'min(520px, 96vw)', padding: 16 }}>
        <div className="mb-3 flex items-center justify-between">
          <div style={{ fontSize: 12, color: '#e2e8f0', letterSpacing: '0.08em' }}>ASSIGN MINISTER</div>
          <button onClick={onClose} style={{ color: '#94a3b8' }}>Close</button>
        </div>
        <div className="space-y-2">
          {ministers.map(m => (
            <button
              key={m.id}
              onClick={() => onChoose(m.id)}
              className="w-full rounded-md px-3 py-2 text-left"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1c3652' }}
            >
              <div style={{ color: '#f8fafc', fontWeight: 700 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.portfolio}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function GameDashboard({ gameId, initialState }: { gameId: string; initialState: GameState }) {
  const [gameState, setGameState] = useState<GameState>(initialState)
  const [lastTurn, setLastTurn] = useState<TurnResult | null>(initialState.last_turn)
  const [turnHistory, setTurnHistory] = useState<TurnResult[]>(initialState.last_turn ? [initialState.last_turn] : [])
  const [advanced, setAdvanced] = useState(false)

  const [chatInput, setChatInput] = useState('')
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const activeConsultRef = useRef<string | null>(null)
  const [selectedMinisterId, setSelectedMinisterId] = useState<string | null>(initialState.ministers[0]?.id ?? null)

  const [policyOptions, setPolicyOptions] = useState<Policy[]>([])
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [showMinisterPicker, setShowMinisterPicker] = useState(false)
  const [pendingPolicyIndex, setPendingPolicyIndex] = useState<number | null>(null)
  const [policyLoading, setPolicyLoading] = useState(false)

  const [executing, setExecuting] = useState(false)
  const [turnError, setTurnError] = useState<string | null>(null)
  const [liveMilestones, setLiveMilestones] = useState<string[]>([])

  const [allHeadlines, setAllHeadlines] = useState<MediaHeadline[]>([])
  const [microFeed, setMicroFeed] = useState<MicroEvent[]>([])

  const uiSignals: UISignals | undefined = lastTurn?.ui_signals ?? gameState.ui_signals

  const cp = gameState.city_params
  const grouped = useMemo(() => {
    return {
      economy: avg([cp.jobs_and_commerce, cp.affordable_housing, cp.water_power_sanitation]),
      services: avg([cp.hospitals_and_clinics, cp.schools_and_universities, cp.community_and_spaces]),
      security: avg([cp.police_and_emergency, cp.courts_and_legal, cp.air_quality_and_pollution]),
      governance: avg([cp.admin_efficiency, cp.anti_corruption, cp.media_freedom]),
    }
  }, [cp])

  const approval = Math.round(gameState.interim_approval)
  const electionShadow = Math.max(0, Math.min(100, uiSignals?.election_shadow_intensity ?? 0))

  async function handleSendMessage() {
    if (!chatInput.trim() || chatLoading || !selectedMinisterId) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatError(null)
    setChat(prev => [...prev, { who: 'mayor', name: 'Mayor', text: msg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    setChatLoading(true)

    try {
      if (activeConsultRef.current && activeConsultRef.current !== selectedMinisterId) {
        await closeConsultation(gameId).catch(() => null)
        activeConsultRef.current = null
      }
      if (activeConsultRef.current !== selectedMinisterId) {
        await openConsultation(gameId, selectedMinisterId)
        activeConsultRef.current = selectedMinisterId
      }
      const res = await messageMinister(gameId, msg)
      setChat(prev => [...prev, {
        who: 'minister',
        name: ministerName(gameState.ministers, selectedMinisterId) ?? 'Minister',
        text: res.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }])
    } catch (e: unknown) {
      setChatError(e instanceof Error ? e.message : String(e))
    } finally {
      setChatLoading(false)
    }
  }

  async function handleDraftPolicies() {
    if (policyLoading) return
    setPolicyLoading(true)
    setTurnError(null)
    try {
      if (activeConsultRef.current) {
        await closeConsultation(gameId).catch(() => null)
        activeConsultRef.current = null
      }
      const res = await getPolicies(gameId)
      setPolicyOptions(res.options)
      setShowPolicyModal(true)
    } catch (e: unknown) {
      setTurnError(e instanceof Error ? e.message : String(e))
    } finally {
      setPolicyLoading(false)
    }
  }

  function handleSelectPolicy(idx: number) {
    setPendingPolicyIndex(idx)
    setShowPolicyModal(false)
    setShowMinisterPicker(true)
  }

  async function handleExecute(ministerId: string) {
    if (pendingPolicyIndex === null) return
    setShowMinisterPicker(false)
    setExecuting(true)
    setTurnError(null)
    setLiveMilestones([])

    try {
      for await (const ev of executeTurnStreamV2(gameId, pendingPolicyIndex, ministerId, { type: 'governance_upkeep', budget: 0 })) {
        if (ev.type === 'error') {
          setTurnError(String(ev.message || 'Turn failed'))
          break
        }

        if (ev.type === 'narrative_chunk' && ev.key === 'headlines') {
          const hs = (ev.value as Array<{ outlet: string; lean: 'mayor' | 'opposition' | 'neutral'; headline: string }>) ?? []
          setAllHeadlines(prev => [...prev, ...hs.map(h => ({ outlet: h.outlet, lean: h.lean, headline: h.headline }))])
        }

        if (ev.type === 'complete') {
          const tr = ev.turn_result as TurnResult
          const st = ev.state as GameState
          setGameState(st)
          setLastTurn(tr)
          setTurnHistory(prev => [tr, ...prev].slice(0, 8))
          setMicroFeed(prev => [...(tr.micro_events ?? []), ...prev].slice(0, 8))
          setAllHeadlines(prev => [...prev, ...(tr.media_headlines ?? [])])
          setPolicyOptions([])
          setPendingPolicyIndex(null)
          setChat(prev => [...prev, {
            who: 'system',
            name: 'System',
            text: `Turn ${tr.turn} complete · ${tr.major_policy.name}`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }])
          break
        }

        setLiveMilestones(prev => [...prev, String(ev.type)])
      }
    } catch (e: unknown) {
      setTurnError(e instanceof Error ? e.message : String(e))
    } finally {
      setExecuting(false)
    }
  }

  useEffect(() => {
    return () => {
      if (activeConsultRef.current) closeConsultation(gameId).catch(() => null)
    }
  }, [gameId])

  const smog = (uiSignals?.decay_cues?.smog_overlay ?? 0) / 230
  const desat = 1 - (uiSignals?.decay_cues?.desaturation ?? 0) / 150

  return (
    <div
      className="relative min-h-screen"
      style={{
        background: 'radial-gradient(1200px 500px at 50% -10%, #1b3550 0%, #071320 45%, #050d1b 100%)',
        color: '#f8fafc',
        fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
        filter: `saturate(${Math.max(0.4, desat)})`,
      }}
    >
      {/* Environmental decay cues */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(90,90,90,${smog})` }} />
      {(uiSignals?.decay_cues?.infra_crack ?? 0) > 40 && (
        <div className="pointer-events-none absolute left-4 top-16 text-2xl opacity-70">🕳</div>
      )}

      {/* Top bar */}
      <div
        className={`relative z-10 border-b px-4 py-3 ${uiSignals?.decay_cues?.anticorruption_flicker ? 'coa-flicker' : ''}`}
        style={{ borderColor: '#1c3652', background: 'rgba(4,10,18,0.65)', backdropFilter: 'blur(10px)' }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fbbf24' }}>City of {gameState.city_name}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Turn {gameState.current_turn} / {gameState.total_turns}</div>
          </div>
          <CityPulse signal={uiSignals?.city_pulse} />
          <div className="ml-auto" style={{ minWidth: 200 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.08em' }}>MAYOR APPROVAL</div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 22, fontWeight: 800, color: '#fbbf24' }}>{approval}%</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Election Shadow</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#0b1929', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: `rgba(15,15,15,${Math.min(0.75, electionShadow / 140)})` }} />
              <div style={{ width: `${approval}%`, height: '100%', background: approval >= 50 ? '#22c55e' : approval >= 35 ? '#f59e0b' : '#ef4444' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAdvanced(v => !v)}
            className="rounded-md px-3 py-1 text-xs"
            style={{ background: advanced ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid #1c3652' }}
          >
            {advanced ? 'Advanced: ON' : 'Advanced: OFF'}
          </button>
          <button
            onClick={handleDraftPolicies}
            disabled={policyLoading || executing}
            className="rounded-md px-3 py-1 text-xs"
            style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid #854d0e' }}
          >
            {policyLoading ? 'Drafting...' : 'Draft Policy'}
          </button>
          <button
            onClick={() => setShowPolicyModal(true)}
            disabled={policyOptions.length === 0 || executing}
            className="rounded-md px-3 py-1 text-xs"
            style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid #14532d' }}
          >
            Choose Policy
          </button>
          {executing && <span style={{ fontSize: 11, color: '#86efac' }}><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Executing turn...</span>}
        </div>

        {turnError && (
          <div className="mb-3 flex items-center gap-2 rounded-md p-2" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid #7f1d1d', color: '#fca5a5' }}>
            <AlertTriangle size={14} /> {turnError}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)_340px]">
          {/* Left */}
          <div className="space-y-3">
            <div style={{ ...PANEL, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 8 }}>CABINET MOOD</div>
              <MinisterMoodStrip ministers={gameState.ministers} selectedId={selectedMinisterId ?? undefined} onSelect={setSelectedMinisterId} />
            </div>

            <div style={{ ...PANEL, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 8 }}>ADVISORY CHAT</div>
              <div className="mb-2 max-h-64 space-y-2 overflow-auto pr-1">
                {chat.length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>Consult ministers before drafting policy.</div>}
                {chat.map((m, i) => (
                  <div key={i} style={{ fontSize: 11, color: m.who === 'mayor' ? '#fde68a' : m.who === 'minister' ? '#bfdbfe' : '#94a3b8' }}>
                    <span style={{ fontWeight: 700 }}>{m.name}:</span> {m.text}
                  </div>
                ))}
                {chatLoading && <div style={{ fontSize: 11, color: '#94a3b8' }}>Minister is responding...</div>}
              </div>
              {chatError && <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 8 }}>{chatError}</div>}
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask the selected minister..."
                  className="flex-1 rounded-md px-2 py-1 text-sm"
                  style={{ background: '#071320', border: '1px solid #1c3652', color: '#f8fafc' }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={chatLoading || !selectedMinisterId}
                  className="rounded-md px-3"
                  style={{ background: 'rgba(56,189,248,0.2)', border: '1px solid #155e75' }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Center */}
          <div className="space-y-3">
            <div style={{ ...PANEL, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 8 }}>CITY SYSTEM BLOCKS</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <SectorGroup label="Economy + Housing" score={grouped.economy} advanced={advanced} />
                <SectorGroup label="Services" score={grouped.services} advanced={advanced} />
                <SectorGroup label="Security + Air" score={grouped.security} advanced={advanced} />
                <SectorGroup label="Governance" score={grouped.governance} advanced={advanced} />
              </div>
            </div>

            <PromiseDelivery turn={lastTurn} />
            <HighlightReel lines={lastTurn?.highlight_reel ?? []} nearMisses={lastTurn?.near_miss_events} microEvents={lastTurn?.micro_events} />

            {advanced && (
              <div style={{ ...PANEL, padding: 12 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 8 }}>ADVANCED METRICS</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(cp).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between rounded px-2 py-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span style={{ fontSize: 10, color: '#cbd5e1' }}>{k.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 11, color: '#f8fafc', fontWeight: 700 }}>{Math.round(v)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#fbbf24' }}>Treasury: ₹{fmt(gameState.treasury)} Cr</div>
              </div>
            )}

            <div style={{ ...PANEL, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 8 }}>TURN FLOW</div>
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>{liveMilestones.slice(-8).join(' → ') || 'No active turn stream'}</div>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-3">
            <MediaClimate signal={uiSignals?.media_climate} headlines={allHeadlines} />

            <div style={{ ...PANEL, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 8 }}>MICRO EVENTS</div>
              <div className="space-y-2">
                {microFeed.length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>No micro-events yet.</div>}
                {microFeed.slice(0, 5).map((ev, i) => (
                  <div key={`${ev.key}-${i}`} className="rounded p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 700 }}>{ev.title}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{ev.narrative}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...PANEL, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.1em', marginBottom: 8 }}>RECENT TURNS</div>
              <div className="space-y-2">
                {turnHistory.length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>No turns executed yet.</div>}
                {turnHistory.map(tr => (
                  <div key={tr.turn} className="rounded p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: 11, color: '#f8fafc', fontWeight: 700 }}>Turn {tr.turn} · {tr.major_policy.name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{Math.round(tr.execution_score * 100)}% execution · approval {Math.round(tr.interim_approval)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick cues */}
      <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2">
        {(uiSignals?.cabinet_mood?.flicker_count ?? 0) > 0 && (
          <div className="rounded-full px-3 py-1 text-xs" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #7f1d1d' }}>
            <AlertTriangle className="mr-1 inline h-3 w-3" /> Cabinet exposure risk
          </div>
        )}
        {(uiSignals?.identity_archetype ?? 'Survivor') !== 'Survivor' && (
          <div className="rounded-full px-3 py-1 text-xs" style={{ background: 'rgba(56,189,248,0.18)', border: '1px solid #155e75' }}>
            <Shield className="mr-1 inline h-3 w-3" /> {uiSignals?.identity_archetype}
          </div>
        )}
        {(uiSignals?.media_climate?.state ?? 'Calm') === 'Frenzy' && (
          <div className="rounded-full px-3 py-1 text-xs" style={{ background: 'rgba(234,179,8,0.2)', border: '1px solid #854d0e' }}>
            <Sparkles className="mr-1 inline h-3 w-3" /> Media frenzy
          </div>
        )}
      </div>

      <PolicyModal
        open={showPolicyModal}
        policies={policyOptions}
        loading={executing}
        onClose={() => setShowPolicyModal(false)}
        onSelect={handleSelectPolicy}
      />
      <MinisterPicker
        open={showMinisterPicker}
        ministers={gameState.ministers}
        onClose={() => setShowMinisterPicker(false)}
        onChoose={handleExecute}
      />
    </div>
  )
}
