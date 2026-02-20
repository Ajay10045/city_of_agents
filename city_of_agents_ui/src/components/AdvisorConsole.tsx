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

type ComposerIntent =
  | { kind: 'ask'; question: string }
  | { kind: 'revise-single'; constraints: string }
  | { kind: 'revise-full'; constraints: string }

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function stripCommandPrefix(input: string, prefixes: string[]): string {
  const trimmed = input.trim()
  const lower = trimmed.toLowerCase()
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim()
    }
  }
  return trimmed
}

function parseComposerIntent(input: string, activeTab: 'global' | string): ComposerIntent {
  const trimmed = input.trim()
  const lower = trimmed.toLowerCase()

  const explicitFullPrefixes = ['/regenerate', '/revise-all', '/revise all']
  if (explicitFullPrefixes.some((prefix) => lower.startsWith(prefix))) {
    return {
      kind: 'revise-full',
      constraints: stripCommandPrefix(trimmed, explicitFullPrefixes),
    }
  }

  const explicitSinglePrefixes = ['/revise', '/revise-this', '/revise this']
  if (explicitSinglePrefixes.some((prefix) => lower.startsWith(prefix))) {
    const constraints = stripCommandPrefix(trimmed, explicitSinglePrefixes)
    if (activeTab === 'global') {
      return { kind: 'revise-full', constraints }
    }
    return { kind: 'revise-single', constraints }
  }

  const asksForAll =
    /(regenerate|refresh|replace|revise|rewrite).*(all|5|five|option set|entire set)/i.test(trimmed) ||
    /(new|fresh).*(all|options)/i.test(trimmed)
  if (asksForAll) {
    return { kind: 'revise-full', constraints: trimmed }
  }

  const asksForSingle =
    /(revise|rewrite|improve|rework|replace).*(this|option|selected)/i.test(trimmed) ||
    /(make this|tune this)/i.test(trimmed)
  if (asksForSingle && activeTab !== 'global') {
    return { kind: 'revise-single', constraints: trimmed }
  }

  return { kind: 'ask', question: trimmed }
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
  const [composer, setComposer] = useState('')
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

  const sendComposer = async () => {
    if (!gameId || !session || !composer.trim() || busy) return

    setBusy(true)
    onError(null)
    try {
      const intent = parseComposerIntent(composer, activeTab)
      if (intent.kind === 'ask') {
        const payload = await sendAdvisorMessage(gameId, session.advisor_session_id, {
          thread_scope: activeTab === 'global' ? 'global' : 'option',
          option_id: activeTab === 'global' ? null : activeTab,
          question: intent.question,
        })
        setSession(payload.session)
        onPoliciesUpdate(payload.session.options)
        onSessionUpdate(payload.session.advisor_session_id)
        setComposer('')
      } else if (intent.kind === 'revise-single') {
        if (activeTab === 'global') {
          onError('Select an option tab to revise a single option, or ask to regenerate all.')
          return
        }
        const result = await reviseAdvisorOptions(gameId, session.advisor_session_id, {
          mode: 'single',
          constraints: intent.constraints,
          option_id: activeTab,
        })
        setSession(result.session)
        onPoliciesUpdate(result.options)
        onSessionUpdate(result.session.advisor_session_id)
        setComposer('')
      } else {
        const result = await reviseAdvisorOptions(gameId, session.advisor_session_id, {
          mode: 'full',
          constraints: intent.constraints,
        })
        setSession(result.session)
        onPoliciesUpdate(result.options)
        onSessionUpdate(result.session.advisor_session_id)
        setActiveTab('global')
        setComposer('')
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Advisor request failed')
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
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              rows={2}
              placeholder={
                activeTab === 'global'
                  ? 'Unified council chat: ask strategy, or type "regenerate all options for jobs + trust"...'
                  : 'Unified council chat: ask this option, or type "revise this for low-income wards"...'
              }
              disabled={busy || disabled}
            />
            <div className="advisor-composer-actions">
              <button onClick={sendComposer} disabled={busy || disabled || !composer.trim()}>
                {busy ? 'Council Thinking…' : 'Send to Council'}
              </button>
            </div>
            <div className="advisor-composer-hint">
              Tip: use natural language. Examples: "why this now?", "revise this for commuters", "regenerate all focusing corruption + jobs".
            </div>
          </div>
        </>
      ) : (
        <div className="muted">Loading advisor session…</div>
      )}
    </section>
  )
}
