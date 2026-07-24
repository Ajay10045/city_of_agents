import type { CitizenVoice } from '../types'

// ─── Vote event bus ───────────────────────────────────────────────────────────
// A tiny pub/sub so the live turn stream (in GameDashboard) can push per-citizen
// approval votes to the crowd visualization without threading callbacks through
// the whole component tree. One shared instance per app is fine.

export interface VoteEvent {
  voice: CitizenVoice
  weight: number
}

export type PollPhase = 'idle' | 'polling' | 'done'

type VoteListener = (ev: VoteEvent) => void
type PhaseListener = (phase: PollPhase) => void

class VoteBus {
  private voteListeners = new Set<VoteListener>()
  private phaseListeners = new Set<PhaseListener>()
  phase: PollPhase = 'idle'

  onVote(fn: VoteListener): () => void {
    this.voteListeners.add(fn)
    return () => this.voteListeners.delete(fn)
  }

  onPhase(fn: PhaseListener): () => void {
    this.phaseListeners.add(fn)
    return () => this.phaseListeners.delete(fn)
  }

  emitVote(ev: VoteEvent) {
    for (const fn of this.voteListeners) fn(ev)
  }

  setPhase(phase: PollPhase) {
    this.phase = phase
    for (const fn of this.phaseListeners) fn(phase)
  }
}

export const voteBus = new VoteBus()
