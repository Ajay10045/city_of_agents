import type { ActiveEvent } from '../../types'
import { hashString } from '../../lib/rng'

// ─── Event → visual effect mapping ───────────────────────────────────────────

export type EffectKind =
  | 'fire' | 'flood' | 'protest' | 'outbreak' | 'quake' | 'haze'
  | 'blackout' | 'crisis_generic' | 'sparkle' | 'crane'

export function effectForEvent(ev: ActiveEvent): EffectKind {
  const n = ev.name.toLowerCase()
  if (ev.type === 'opportunity') {
    if (/(infrastructure|construction|housing|fund|investment|tech)/.test(n)) return 'crane'
    return 'sparkle'
  }
  if (/(fire|blaze)/.test(n)) return 'fire'
  if (/(flood|monsoon|storm|surge|rain|water main|erosion)/.test(n)) return 'flood'
  if (/(strike|protest|unrest|riot)/.test(n)) return 'protest'
  if (/(disease|outbreak|health|epidemic|virus)/.test(n)) return 'outbreak'
  if (/(earthquake|quake)/.test(n)) return 'quake'
  if (/(heat|dust|smog|air)/.test(n)) return 'haze'
  if (/(power|grid|blackout)/.test(n)) return 'blackout'
  return 'crisis_generic'
}

/** Deterministically pin an event to a district (stable per event id). */
export function eventDistrictIndex(ev: ActiveEvent, districtCount: number): number {
  return districtCount > 0 ? hashString(ev.id) % districtCount : 0
}

/** Keyframes used by the effect sprites — mount once inside the map container. */
export const EFFECT_KEYFRAMES = `
@keyframes coaPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
@keyframes coaFlicker { 0%,100% { transform: scaleY(1) } 40% { transform: scaleY(1.12) skewX(2deg) } 70% { transform: scaleY(0.92) skewX(-2deg) } }
@keyframes coaSmoke { 0% { transform: translateY(0); opacity: 0.5 } 100% { transform: translateY(-12px); opacity: 0 } }
@keyframes coaWave { 0%,100% { transform: translateX(0) } 50% { transform: translateX(4px) } }
@keyframes coaBob { 0%,100% { transform: translateY(0) rotate(-2deg) } 50% { transform: translateY(-2.5px) rotate(2deg) } }
@keyframes coaRing { 0% { r: 6; opacity: 0.8 } 100% { r: 22; opacity: 0 } }
@keyframes coaShake { 0%,100% { transform: translate(0,0) } 25% { transform: translate(-1.2px,0.8px) } 75% { transform: translate(1.2px,-0.8px) } }
@keyframes coaDrift { 0%,100% { transform: translateX(-4px) } 50% { transform: translateX(4px) } }
@keyframes coaTwinkle { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.3; transform: scale(0.7) } }
@keyframes coaSwing { 0%,100% { transform: rotate(-6deg) } 50% { transform: rotate(6deg) } }
.coa-pulse { animation: coaPulse 2.2s ease-in-out infinite }
.coa-flicker { animation: coaFlicker 0.7s ease-in-out infinite; transform-origin: center bottom }
.coa-flicker2 { animation: coaFlicker 0.5s ease-in-out infinite reverse; transform-origin: center bottom }
.coa-smoke { animation: coaSmoke 2.4s linear infinite }
.coa-smoke2 { animation: coaSmoke 3s linear 0.8s infinite }
.coa-wave { animation: coaWave 1.6s ease-in-out infinite }
.coa-wave2 { animation: coaWave 1.9s ease-in-out 0.4s infinite reverse }
.coa-bob { animation: coaBob 1.4s ease-in-out infinite; transform-origin: center bottom }
.coa-bob2 { animation: coaBob 1.7s ease-in-out 0.3s infinite; transform-origin: center bottom }
.coa-ring { animation: coaRing 1.8s ease-out infinite }
.coa-ring2 { animation: coaRing 1.8s ease-out 0.9s infinite }
.coa-shake { animation: coaShake 0.35s linear infinite }
.coa-drift { animation: coaDrift 4s ease-in-out infinite }
.coa-drift2 { animation: coaDrift 5s ease-in-out 1s infinite reverse }
.coa-twinkle { animation: coaTwinkle 1.6s ease-in-out infinite }
.coa-twinkle2 { animation: coaTwinkle 2s ease-in-out 0.5s infinite }
.coa-twinkle3 { animation: coaTwinkle 1.3s ease-in-out 0.9s infinite }
.coa-swing { animation: coaSwing 3.5s ease-in-out infinite; transform-origin: 0 -14px }
@media (prefers-reduced-motion: reduce) {
  .coa-pulse, .coa-flicker, .coa-flicker2, .coa-smoke, .coa-smoke2, .coa-wave, .coa-wave2,
  .coa-bob, .coa-bob2, .coa-ring, .coa-ring2, .coa-shake, .coa-drift, .coa-drift2,
  .coa-twinkle, .coa-twinkle2, .coa-twinkle3, .coa-swing { animation: none }
}
`
