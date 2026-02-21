import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createAdvisorSession,
  fetchAdvisorSession,
  fetchPolicies,
  generateAdvisorPolicies,
  sendAdvisorMessage,
  streamAdvisorMessage,
} from '../api'
import type { AdvisorMessage, AdvisorSession, AdvisorStreamEvent, DynamicPolicy } from '../types'

type Props = {
  gameId: string | null
  advisorSessionId: string | null
  turnNumber: number
  disabled: boolean
  onSessionUpdate: (sessionId: string) => void
  onPoliciesGenerated: (policies: DynamicPolicy[]) => void
  onError: (message: string | null) => void
  onCouncilBusyChange?: (busy: boolean) => void
}

function fmtTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function mergeMessages(base: AdvisorMessage[], extra: AdvisorMessage[]): AdvisorMessage[] {
  const rows = new Map<string, AdvisorMessage>()
  for (const message of base) rows.set(message.id, message)
  for (const message of extra) rows.set(message.id, message)
  return Array.from(rows.values()).sort((a, b) => a.timestamp - b.timestamp)
}

export default function AdvisoryChamberPanel({
  gameId,
  advisorSessionId,
  turnNumber,
  disabled,
  onSessionUpdate,
  onPoliciesGenerated,
  onError,
  onCouncilBusyChange,
}: Props) {
  const [session, setSession] = useState<AdvisorSession | null>(null)
  const [question, setQuestion] = useState('')
  const [constraints, setConstraints] = useState('')
  const [loadingSession, setLoadingSession] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [generateBusy, setGenerateBusy] = useState(false)
  const [optimisticMayorMessage, setOptimisticMayorMessage] = useState<AdvisorMessage | null>(null)
  const [streamDrafts, setStreamDrafts] = useState<AdvisorMessage[]>([])
  const streamAbortRef = useRef<AbortController | null>(null)
  const onErrorRef = useRef(onError)
  const onSessionUpdateRef = useRef(onSessionUpdate)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onSessionUpdateRef.current = onSessionUpdate
  }, [onSessionUpdate])

  const chamberBusy = loadingSession || streaming || generateBusy

  useEffect(() => {
    onCouncilBusyChange?.(chamberBusy)
  }, [chamberBusy, onCouncilBusyChange])

  useEffect(() => {
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    setStreaming(false)
    setStreamDrafts([])
    setOptimisticMayorMessage(null)
  }, [gameId, turnNumber])

  useEffect(() => {
    if (!gameId) {
      setSession(null)
      return
    }

    let cancelled = false
    setLoadingSession(true)
    onErrorRef.current(null)

    const loadSession = async () => {
      try {
        let nextSession: AdvisorSession | null = null
        if (advisorSessionId) {
          try {
            const current = await fetchAdvisorSession(gameId, advisorSessionId)
            if (current.turn_number === turnNumber + 1) {
              nextSession = current
            }
          } catch {
            nextSession = null
          }
        }
        if (!nextSession) {
          nextSession = await createAdvisorSession(gameId)
        }
        if (cancelled) return
        setSession(nextSession)
        onSessionUpdateRef.current(nextSession.advisor_session_id)
      } catch (error) {
        if (cancelled) return
        onErrorRef.current(error instanceof Error ? error.message : 'Advisor chamber unavailable')
      } finally {
        if (!cancelled) setLoadingSession(false)
      }
    }

    void loadSession()
    return () => {
      cancelled = true
    }
  }, [gameId, advisorSessionId, turnNumber])

  useEffect(() => {
    if (!gameId || !session || session.session_status !== 'refining') return

    let cancelled = false
    let delay = 1500
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      try {
        const refreshed = await fetchAdvisorSession(gameId, session.advisor_session_id)
        if (cancelled) return
        setSession(refreshed)
        onSessionUpdateRef.current(refreshed.advisor_session_id)
        if (refreshed.session_status === 'refining') {
          delay = Math.min(3000, Math.round(delay * 1.4))
          timer = setTimeout(() => {
            void poll()
          }, delay)
        }
      } catch (error) {
        if (cancelled) return
        onErrorRef.current(error instanceof Error ? error.message : 'Advisor chamber refresh failed')
      }
    }

    timer = setTimeout(() => {
      void poll()
    }, delay)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [gameId, session?.advisor_session_id, session?.session_status])

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort()
    }
  }, [])

  const advisorsById = useMemo(() => {
    const map = new Map<string, { name: string }>()
    for (const advisor of session?.advisors ?? []) {
      map.set(advisor.advisor_id, { name: advisor.name })
    }
    return map
  }, [session?.advisors])

  const globalMessages: AdvisorMessage[] = useMemo(() => {
    const baseline = session?.global_thread ?? []
    const extras = [optimisticMayorMessage, ...streamDrafts].filter(Boolean) as AdvisorMessage[]
    return mergeMessages(baseline, extras)
  }, [session?.global_thread, optimisticMayorMessage, streamDrafts])

  const messageSpeakerById = useMemo(() => {
    const byId = new Map<string, string>()
    for (const message of globalMessages) {
      if (message.role !== 'advisor') continue
      const speaker = message.speaker_advisor_id
        ? advisorsById.get(message.speaker_advisor_id)?.name ?? 'Advisor'
        : 'Advisor'
      byId.set(message.id, speaker)
    }
    return byId
  }, [globalMessages, advisorsById])

  const applyStreamEvent = (event: AdvisorStreamEvent) => {
    if (event.event_type === 'session_snapshot') {
      setSession(event.session)
      onSessionUpdateRef.current(event.session.advisor_session_id)
      setOptimisticMayorMessage(null)
      setStreamDrafts([])
      return
    }
    if (event.event_type === 'advisor_message_start') {
      setStreamDrafts((current) => {
        if (current.some((item) => item.id === event.message_id)) return current
        return [
          ...current,
          {
            id: event.message_id,
            role: 'advisor',
            content: '',
            thread_scope: 'global',
            option_id: null,
            timestamp: event.timestamp,
            speaker_advisor_id: event.speaker_advisor_id,
            is_streaming: true,
          },
        ]
      })
      return
    }
    if (event.event_type === 'advisor_message_delta') {
      setStreamDrafts((current) =>
        current.map((item) =>
          item.id === event.message_id
            ? { ...item, content: `${item.content}${event.delta ?? ''}`, is_streaming: true }
            : item,
        ),
      )
      return
    }
    if (event.event_type === 'advisor_message_done') {
      setStreamDrafts((current) =>
        current.map((item) =>
          item.id === event.message_id
            ? {
                ...item,
                id: event.message_id,
                content: event.content ?? item.content,
                structured: event.structured ?? item.structured,
                is_streaming: false,
              }
            : item,
        ),
      )
      return
    }
    if (event.event_type === 'error') {
      throw new Error(event.message ?? 'Advisor stream failed')
    }
  }

  const onSendQuestion = async () => {
    if (!gameId || !session || !question.trim() || streaming) return
    onErrorRef.current(null)
    const trimmedQuestion = question.trim()
    setQuestion('')
    setOptimisticMayorMessage({
      id: `tmp-mayor-${Date.now()}`,
      role: 'user',
      content: trimmedQuestion,
      thread_scope: 'global',
      option_id: null,
      timestamp: Date.now() / 1000,
      is_pending: true,
    })
    setStreaming(true)

    const controller = new AbortController()
    streamAbortRef.current = controller

    try {
      await streamAdvisorMessage(
        gameId,
        session.advisor_session_id,
        {
          thread_scope: 'global',
          question: trimmedQuestion,
        },
        (event) => {
          if (event.event_type === 'done') {
            setStreaming(false)
            setStreamDrafts([])
            setOptimisticMayorMessage(null)
            return
          }
          applyStreamEvent(event)
        },
        controller.signal,
      )
      setStreaming(false)
      setStreamDrafts([])
      setOptimisticMayorMessage(null)
    } catch (_error) {
      if (controller.signal.aborted) {
        setStreaming(false)
        setStreamDrafts([])
        setOptimisticMayorMessage(null)
        return
      }
      try {
        const payload = await sendAdvisorMessage(gameId, session.advisor_session_id, {
          thread_scope: 'global',
          question: trimmedQuestion,
        })
        setSession(payload.session)
        onSessionUpdateRef.current(payload.session.advisor_session_id)
        setStreamDrafts([])
        setOptimisticMayorMessage(null)
      } catch (fallbackError) {
        onErrorRef.current(fallbackError instanceof Error ? fallbackError.message : 'Failed to send mayor question')
      } finally {
        setStreaming(false)
      }
    }
  }

  const onGeneratePolicies = async () => {
    if (!gameId || !session || generateBusy || streaming) return
    setGenerateBusy(true)
    onErrorRef.current(null)
    try {
      const payload = await generateAdvisorPolicies(gameId, session.advisor_session_id, {
        count: 3,
        constraints: constraints.trim(),
      })
      setSession(payload.session)
      onSessionUpdateRef.current(payload.session.advisor_session_id)
      onPoliciesGenerated(payload.policies)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Policy generation failed'
      if (message.includes('404')) {
        try {
          const fallback = await fetchPolicies(gameId)
          const fallbackPolicies = fallback.policies.slice(0, 3)
          if (fallbackPolicies.length > 0) {
            onSessionUpdateRef.current(fallback.advisorSessionId ?? session.advisor_session_id)
            onPoliciesGenerated(fallbackPolicies)
            return
          }
        } catch {
          // Continue with error handling below.
        }
      }
      onErrorRef.current(message)
    } finally {
      setGenerateBusy(false)
    }
  }

  return (
    <section className="panel" id="advisory-chamber">
      <div className="panel-title">Advisory Chamber</div>
      <div className="advisor-roster">
        {(session?.advisors ?? []).map((advisor) => (
          <article className="advisor-roster-card" key={advisor.advisor_id}>
            <div className="advisor-roster-name">{advisor.name}</div>
            <div className="advisor-roster-portfolios">{advisor.portfolios.join(' · ')}</div>
            <div className="advisor-roster-style">{advisor.style}</div>
          </article>
        ))}
        {!session && <div className="muted">Loading chamber roster…</div>}
      </div>

      {session?.session_status === 'refining' && (
        <div className="muted">Refining policies in background… chamber is ready.</div>
      )}

      <div className="advisor-thread chamber-thread">
        {globalMessages.length === 0 ? (
          <div className="muted">Council is ready. Ask a strategic question to start deliberation.</div>
        ) : (
          globalMessages.map((message) => {
            const isUser = message.role === 'user'
            const speaker = isUser
              ? 'Mayor'
              : message.speaker_advisor_id
                ? advisorsById.get(message.speaker_advisor_id)?.name ?? 'Advisor'
                : 'Council'
            const stance = message.structured?.stance
            const stanceLabel =
              stance === 'agree' || stance === 'challenge' || stance === 'extend'
                ? stance
                : null
            const respondingTo = (message.structured?.responds_to_message_ids ?? [])
              .map((messageId) => messageSpeakerById.get(messageId))
              .filter(Boolean) as string[]
            return (
              <div
                key={message.id}
                className={`advisor-message-row ${isUser ? 'advisor-message-row-right' : 'advisor-message-row-left'}`}
              >
                <article className={`advisor-message ${isUser ? 'advisor-user' : 'advisor-advisor'}`}>
                  <div className="advisor-message-head">
                    <span className="advisor-message-head-main">
                      <span>{speaker}</span>
                      {stanceLabel && <span className={`advisor-stance-chip stance-${stanceLabel}`}>{stanceLabel}</span>}
                    </span>
                    <span>{fmtTime(message.timestamp)}</span>
                  </div>
                  {respondingTo.length > 0 && (
                    <div className="advisor-responding-label">
                      Responding to {Array.from(new Set(respondingTo)).join(', ')}
                    </div>
                  )}
                  <div className="advisor-message-text">{message.content || (message.is_streaming ? '…' : '')}</div>
                </article>
              </div>
            )
          })
        )}
      </div>

      <div className="advisor-composer">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={2}
          disabled={disabled || streaming || !session}
          placeholder="Ask the advisory chamber about risks, coalition impact, and strategic timing."
        />
        <div className="advisor-composer-actions">
          <button onClick={onSendQuestion} disabled={streaming || disabled || !session || !question.trim()}>
            {streaming ? 'Advisors Responding…' : 'Send to Advisors'}
          </button>
        </div>
      </div>

      <div className="advisor-generate">
        <textarea
          value={constraints}
          onChange={(event) => setConstraints(event.target.value)}
          rows={2}
          disabled={generateBusy || disabled || !session || streaming}
          placeholder="Optional constraints for generation (e.g. jobs + trust, low backlash risk)."
        />
        <button onClick={onGeneratePolicies} disabled={generateBusy || disabled || !session || streaming}>
          {generateBusy ? 'Generating…' : 'Generate Policy'}
        </button>
      </div>
    </section>
  )
}
