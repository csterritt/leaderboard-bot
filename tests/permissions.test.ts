import { describe, it, expect } from 'vitest'
import { hasAdministratorPermission } from '../src/utils/permissions'

describe('hasAdministratorPermission', () => {
  it('returns true when the ADMINISTRATOR bit (0x8) is set', () => {
    expect(hasAdministratorPermission('8')).toBe(true)
  })

  it('returns true when ADMINISTRATOR is combined with other bits', () => {
    const combined = (0x8n | 0x4n | 0x2n).toString()
    expect(hasAdministratorPermission(combined)).toBe(true)
  })

  it('returns false when the ADMINISTRATOR bit is absent', () => {
    expect(hasAdministratorPermission('4')).toBe(false)
  })

  it('returns false for "0"', () => {
    expect(hasAdministratorPermission('0')).toBe(false)
  })

  it('handles large permission strings as BigInt correctly', () => {
    const bigPerms = ((2n ** 40n) | 0x8n).toString()
    expect(hasAdministratorPermission(bigPerms)).toBe(true)
  })

  it('returns false for large permission strings without the ADMINISTRATOR bit', () => {
    const bigPerms = (2n ** 40n).toString()
    expect(hasAdministratorPermission(bigPerms)).toBe(false)
  })
})
