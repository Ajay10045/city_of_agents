import type { ReactNode } from 'react'

export type ReasoningInlinePart = {
  kind: 'text' | 'bold' | 'italic'
  text: string
}

export type ReasoningBlock = {
  kind: 'header' | 'bullet' | 'text'
  raw: string
  parts: ReasoningInlinePart[]
}

function parseInline(text: string): ReasoningInlinePart[] {
  const parts: ReasoningInlinePart[] = []
  let i = 0
  let buffer = ''

  const flushText = () => {
    if (!buffer) return
    parts.push({ kind: 'text', text: buffer })
    buffer = ''
  }

  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const close = text.indexOf('**', i + 2)
      if (close !== -1) {
        flushText()
        parts.push({ kind: 'bold', text: text.slice(i + 2, close) })
        i = close + 2
        continue
      }
    }

    if (text[i] === '*') {
      const close = text.indexOf('*', i + 1)
      if (close !== -1) {
        flushText()
        parts.push({ kind: 'italic', text: text.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }

    buffer += text[i]
    i += 1
  }

  flushText()
  return parts.length > 0 ? parts : [{ kind: 'text', text }]
}

export function parseReasoning(raw: string): ReasoningBlock[] {
  const lines = raw.split(/\r?\n/)
  const blocks: ReasoningBlock[] = []

  for (const line of lines) {
    const compact = line.trim()
    if (!compact) continue

    if (/^##\s+/.test(compact)) {
      const content = compact.replace(/^##\s+/, '')
      blocks.push({
        kind: 'header',
        raw: content,
        parts: parseInline(content),
      })
      continue
    }

    if (/^-\s+/.test(compact)) {
      const content = compact.replace(/^-\s+/, '')
      blocks.push({
        kind: 'bullet',
        raw: content,
        parts: parseInline(content),
      })
      continue
    }

    blocks.push({
      kind: 'text',
      raw: line,
      parts: parseInline(line),
    })
  }

  return blocks
}

export function renderReasoningInline(parts: ReasoningInlinePart[], keyPrefix: string): ReactNode[] {
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${idx}`
    if (part.kind === 'bold') return <strong key={key}>{part.text}</strong>
    if (part.kind === 'italic') return <em key={key}>{part.text}</em>
    return <span key={key}>{part.text}</span>
  })
}

