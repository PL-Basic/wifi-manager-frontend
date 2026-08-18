import { describe, expect, it, vi } from 'vitest'
import http from '@/api/http'
import { setSession } from '@/utils/session'
import { createUnsignedTestToken } from '../fixtures/session'

function testSession(tenantCode) {
  return {
    token: createUnsignedTestToken({
      sub: '51',
      role: 1,
      contextType: 'TENANT',
      tenantCode,
      exp: 4102444800
    }),
    role: 1
  }
}

describe('context-aware HTTP requests', () => {
  it('aborts an old request and rejects its late response after context changes', async () => {
    setSession(testSession('tenant-a'))

    let capturedConfig
    let releaseResponse
    const request = http.get('/devices', {
      adapter: (config) => {
        capturedConfig = config
        return new Promise((resolve) => {
          releaseResponse = () => resolve({
            data: { code: 200, data: [{ nodeId: 'old-device' }] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: {}
          })
        })
      }
    })
    const rejected = expect(request).rejects.toMatchObject({
      code: 'ERR_CANCELED'
    })

    await vi.waitFor(() => {
      expect(capturedConfig?.signal).toBeTruthy()
    })
    expect(capturedConfig.headers['X-Tenant-Id']).toBeUndefined()
    expect(capturedConfig.headers['X-Tenant-Code']).toBeUndefined()

    setSession(testSession('tenant-b'), {}, 'context')
    expect(capturedConfig.signal.aborted).toBe(true)
    releaseResponse()

    await rejected
  })
})
