import { useEffect, useMemo, useState } from 'react'
import {
  createAdvisorSession,
  reviseAdvisorOptions,
  sendAdvisorMessage,
} from '../api'
import type { AdvisorMessage, AdvisorSession, DynamicPolicy } from '../types'

type Props = {
  gameId: string | null
  advisorSessionId: string | null
  turnNumber: number
  policies: DynamicPolicy[]
  disabled: boolean
  focusOptionId?: string | null
  onPoliciesUpdate: (policies: DynamicPolicy[]) => void
  onSessionUpdate: (sessionId: string) => void
  onError: (message: string | null) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AdvisorConsole({
  gameId,
  advisorSessionId,
  turnNumber,
  policies,
  disabled,
  focusOptionId,
  onPoliciesUpdate,
  onSessionUpdate,
  onError,
}: Props) {
  const [session, setSession] = useState<AdvisorSession | null>(null)
  const [activeTab, setActiveTab] = useState<'global' | string>('global')
  const [question, setQuestion] = useState('')
  const [constraints, setConstraints] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!gameId) {
      setSession(null)
      return
    }

    if (advisorSessionId && policies.length > 0) {
      setBusy(false)
      setSession((current) => {
        const isSameSession = current?.advisor_session_id === advisorSessionId
        const isSameTurn = current?.turn_number === turnNumber + 1
        const optionThreads: Record<string, AdvisorMessage[]> = {}
        for (const option of policies) {
          optionThreads[option.id] = current?.option_threads?.[option.id] ?? []
        }
        if (isSameSession && isSameTurn && current) {
          return {
            ...current,
            options: policies,
            option_threads: optionThreads,
            updated_at: current.updated_at,
          }
        }
        return {
          advisor_session_id: advisorSessionId,
          turn_number: turnNumber + 1,
          options: policies,
          global_thread: [],
          option_threads: optionThreads,
          created_at: Date.now() / 1000,
          updated_at: Date.now() / 1000,
        }
      })
      setActiveTab('global')
      return
    }

    if (policies.length === 0) {
      setBusy(false)
      return
    }

    setBusy(true)
    createAdvisorSession(gameId)
      .then((result) => {
        setSession(result)
        onPoliciesUpdate(result.options)
        onSessionUpdate(result.advisor_session_id)
        setActiveTab('global')
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : 'Advisor unavailable')
      })
      .finally(() => setBusy(false))
  }, [gameId, advisorSessionId, turnNumber, policies, onPoliciesUpdate, onSessionUpdate, onError])

  useEffect(() => {
    if (!focusOptionId || !session) return
    if (session.option_threads[focusOptionId] || session.options.some((option) => option.id === focusOptionId)) {
      setActiveTab(focusOptionId)
    }
  }, [focusOptionId, session])

  const activeMessages = useMemo(() => {
    if (!session) return [] as AdvisorMessage[]
    if (activeTab === 'global') return session.global_thread ?? []
    return session.option_threads?.[activeTab] ?? []
  }, [session, activeTab])

  const selectedOptionName = useMemo(() => {
    if (!session || activeTab === 'global') return null
    return session.options.find((option) => option.id === activeTab)?.name ?? 'Selected Option'
  }, [session, activeTab])

  const askQuestion = async () => {
    if (!gameId || !session || !question.trim() || busy) return

    setBusy(true)
    onError(null)
    try {
      const payload = await sendAdvisorMessage(gameId, session.advisor_session_id, {
        thread_scope: activeTab === 'global' ? 'global' : 'option',
        option_id: activeTab === 'global' ? null : activeTab,
        question: question.trim(),
      })
      setSession(payload.session)
      onPoliciesUpdate(payload.session.options)
      onSessionUpdate(payload.session.advisor_session_id)
      setQuestion('')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Advisor question failed')
    } finally {
      setBusy(false)
    }
  }

  const revise = async (mode: 'single' | 'full') => {
    if (!gameId || !session || busy) return
    if (mode === 'single' && activeTab === 'global') {
      onError('Select a specific option tab before revising one option.')
      return
    }

    setBusy(true)
    onError(null)
    try {
      const result = await reviseAdvisorOptions(gameId, session.advisor_session_id, {
        mode,
        constraints: constraints.trim(),
        option_id: mode === 'single' ? activeTab : undefined,
      })
      setSession(result.session)
      onPoliciesUpdate(result.options)
      onSessionUpdate(result.session.advisor_session_id)
      if (mode === 'full') {
        setActiveTab('global')
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Advisor revise failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" id="advisor-console">
      <div className="panel-title">Advisor Console</div>
      {session ? (
        <>
          <div className="advisor-tabs">
            <button
              className={`advisor-tab ${activeTab === 'global' ? 'active' : ''}`}
              onClick={() => setActiveTab('global')}
              disabled={busy}
            >
              Global
            </button>
            {session.options.map((option) => (
              <button
                key={option.id}
                className={`advisor-tab ${activeTab === option.id ? 'active' : ''}`}
                onClick={() => setActiveTab(option.id)}
                disabled={busy}
                title={option.name}
              >
                {option.name}
              </button>
            ))}
          </div>

          {activeTab !== 'global' && (
            <div className="advisor-option-head">
              <strong>{selectedOptionName}</strong>
            </div>
          )}

          <div className="advisor-thread">
            {activeMessages.length === 0 ? (
              <div className="muted">No messages yet. Ask why this option was recommended.</div>
            ) : (
              activeMessages.map((message) => (
                <article key={message.id} className={`advisor-message advisor-${message.role}`}>
                  <div className="advisor-message-head">
                    <span>{message.role === 'user' ? 'You' : 'Advisor'}</span>
                    <span>{formatTime(message.timestamp)}</span>
                  </div>
                  <div className="advisor-message-text">{message.content}</div>
                  {message.structured && (
                    <div className="advisor-structured">
                      {message.structured.drivers && message.structured.drivers.length > 0 && (
                        <div>Drivers: {message.structured.drivers.join(' · ')}</div>
                      )}
                      {message.structured.assumptions && message.structured.assumptions.length > 0 && (
                        <div>Assumptions: {message.structured.assumptions.join(' · ')}</div>
                      )}
                      {message.structured.tradeoffs && message.structured.tradeoffs.length > 0 && (
                        <div>Tradeoffs: {message.structured.tradeoffs.join(' · ')}</div>
                      )}
                      {message.structured.risk && <div>Risk: {message.structured.risk}</div>}
                      {typeof message.structured.confidence === 'number' && (
                        <div>Confidence: {(message.structured.confidence * 100).toFixed(0)}%</div>
                      )}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>

          <div className="advisor-composer">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder={
                activeTab === 'global'
                  ? 'Ask the advisor about strategic posture for this turn...'
                  : 'Ask follow-up on this option: why now, risks, alternatives...'
              }
              disabled={busy || disabled}
            />
            <button onClick={askQuestion} disabled={busy || disabled || !question.trim()}>
              Ask Advisor
            </button>
          </div>

          <div className="advisor-revise">
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={2}
              placeholder="Constraints for revision (example: prioritize jobs + anti-corruption in low-trust wards)."
              disabled={busy || disabled}
            />
            <div className="advisor-revise-actions">
              <button
                onClick={() => revise('single')}
                disabled={busy || disabled || activeTab === 'global'}
              >
                Revise This Option
              </button>
              <button onClick={() => revise('full')} disabled={busy || disabled}>
                Regenerate 5 Options
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="muted">Loading advisor session…</div>
      )}
    </section>
  )
}
