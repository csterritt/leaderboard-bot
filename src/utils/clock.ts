export interface Clock {
  now(): number
  set(t: number): void
  advance(secs: number): void
  hasPassed(t: number): boolean
  reset(): void
}

export const createClock = (): Clock => {
  let fixed: number | null = null

  return {
    now(): number {
      return fixed !== null ? fixed : Math.floor(Date.now() / 1000)
    },
    set(t: number): void {
      fixed = t
    },
    advance(secs: number): void {
      fixed = (fixed !== null ? fixed : Math.floor(Date.now() / 1000)) + secs
    },
    hasPassed(t: number): boolean {
      return this.now() >= t
    },
    reset(): void {
      fixed = null
    },
  }
}
