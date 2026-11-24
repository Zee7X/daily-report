import { NO_NAV, type PickedCard, type PickerNav } from '@/components/card-picker'
import type { TargetDraft, TargetMode } from '@/components/target-chooser'

// Unsent New Report form, kept in localStorage per user. Ids and display text only: no tokens, no card bodies.
export type Draft = {
  v: 1
  savedAt: number
  templateId: string
  title: string
  titleTouched: boolean
  sourceMode: 'cards' | 'write'
  provider: string
  sources: PickedCard[]
  notes: string
  sourceNav: PickerNav
  target: TargetDraft
}

const MAX_AGE = 7 * 24 * 60 * 60 * 1000

const draftKey = (uid: string) => `dr:new-report:${uid}`
const lastKey = (uid: string, provider: string) => `dr:last-board:${uid}:${provider}`

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const isStr = (x: unknown): x is string => typeof x === 'string'
const isNav = (x: unknown): x is PickerNav => isObj(x) && isStr(x.board) && isStr(x.column)
const isCard = (x: unknown): x is PickedCard =>
  isObj(x) && isStr(x.provider) && isStr(x.cardId) && isStr(x.title) && (x.url === null || isStr(x.url))
const MODES: TargetMode[] = ['card', 'webhook', 'none']
const isTarget = (x: unknown): x is TargetDraft =>
  isObj(x) &&
  MODES.includes(x.mode as TargetMode) &&
  isStr(x.provider) &&
  typeof x.same === 'boolean' &&
  (x.card === null || isCard(x.card)) &&
  isStr(x.dest) &&
  isNav(x.nav)

const isDraft = (x: unknown): x is Draft =>
  isObj(x) &&
  x.v === 1 &&
  typeof x.savedAt === 'number' &&
  isStr(x.templateId) &&
  isStr(x.title) &&
  typeof x.titleTouched === 'boolean' &&
  (x.sourceMode === 'cards' || x.sourceMode === 'write') &&
  isStr(x.provider) &&
  Array.isArray(x.sources) &&
  x.sources.every(isCard) &&
  isStr(x.notes) &&
  isNav(x.sourceNav) &&
  isTarget(x.target)

// Storage can throw (private mode, quota); a lost draft must never break the form.
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function clearDraft(uid: string) {
  safe(() => localStorage.removeItem(draftKey(uid)), undefined)
}

// Returns null, and deletes the entry, when it is malformed, from another version, or older than 7 days.
export function readDraft(uid: string): Draft | null {
  const raw = safe(() => localStorage.getItem(draftKey(uid)), null)
  if (!raw) return null
  const d = safe<unknown>(() => JSON.parse(raw), null)
  if (isDraft(d) && Date.now() - d.savedAt <= MAX_AGE) return d
  clearDraft(uid)
  return null
}

export function writeDraft(uid: string, d: Omit<Draft, 'v' | 'savedAt'>) {
  const full: Draft = { v: 1, savedAt: Date.now(), ...d }
  safe(() => localStorage.setItem(draftKey(uid), JSON.stringify(full)), undefined)
}

export function readLastBoard(uid: string, provider: string): PickerNav {
  if (!provider) return NO_NAV
  const n = safe<unknown>(() => JSON.parse(localStorage.getItem(lastKey(uid, provider)) ?? 'null'), null)
  return isNav(n) ? n : NO_NAV
}

export function writeLastBoard(uid: string, provider: string, nav: PickerNav) {
  safe(() => localStorage.setItem(lastKey(uid, provider), JSON.stringify(nav)), undefined)
}
