import { describe, expect, it } from 'vitest'
import {
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
  ROLE_USER,
  canAccessRoles,
  canManageUserTarget,
  normalizeRole
} from '@/utils/access'

describe('access utilities', () => {
  it('preserves super-admin role zero and fails unknown roles closed', () => {
    expect(normalizeRole(0)).toBe(ROLE_SUPER_ADMIN)
    expect(normalizeRole(' 1 ')).toBe(ROLE_ADMIN)
    expect(normalizeRole('unknown')).toBe(ROLE_USER)
  })

  it('checks route roles against the normalized current role', () => {
    expect(canAccessRoles([ROLE_SUPER_ADMIN], 0)).toBe(true)
    expect(canAccessRoles([ROLE_SUPER_ADMIN], ROLE_ADMIN)).toBe(false)
    expect(canAccessRoles([], ROLE_USER)).toBe(true)
  })

  it('does not let admins manage themselves or unknown target roles', () => {
    expect(canManageUserTarget(ROLE_ADMIN, '10', { userId: '10', role: ROLE_USER }))
      .toBe(false)
    expect(canManageUserTarget(ROLE_SUPER_ADMIN, '10', { userId: '11' }))
      .toBe(false)
    expect(canManageUserTarget(ROLE_ADMIN, '10', { userId: '11', role: ROLE_USER }))
      .toBe(true)
  })
})
