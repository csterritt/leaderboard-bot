import { EIGHT_HOURS_SECS, THIRTY_SIX_HOURS_SECS } from '../constants'
import type { StreakDeltaKind } from '../types'

export const parseDiscordTimestamp = (iso: string): number =>
  Math.floor(new Date(iso).getTime() / 1000)

export const computeStreakDelta = (deltaSecs: number | null): StreakDeltaKind => {
  if (deltaSecs === null) return 'first'
  const d = Math.max(0, deltaSecs)
  if (d <= EIGHT_HOURS_SECS) return 'noop'
  if (d <= THIRTY_SIX_HOURS_SECS) return 'increment'
  return 'reset'
}
