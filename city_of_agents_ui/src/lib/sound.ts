// ─── Sound manager ────────────────────────────────────────────────────────────
// WebAudio-synthesized SFX stingers (no audio assets) + control over the existing
// background music <audio> element. Everything is gated behind the first user
// gesture so it satisfies browser autoplay policy and no-ops before unlock.

type StingerName =
  | 'breaking'      // breaking-news sting
  | 'vote_up'       // approve blip (major)
  | 'vote_down'     // disapprove blip (minor)
  | 'phase'         // camera-cut whoosh
  | 'crisis'        // alarm
  | 'win'           // approval rose sting

class SoundManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private unlocked = false
  private lastStingerAt: Record<string, number> = {}

  sfxEnabled = true

  /** Call from a user gesture handler to satisfy autoplay policy. */
  unlock() {
    if (this.unlocked) return
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
      this.unlocked = true
    } catch {
      /* WebAudio unavailable — stingers silently no-op */
    }
  }

  setSfxEnabled(on: boolean) {
    this.sfxEnabled = on
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, sweepTo?: number) {
    if (!this.ctx || !this.master) return
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  private noise(dur: number, gain: number, filterFreq: number) {
    if (!this.ctx || !this.master) return
    const t0 = this.ctx.currentTime
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = filterFreq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.master)
    src.start(t0)
    src.stop(t0 + dur)
  }

  play(name: StingerName, { throttleMs = 0 }: { throttleMs?: number } = {}) {
    if (!this.sfxEnabled || !this.unlocked) return
    const now = performance.now()
    if (throttleMs > 0 && now - (this.lastStingerAt[name] ?? 0) < throttleMs) return
    this.lastStingerAt[name] = now
    switch (name) {
      case 'breaking':
        this.tone(440, 0.14, 'square', 0.16)
        this.tone(660, 0.22, 'square', 0.14, 0.12)
        break
      case 'vote_up':
        this.tone(880, 0.09, 'triangle', 0.09)
        break
      case 'vote_down':
        this.tone(320, 0.11, 'sawtooth', 0.08, 0, 240)
        break
      case 'phase':
        this.noise(0.28, 0.06, 1200)
        break
      case 'crisis':
        this.tone(220, 0.5, 'sawtooth', 0.12, 0, 180)
        break
      case 'win':
        this.tone(523, 0.12, 'triangle', 0.12)
        this.tone(659, 0.12, 'triangle', 0.12, 0.1)
        this.tone(784, 0.24, 'triangle', 0.14, 0.2)
        break
    }
  }
}

export const sound = new SoundManager()
