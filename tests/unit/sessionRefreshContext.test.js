import { describe, expect, it, vi } from 'vitest'
import {
  completeRefreshStepUp,
  ensureAccessSession,
  isRefreshStepUpRequired
} from '@/utils/sessionRefresh'
import {
  getStoredTenantContext,
  getToken,
  setSession
} from '@/utils/session'
import { createUnsignedTestToken } from '../fixtures/session'

const transportMocks = vi.hoisted(() => ({
  requestRefreshStepUp: vi.fn(),
  requestSessionLogout: vi.fn(),
  requestSessionRefresh: vi.fn()
}))

vi.mock('@/api/sessionTransport', () => transportMocks)

function authFor(tenantCode, tokenId) {
  const context = {
    contextType: 'TENANT',
    tenantCode
  }
  return {
    token: createUnsignedTestToken({
      sub: '71',
      role: 1,
      contextType: context.contextType,
      tenantCode,
      jti: tokenId,
      exp: 4102444800
    }),
    role: 1,
    context
  }
}

describe('session refresh context epoch', () => {
  it('cancels a late refresh without replacing the newer context and releases currentRefresh', async () => {
    const oldSession = authFor('tenant-old', 'old-access')
    setSession(oldSession)

    let releaseOldRefresh
    transportMocks.requestSessionRefresh.mockImplementationOnce(() => (
      new Promise((resolve) => {
        releaseOldRefresh = resolve
      })
    ))

    const staleRefresh = ensureAccessSession({
      force: true,
      failedToken: oldSession.token
    })
    await vi.waitFor(() => {
      expect(transportMocks.requestSessionRefresh).toHaveBeenCalledTimes(1)
    })

    const replacement = authFor('tenant-new', 'new-context')
    setSession(replacement, {}, 'context')
    releaseOldRefresh({
      code: 200,
      data: authFor('tenant-old', 'late-refresh')
    })

    await expect(staleRefresh).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    expect(getToken()).toBe(replacement.token)
    expect(getStoredTenantContext()?.tenantCode).toBe('tenant-new')

    const nextRefresh = authFor('tenant-new', 'next-refresh')
    transportMocks.requestSessionRefresh.mockResolvedValueOnce({
      code: 200,
      data: nextRefresh
    })

    await expect(ensureAccessSession({
      force: true,
      failedToken: replacement.token
    })).resolves.toMatchObject({
      token: nextRefresh.token,
      context: { tenantCode: 'tenant-new' }
    })
    expect(transportMocks.requestSessionRefresh).toHaveBeenCalledTimes(2)
  })

  it('cancels a late step-up without replacing the newer context or clearing its marker', async () => {
    const oldSession = authFor('tenant-old', 'old-step-up')
    setSession(oldSession)
    localStorage.setItem('wifi:refresh-step-up:v1', JSON.stringify({
      required: true,
      expiresAt: Date.now() + 60_000
    }))

    let releaseOldStepUp
    transportMocks.requestRefreshStepUp.mockImplementationOnce(() => (
      new Promise((resolve) => {
        releaseOldStepUp = resolve
      })
    ))

    const staleStepUp = completeRefreshStepUp({
      codeId: 'test-code-id',
      code: '000000'
    })
    await vi.waitFor(() => {
      expect(transportMocks.requestRefreshStepUp).toHaveBeenCalledTimes(1)
    })

    const replacement = authFor('tenant-new', 'new-step-up-context')
    setSession(replacement, {}, 'context')
    releaseOldStepUp({
      code: 200,
      data: authFor('tenant-old', 'late-step-up')
    })

    await expect(staleStepUp).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    expect(getToken()).toBe(replacement.token)
    expect(getStoredTenantContext()?.tenantCode).toBe('tenant-new')
    expect(isRefreshStepUpRequired()).toBe(true)
  })
})
