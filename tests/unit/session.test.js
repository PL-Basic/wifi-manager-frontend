import { describe, expect, it } from 'vitest'
import {
  clearSession,
  getSessionSnapshot,
  getStoredRole,
  normalizeTenantContext,
  setSession
} from '@/utils/session'
import { createUnsignedTestToken } from '../fixtures/session'

describe('session utilities', () => {
  it('preserves Long IDs as strings and normalizes tenant authorities', () => {
    const context = normalizeTenantContext({
      contextType: 'TENANT',
      tenantId: '9223372036854775807',
      tenantCode: 'tenant-a',
      authorities: ['MEMBER', ' MEMBER ', '', 'MEMBER'],
      writable: true
    })

    expect(context).toMatchObject({
      contextType: 'TENANT',
      tenantId: '9223372036854775807',
      tenantCode: 'tenant-a',
      authorities: ['MEMBER'],
      writable: true
    })
  })

  it('keeps role zero and stores the token tenant context', () => {
    const token = createUnsignedTestToken({
      sub: '9007199254740993',
      role: 0,
      contextType: 'PLATFORM',
      exp: 4102444800
    })

    setSession({ token, username: 'platform-admin', role: 0 })

    expect(getStoredRole()).toBe(0)
    expect(getSessionSnapshot()).toMatchObject({
      token,
      username: 'platform-admin',
      role: 0,
      context: {
        contextType: 'PLATFORM',
        tenantId: ''
      }
    })
  })

  it('clears authentication state and records a user-facing reason', () => {
    localStorage.setItem('token', 'test-only-token')
    localStorage.setItem('tenantContext', '{"contextType":"TENANT"}')

    clearSession('登录状态已过期', false)

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('tenantContext')).toBeNull()
    expect(sessionStorage.getItem('authMessage')).toBe('登录状态已过期')
  })
})
