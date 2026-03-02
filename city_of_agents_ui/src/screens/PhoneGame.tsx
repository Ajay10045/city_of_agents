import { useState, useEffect, useRef, useCallback } from 'react'
import {
  phoneNewGame,
  phoneRespond,
  phoneEndDay,
  phoneRequestSurvey,
  phoneMessageMinister,
  type PhoneSnapshot,
  type InboxMessage,
  type MinisterInfo,
  type SecretaryOption,
  type SurveyResult,
} from '../phoneApi'
import {
  MessageSquare, Users, Newspaper, AlertTriangle,
  Send, ChevronUp, Calendar, TrendingUp, TrendingDown,
  Minus, DollarSign, BarChart3, Loader2, Phone,
  ClipboardList, X,
} from 'lucide-react'

/* ================================================================
   TYPES
   ================================================================ */

type Tab = 'cabinet' | 'media' | 'public' | 'crises'

interface ChatMessage {
  id: string
  sender: 'them' | 'mayor'
  name: string
  text: string
  role: string
  urgency?: string
  topic?: string
  options?: SecretaryOption[]
  requiresResponse?: boolean
  replied?: boolean
  day: number
  inboxMsgId?: string
}

/* ================================================================
   PHONE GAME SCREEN
   ================================================================ */

export default function PhoneGame() {
  /* ---- state ---- */
  const [phase, setPhase] = useState<'start' | 'loading' | 'playing' | 'survey' | 'gameover'>('start')
  const [cityHint, setCityHint] = useState('')
  const [gameId, setGameId] = useState('')
  const [snapshot, setSnapshot] = useState<PhoneSnapshot | null>(null)
  const [ministers, setMinisters] = useState<MinisterInfo[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('public')
  const [messages, setMessages] = useState<Record<Tab, ChatMessage[]>>({
    cabinet: [], media: [], public: [], crises: [],
  })
  const [responding, setResponding] = useState<string | null>(null)
  const [freeText, setFreeText] = useState('')
  const [dayLoading, setDayLoading] = useState(false)
  const [surveyData, setSurveyData] = useState<SurveyResult | null>(null)
  const [ministerChatOpen, setMinisterChatOpen] = useState<string | null>(null)
  const [ministerChat, setMinisterChat] = useState<{ sender: string; text: string }[]>([])
  const [ministerInput, setMinisterInput] = useState('')
  const [ministerLoading, setMinisterLoading] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ---- auto-scroll ---- */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, activeTab])

  /* ---- ingest inbox messages into chat ---- */
  const ingestInbox = useCallback((inbox: InboxMessage[]) => {
    const newMsgs: Record<Tab, ChatMessage[]> = {
      cabinet: [], media: [], public: [], crises: [],
    }
    for (const m of inbox) {
      newMsgs[m.tab].push({
        id: m.id,
        sender: 'them',
        name: m.sender_name,
        text: m.text,
        role: m.sender_role,
        urgency: m.urgency,
        topic: m.topic ?? undefined,
        options: m.secretary_options ?? undefined,
        requiresResponse: m.requires_response,
        replied: false,
        day: m.day,
        inboxMsgId: m.id,
      })
    }
    setMessages(prev => ({
      cabinet: [...prev.cabinet, ...newMsgs.cabinet],
      media: [...prev.media, ...newMsgs.media],
      public: [...prev.public, ...newMsgs.public],
      crises: [...prev.crises, ...newMsgs.crises],
    }))
    // Auto-switch to tab with most urgent message
    const urgencyOrder: Tab[] = ['crises', 'public', 'media', 'cabinet']
    for (const tab of urgencyOrder) {
      if (newMsgs[tab].length > 0) {
        setActiveTab(tab)
        break
      }
    }
  }, [])

  /* ---- start game ---- */
  const startGame = useCallback(async () => {
    if (!cityHint.trim()) return
    setPhase('loading')
    setError('')
    try {
      const data = await phoneNewGame(cityHint.trim())
      setGameId(data.game_id)
      setSnapshot(data.snapshot)
      setMinisters(data.ministers)
      ingestInbox(data.inbox)
      setPhase('playing')
    } catch (e: unknown) {
      setError((e as Error).message)
      setPhase('start')
    }
  }, [cityHint, ingestInbox])

  /* ---- respond with secretary option ---- */
  const handleOptionSelect = useCallback(async (msgId: string, optIdx: number, opt: SecretaryOption) => {
    if (!gameId) return
    setResponding(msgId)
    try {
      const res = await phoneRespond(gameId, msgId, undefined, optIdx)
      // Add mayor response to chat
      setMessages(prev => {
        const updated = { ...prev }
        for (const tab of Object.keys(updated) as Tab[]) {
          updated[tab] = updated[tab].map(m => m.inboxMsgId === msgId ? { ...m, replied: true } : m)
        }
        // Add mayor's message
        updated[activeTab] = [
          ...updated[activeTab],
          {
            id: `mayor-${msgId}`,
            sender: 'mayor',
            name: 'You (Mayor)',
            text: opt.text,
            role: 'mayor',
            day: snapshot?.current_day ?? 1,
          },
        ]
        // Add citizen reply if any
        if (res.citizen_reply) {
          const original = prev[activeTab].find(m => m.inboxMsgId === msgId)
          updated[activeTab] = [
            ...updated[activeTab],
            {
              id: `reply-${msgId}`,
              sender: 'them',
              name: original?.name ?? 'Citizen',
              text: res.citizen_reply,
              role: original?.role ?? 'citizen',
              day: snapshot?.current_day ?? 1,
            },
          ]
        }
        return updated
      })
      if (res.snapshot) setSnapshot(res.snapshot)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setResponding(null)
  }, [gameId, activeTab, snapshot])

  /* ---- respond with free text ---- */
  const handleFreeTextSend = useCallback(async (msgId: string) => {
    if (!gameId || !freeText.trim()) return
    setResponding(msgId)
    const text = freeText.trim()
    setFreeText('')
    try {
      const res = await phoneRespond(gameId, msgId, text)
      setMessages(prev => {
        const updated = { ...prev }
        for (const tab of Object.keys(updated) as Tab[]) {
          updated[tab] = updated[tab].map(m => m.inboxMsgId === msgId ? { ...m, replied: true } : m)
        }
        updated[activeTab] = [
          ...updated[activeTab],
          {
            id: `mayor-${msgId}`,
            sender: 'mayor',
            name: 'You (Mayor)',
            text,
            role: 'mayor',
            day: snapshot?.current_day ?? 1,
          },
        ]
        if (res.citizen_reply) {
          const original = prev[activeTab].find(m => m.inboxMsgId === msgId)
          updated[activeTab] = [
            ...updated[activeTab],
            {
              id: `reply-${msgId}`,
              sender: 'them',
              name: original?.name ?? 'Citizen',
              text: res.citizen_reply,
              role: original?.role ?? 'citizen',
              day: snapshot?.current_day ?? 1,
            },
          ]
        }
        return updated
      })
      if (res.snapshot) setSnapshot(res.snapshot)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setResponding(null)
  }, [gameId, activeTab, freeText, snapshot])

  /* ---- end day ---- */
  const handleEndDay = useCallback(async () => {
    if (!gameId) return
    setDayLoading(true)
    try {
      const data = await phoneEndDay(gameId)
      setSnapshot(data.snapshot)
      if (data.survey) {
        setSurveyData(data.survey)
        setPhase('survey')
      }
      if (data.snapshot.phase === 'game_over') {
        setPhase('gameover')
        return
      }
      if (data.snapshot.phase === 'election') {
        setPhase('gameover')
        return
      }
      ingestInbox(data.inbox)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setDayLoading(false)
  }, [gameId, ingestInbox])

  /* ---- survey ---- */
  const handleSurvey = useCallback(async () => {
    if (!gameId) return
    try {
      const data = await phoneRequestSurvey(gameId)
      setSnapshot(data.snapshot)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }, [gameId])

  /* ---- minister chat ---- */
  const handleMinisterMessage = useCallback(async () => {
    if (!gameId || !ministerChatOpen || !ministerInput.trim()) return
    const text = ministerInput.trim()
    setMinisterInput('')
    setMinisterChat(prev => [...prev, { sender: 'mayor', text }])
    setMinisterLoading(true)
    try {
      const res = await phoneMessageMinister(gameId, ministerChatOpen, text)
      setMinisterChat(prev => [...prev, { sender: 'minister', text: res.reply }])
      if (res.snapshot) setSnapshot(res.snapshot)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setMinisterLoading(false)
  }, [gameId, ministerChatOpen, ministerInput])

  /* ================================================================
     RENDER — Start Screen
     ================================================================ */
  if (phase === 'start' || phase === 'loading') {
    return (
      <div style={styles.startScreen}>
        <div style={styles.startCard}>
          <div style={styles.phoneIcon}>
            <Phone size={48} strokeWidth={1.5} />
          </div>
          <h1 style={styles.startTitle}>The Mayor's Phone</h1>
          <p style={styles.startSubtitle}>Run a city through conversations</p>

          <div style={styles.startInputWrap}>
            <input
              style={styles.startInput}
              placeholder="Enter a city name... (e.g. Lucknow)"
              value={cityHint}
              onChange={e => setCityHint(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startGame()}
              disabled={phase === 'loading'}
            />
            <button
              style={{
                ...styles.startBtn,
                opacity: phase === 'loading' ? 0.6 : 1,
              }}
              onClick={startGame}
              disabled={phase === 'loading' || !cityHint.trim()}
            >
              {phase === 'loading'
                ? <Loader2 size={20} className="spin" />
                : 'Start Term'
              }
            </button>
          </div>
          {error && <p style={styles.errorText}>{error}</p>}

          <div style={styles.startHints}>
            <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
              You have 30 days. Manage citizens, ministers, media, and crises through your phone.
              Keep approval above 50% to win re-election.
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ================================================================
     RENDER — Survey Results
     ================================================================ */
  if (phase === 'survey' && surveyData) {
    return (
      <div style={styles.startScreen}>
        <div style={{ ...styles.startCard, maxWidth: 520 }}>
          <BarChart3 size={36} color="#6C5CE7" style={{ marginBottom: 12 }} />
          <h2 style={{ margin: '0 0 8px', color: '#E8E8E8' }}>Survey Results — Day {surveyData.day_delivered}</h2>
          <p style={{ color: '#999', fontSize: 14, marginBottom: 16 }}>
            Silent voter mood: <em>{surveyData.silent_voter_mood}</em>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {Object.entries(surveyData.approval_by_area).map(([area, pct]) => (
              <div key={area} style={{
                background: pct > 55 ? 'rgba(0,210,91,0.15)' : pct > 40 ? 'rgba(255,180,0,0.15)' : 'rgba(255,60,60,0.15)',
                border: `1px solid ${pct > 55 ? '#00D25B44' : pct > 40 ? '#FFB40044' : '#FF3C3C44'}`,
                borderRadius: 8, padding: '8px 14px', fontSize: 13,
              }}>
                <div style={{ color: '#bbb', marginBottom: 2 }}>{area}</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>{pct.toFixed(0)}%</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>TOP CONCERNS</div>
            {surveyData.top_concerns.map(([issue, pct], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, color: '#ddd' }}>
                <span>{issue}</span>
                <span style={{ color: '#FF6B6B' }}>{pct.toFixed(0)}% unhappy</span>
              </div>
            ))}
          </div>
          <div style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: surveyData.overall_trend === 'improving' ? 'rgba(0,210,91,0.1)' : surveyData.overall_trend === 'declining' ? 'rgba(255,60,60,0.1)' : 'rgba(255,255,255,0.05)',
            color: surveyData.overall_trend === 'improving' ? '#00D25B' : surveyData.overall_trend === 'declining' ? '#FF3C3C' : '#aaa',
            marginBottom: 16,
          }}>
            Trend: {surveyData.overall_trend.toUpperCase()}
          </div>
          <button style={styles.startBtn} onClick={() => setPhase('playing')}>
            Continue Governing
          </button>
        </div>
      </div>
    )
  }

  /* ================================================================
     RENDER — Game Over / Election
     ================================================================ */
  if (phase === 'gameover') {
    const won = snapshot && snapshot.approval >= 50 && snapshot.phase === 'election'
    return (
      <div style={styles.startScreen}>
        <div style={{ ...styles.startCard, maxWidth: 440 }}>
          <h1 style={{
            fontSize: 36, margin: '0 0 8px',
            color: won ? '#00D25B' : '#FF3C3C',
          }}>
            {won ? '🎉 Re-elected!' : '💀 Term Over'}
          </h1>
          <p style={{ color: '#aaa', fontSize: 15, marginBottom: 16 }}>
            {snapshot?.loss_reason
              ? snapshot.loss_reason
              : won
                ? `You survived 30 days with ${snapshot?.approval.toFixed(1)}% approval. The people chose you again.`
                : `Final approval: ${snapshot?.approval.toFixed(1)}%. The people demanded change.`
            }
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 20 }}>
            <Stat label="Final Day" value={`${snapshot?.current_day ?? 0}`} />
            <Stat label="Treasury" value={`₹${snapshot?.treasury ?? 0} Cr`} />
            <Stat label="Approval" value={`${snapshot?.approval.toFixed(1)}%`} />
          </div>
          <button style={styles.startBtn} onClick={() => {
            setPhase('start')
            setMessages({ cabinet: [], media: [], public: [], crises: [] })
            setSnapshot(null)
            setGameId('')
          }}>
            Play Again
          </button>
        </div>
      </div>
    )
  }

  /* ================================================================
     RENDER — Main Game UI
     ================================================================ */
  const tabMessages = messages[activeTab]
  const unreadMsg = tabMessages.find(m => m.requiresResponse && !m.replied)
  const tabs: { key: Tab; label: string; icon: React.ReactNode; unread: number }[] = [
    { key: 'cabinet', label: 'Cabinet', icon: <Users size={18} />, unread: snapshot?.unread_cabinet ?? 0 },
    { key: 'media', label: 'Media', icon: <Newspaper size={18} />, unread: snapshot?.unread_media ?? 0 },
    { key: 'public', label: 'Public', icon: <MessageSquare size={18} />, unread: snapshot?.unread_public ?? 0 },
    { key: 'crises', label: 'Crises', icon: <AlertTriangle size={18} />, unread: snapshot?.unread_crises ?? 0 },
  ]

  return (
    <div style={styles.phoneContainer}>
      {/* ---- STATUS BAR ---- */}
      <div style={styles.statusBar}>
        <div style={styles.statusLeft}>
          <Calendar size={14} color="#888" />
          <span style={styles.statusDay}>Day {snapshot?.current_day ?? 1}/{snapshot?.total_days ?? 30}</span>
        </div>
        <div style={styles.statusCenter}>
          <div style={{
            ...styles.approvalPill,
            background: (snapshot?.approval ?? 50) >= 50
              ? 'rgba(0,210,91,0.15)' : 'rgba(255,60,60,0.15)',
            borderColor: (snapshot?.approval ?? 50) >= 50 ? '#00D25B33' : '#FF3C3C33',
          }}>
            <span style={{
              color: (snapshot?.approval ?? 50) >= 50 ? '#00D25B' : '#FF3C3C',
              fontWeight: 700, fontSize: 16,
            }}>
              {snapshot?.approval.toFixed(1) ?? '50.0'}%
            </span>
            {(snapshot?.approval_delta ?? 0) !== 0 && (
              <span style={{
                fontSize: 11, marginLeft: 4,
                color: (snapshot?.approval_delta ?? 0) > 0 ? '#00D25B' : '#FF3C3C',
                display: 'flex', alignItems: 'center', gap: 1,
              }}>
                {(snapshot?.approval_delta ?? 0) > 0
                  ? <TrendingUp size={11} />
                  : <TrendingDown size={11} />
                }
                {Math.abs(snapshot?.approval_delta ?? 0).toFixed(1)}
              </span>
            )}
            {(snapshot?.approval_delta ?? 0) === 0 && (
              <Minus size={11} color="#666" style={{ marginLeft: 4 }} />
            )}
          </div>
        </div>
        <div style={styles.statusRight}>
          <DollarSign size={14} color="#FFB400" />
          <span style={styles.statusTreasury}>₹{snapshot?.treasury ?? 0} Cr</span>
        </div>
      </div>

      {/* ---- TAB BAR ---- */}
      <div style={styles.tabBar}>
        {tabs.map(t => (
          <button
            key={t.key}
            style={{
              ...styles.tab,
              ...(activeTab === t.key ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon}
            <span style={styles.tabLabel}>{t.label}</span>
            {t.unread > 0 && <span style={styles.badge}>{t.unread}</span>}
          </button>
        ))}
      </div>

      {/* ---- CHAT AREA ---- */}
      <div ref={scrollRef} style={styles.chatArea}>
        {tabMessages.length === 0 && (
          <div style={styles.emptyChat}>
            <MessageSquare size={32} color="#444" />
            <p style={{ color: '#555', margin: '8px 0 0', fontSize: 14 }}>No messages yet</p>
          </div>
        )}

        {tabMessages.map((msg, i) => {
          const isMayor = msg.sender === 'mayor'
          const showDayDivider = i === 0 || msg.day !== tabMessages[i - 1].day
          return (
            <div key={msg.id}>
              {showDayDivider && (
                <div style={styles.dayDivider}>
                  <span style={styles.dayDividerText}>Day {msg.day}</span>
                </div>
              )}
              <div style={{
                ...styles.msgRow,
                justifyContent: isMayor ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  ...styles.bubble,
                  ...(isMayor ? styles.bubbleMayor : styles.bubbleThem),
                  ...(msg.urgency === 'critical' ? styles.bubbleCritical : {}),
                }}>
                  {!isMayor && (
                    <div style={styles.senderLine}>
                      <span style={styles.senderName}>{msg.name}</span>
                      <span style={styles.senderRole}>{msg.role}</span>
                    </div>
                  )}
                  <p style={styles.msgText}>{msg.text}</p>

                  {/* Secretary Options */}
                  {msg.options && !msg.replied && msg.requiresResponse && (
                    <div style={styles.optionsWrap}>
                      <div style={styles.optionsLabel}>
                        <ClipboardList size={12} />
                        <span>Secretary suggests:</span>
                      </div>
                      {msg.options.map((opt, oi) => (
                        <button
                          key={oi}
                          style={{
                            ...styles.optionBtn,
                            borderColor: opt.tone === 'bold' ? '#6C5CE744' : opt.tone === 'deflective' ? '#FFB40033' : '#ffffff18',
                          }}
                          onClick={() => handleOptionSelect(msg.inboxMsgId!, oi, opt)}
                          disabled={responding === msg.inboxMsgId}
                        >
                          <div style={styles.optionHeader}>
                            <span style={styles.optionLabel}>{opt.label}</span>
                            {opt.cost > 0 && (
                              <span style={styles.optionCost}>₹{opt.cost} Cr</span>
                            )}
                          </div>
                          <p style={styles.optionText}>{opt.text}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {msg.replied && msg.requiresResponse && (
                    <div style={styles.repliedBadge}>✓ Responded</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {responding && (
          <div style={styles.typingIndicator}>
            <Loader2 size={14} className="spin" />
            <span>Processing response...</span>
          </div>
        )}
      </div>

      {/* ---- FREE TEXT INPUT (for unreplied messages) ---- */}
      {unreadMsg && (
        <div style={styles.inputBar}>
          <input
            ref={inputRef}
            style={styles.textInput}
            placeholder="Type your own response..."
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && unreadMsg && handleFreeTextSend(unreadMsg.inboxMsgId!)}
            disabled={!!responding}
          />
          <button
            style={styles.sendBtn}
            onClick={() => unreadMsg && handleFreeTextSend(unreadMsg.inboxMsgId!)}
            disabled={!freeText.trim() || !!responding}
          >
            <Send size={18} />
          </button>
        </div>
      )}

      {/* ---- BOTTOM ACTION BAR ---- */}
      <div style={styles.actionBar}>
        <button style={styles.actionBtn} onClick={handleSurvey} title="Request citizen survey (₹20 Cr)">
          <BarChart3 size={16} />
          <span>Survey</span>
        </button>
        <button
          style={{ ...styles.actionBtn, ...styles.actionBtnPrimary }}
          onClick={handleEndDay}
          disabled={dayLoading}
        >
          {dayLoading
            ? <Loader2 size={16} className="spin" />
            : <ChevronUp size={16} />
          }
          <span>{dayLoading ? 'Next Day...' : 'End Day'}</span>
        </button>
        <button
          style={styles.actionBtn}
          onClick={() => setMinisterChatOpen(ministers[0]?.id ?? null)}
          title="Chat with a minister"
        >
          <Users size={16} />
          <span>Ministers</span>
        </button>
      </div>

      {/* ---- MINISTER CHAT DRAWER ---- */}
      {ministerChatOpen && (
        <div style={styles.drawerOverlay} onClick={() => setMinisterChatOpen(null)}>
          <div style={styles.drawer} onClick={e => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h3 style={{ margin: 0, color: '#E8E8E8', fontSize: 16 }}>
                Minister Chat
              </h3>
              <button style={styles.drawerClose} onClick={() => setMinisterChatOpen(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.ministerTabs}>
              {ministers.map(m => (
                <button
                  key={m.id}
                  style={{
                    ...styles.ministerTab,
                    ...(ministerChatOpen === m.id ? styles.ministerTabActive : {}),
                  }}
                  onClick={() => {
                    setMinisterChatOpen(m.id)
                    setMinisterChat([])
                  }}
                >
                  <span style={{ fontSize: 13 }}>{m.name}</span>
                  <span style={{ fontSize: 10, color: '#888' }}>{m.portfolio}</span>
                </button>
              ))}
            </div>
            <div style={styles.ministerMessages}>
              {ministerChat.map((c, i) => (
                <div key={i} style={{
                  ...styles.msgRow,
                  justifyContent: c.sender === 'mayor' ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    ...styles.bubble,
                    ...(c.sender === 'mayor' ? styles.bubbleMayor : styles.bubbleThem),
                    maxWidth: '85%',
                  }}>
                    <p style={styles.msgText}>{c.text}</p>
                  </div>
                </div>
              ))}
              {ministerLoading && (
                <div style={styles.typingIndicator}>
                  <Loader2 size={14} className="spin" />
                  <span>Minister is typing...</span>
                </div>
              )}
            </div>
            <div style={styles.inputBar}>
              <input
                style={styles.textInput}
                placeholder="Ask your minister..."
                value={ministerInput}
                onChange={e => setMinisterInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleMinisterMessage()}
                disabled={ministerLoading}
              />
              <button style={styles.sendBtn} onClick={handleMinisterMessage} disabled={!ministerInput.trim() || ministerLoading}>
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div style={styles.errorToast} onClick={() => setError('')}>
          {error}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .spin { animation: spin 1s linear infinite; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #0A0A0F; }
      `}</style>
    </div>
  )
}

/* ================================================================
   STAT COMPONENT
   ================================================================ */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' as const }}>
      <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#E8E8E8', fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

/* ================================================================
   STYLES
   ================================================================ */

const styles: Record<string, React.CSSProperties> = {
  /* ---- Start Screen ---- */
  startScreen: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0A0A0F 0%, #1A1A2E 100%)',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  startCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '48px 40px',
    maxWidth: 400,
    width: '90%',
    textAlign: 'center' as const,
    backdropFilter: 'blur(20px)',
  },
  phoneIcon: {
    width: 80, height: 80,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6C5CE7, #A855F7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 20px',
    color: 'white',
  },
  startTitle: {
    fontSize: 28, fontWeight: 700, color: '#E8E8E8', margin: '0 0 4px',
    letterSpacing: '-0.5px',
  },
  startSubtitle: {
    fontSize: 15, color: '#888', margin: '0 0 28px',
  },
  startInputWrap: {
    display: 'flex', gap: 8, marginBottom: 16,
  },
  startInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, padding: '12px 16px',
    color: '#E8E8E8', fontSize: 14,
    outline: 'none',
  },
  startBtn: {
    background: 'linear-gradient(135deg, #6C5CE7, #A855F7)',
    border: 'none', borderRadius: 10,
    padding: '12px 24px',
    color: 'white', fontWeight: 600, fontSize: 14,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  startHints: {
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    textAlign: 'left' as const,
  },
  errorText: {
    color: '#FF6B6B', fontSize: 13, margin: '8px 0',
  },

  /* ---- Phone Container ---- */
  phoneContainer: {
    maxWidth: 480,
    margin: '0 auto',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0D0D14',
    fontFamily: "'Inter', -apple-system, sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },

  /* ---- Status Bar ---- */
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 10px',
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  statusLeft: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  statusDay: {
    color: '#B0B0B0', fontSize: 13, fontWeight: 500,
  },
  statusCenter: {
    display: 'flex', alignItems: 'center',
  },
  approvalPill: {
    display: 'flex', alignItems: 'center', gap: 2,
    padding: '4px 12px',
    borderRadius: 20,
    border: '1px solid',
  },
  statusRight: {
    display: 'flex', alignItems: 'center', gap: 4,
  },
  statusTreasury: {
    color: '#FFB400', fontSize: 13, fontWeight: 600,
  },

  /* ---- Tab Bar ---- */
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  tab: {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 0',
    background: 'none', border: 'none',
    color: '#666', fontSize: 12, fontWeight: 500,
    cursor: 'pointer',
    position: 'relative',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#E8E8E8',
    borderBottomColor: '#6C5CE7',
  },
  tabLabel: {},
  badge: {
    position: 'absolute', top: 4, right: '15%',
    background: '#FF3C3C',
    color: 'white', fontSize: 9, fontWeight: 700,
    borderRadius: '50%',
    width: 16, height: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  /* ---- Chat Area ---- */
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 12px 4px',
  },
  emptyChat: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    height: '100%', opacity: 0.5,
  },
  dayDivider: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '12px 0 8px',
  },
  dayDividerText: {
    background: 'rgba(255,255,255,0.06)',
    color: '#777', fontSize: 11, fontWeight: 500,
    padding: '3px 14px', borderRadius: 20,
  },
  msgRow: {
    display: 'flex', marginBottom: 8,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    padding: '10px 14px',
  },
  bubbleThem: {
    background: 'rgba(255,255,255,0.06)',
    borderBottomLeftRadius: 4,
  },
  bubbleMayor: {
    background: 'linear-gradient(135deg, #6C5CE722, #A855F722)',
    border: '1px solid #6C5CE733',
    borderBottomRightRadius: 4,
  },
  bubbleCritical: {
    border: '1px solid rgba(255,60,60,0.3)',
    background: 'rgba(255,60,60,0.08)',
  },
  senderLine: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
  },
  senderName: {
    color: '#C0C0FF', fontSize: 12, fontWeight: 600,
  },
  senderRole: {
    color: '#666', fontSize: 10,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  msgText: {
    color: '#D8D8D8', fontSize: 14, lineHeight: '1.45',
    margin: 0, whiteSpace: 'pre-wrap',
  },

  /* ---- Secretary Options ---- */
  optionsWrap: {
    marginTop: 10,
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  optionsLabel: {
    display: 'flex', alignItems: 'center', gap: 4,
    color: '#888', fontSize: 11, marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  optionBtn: {
    display: 'block', width: '100%', textAlign: 'left' as const,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '8px 12px',
    marginBottom: 6, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  optionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 3,
  },
  optionLabel: {
    color: '#B8B8FF', fontSize: 12, fontWeight: 600,
  },
  optionCost: {
    color: '#FFB400', fontSize: 11, fontWeight: 600,
  },
  optionText: {
    color: '#aaa', fontSize: 12, margin: 0, lineHeight: '1.4',
  },
  repliedBadge: {
    marginTop: 6, color: '#00D25B', fontSize: 11, fontWeight: 500,
  },

  /* ---- Input Bar ---- */
  inputBar: {
    display: 'flex', gap: 8,
    padding: '8px 12px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  textInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20, padding: '10px 16px',
    color: '#E8E8E8', fontSize: 13,
    outline: 'none',
  },
  sendBtn: {
    background: 'linear-gradient(135deg, #6C5CE7, #A855F7)',
    border: 'none', borderRadius: '50%',
    width: 40, height: 40,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', cursor: 'pointer',
  },

  /* ---- Action Bar ---- */
  actionBar: {
    display: 'flex', gap: 8,
    padding: '8px 12px 12px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  actionBtn: {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 0',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#aaa', fontSize: 12, fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  actionBtnPrimary: {
    background: 'linear-gradient(135deg, #6C5CE7, #A855F7)',
    border: '1px solid #6C5CE744',
    color: 'white',
  },

  /* ---- Minister Drawer ---- */
  drawerOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100,
  },
  drawer: {
    maxWidth: 480, width: '100%',
    height: '75vh',
    background: '#14141F',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    display: 'flex', flexDirection: 'column',
    border: '1px solid rgba(255,255,255,0.08)',
    borderBottom: 'none',
  },
  drawerHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  drawerClose: {
    background: 'none', border: 'none', color: '#888', cursor: 'pointer',
    padding: 4,
  },
  ministerTabs: {
    display: 'flex', gap: 4, padding: '8px 12px',
    overflowX: 'auto',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  ministerTab: {
    display: 'flex', flexDirection: 'column',
    padding: '6px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: '#ccc',
  },
  ministerTabActive: {
    background: 'rgba(108,92,231,0.15)',
    borderColor: '#6C5CE744',
  },
  ministerMessages: {
    flex: 1, overflowY: 'auto', padding: '8px 12px',
  },

  /* ---- Misc ---- */
  typingIndicator: {
    display: 'flex', alignItems: 'center', gap: 6,
    color: '#888', fontSize: 12, padding: '4px 0',
  },
  errorToast: {
    position: 'absolute',
    bottom: 80, left: 16, right: 16,
    background: 'rgba(255,60,60,0.9)',
    color: 'white', fontSize: 13,
    padding: '10px 16px', borderRadius: 10,
    cursor: 'pointer', zIndex: 200,
  },
}
