import { describe, expect, it } from 'vitest'
import { getApiErrorInfo, toUserFacingMessage } from '@/utils/apiError'
import contract from '../fixtures/contracts/demo-1.4/http-envelope-v1.json'

describe('API error utilities', () => {
  it('consumes the frozen http-envelope-v1 fixture', () => {
    expect(contract.version).toBe('http-envelope-v1')
    expect(contract.requestId.header).toBe('X-Request-Id')
    expect(contract.baseErrorKeys).toHaveLength(15)
  })

  it('prefers a registered errorKey over conflicting status semantics', () => {
    const info = getApiErrorInfo({
      response: {
        status: 503,
        data: {
          ...contract.extendedError,
          errorKey: 'RESOURCE_VERSION_CONFLICT'
        }
      }
    })

    expect(info).toMatchObject({
      status: 503,
      errorKey: 'RESOURCE_VERSION_CONFLICT',
      type: 'conflict',
      retryable: true
    })
  })

  it('keeps legacy HTTP and successful-envelope body.code fallbacks', () => {
    expect(getApiErrorInfo({
      response: { status: 404, data: { message: '内容不存在' } }
    })).toMatchObject({
      status: 404,
      errorKey: '',
      type: 'not-found',
      message: '内容不存在'
    })

    expect(getApiErrorInfo({
      response: { status: 200, data: contract.legacyError }
    })).toMatchObject({
      status: 409,
      errorKey: '',
      type: 'conflict'
    })
  })

  it('prefers a valid body requestId and falls back to the validated header', () => {
    const bodyRequestId = contract.requestId.sample
    expect(getApiErrorInfo({
      response: {
        status: 409,
        data: { ...contract.extendedError, requestId: bodyRequestId },
        headers: { 'X-Request-Id': 'header-request-id-0001' }
      }
    }).requestId).toBe(bodyRequestId)

    expect(getApiErrorInfo({
      response: {
        status: 409,
        data: { ...contract.legacyError, requestId: 'forged value' },
        headers: { 'x-request-id': 'header-request-id-0001' }
      }
    }).requestId).toBe('header-request-id-0001')
  })

  it('rejects malformed requestId values from both sources', () => {
    const info = getApiErrorInfo({
      response: {
        status: 500,
        data: { errorKey: 'INTERNAL_ERROR', requestId: 'bad\r\nheader' },
        headers: { 'x-request-id': 'short' }
      }
    })

    expect(info.requestId).toBe('')
  })

  it('preserves retry metadata for rate limits', () => {
    const info = getApiErrorInfo({
      response: {
        status: 429,
        data: { message: '请求过于频繁' },
        headers: { 'retry-after': '5' }
      }
    })

    expect(info).toMatchObject({
      status: 429,
      type: 'rate-limit',
      retryable: true,
      retryAfter: '5',
      message: '请求过于频繁，请在 5 秒后重试'
    })
  })

  it.each([
    '-1',
    '1.5',
    'Wed, 21 Oct 2015 07:28:00 GMT',
    '5\r\nX-Injected: true',
    '9007199254740992'
  ])('rejects an invalid Retry-After value: %s', (retryAfter) => {
    const info = getApiErrorInfo({
      response: {
        status: 429,
        data: { errorKey: 'RATE_LIMITED' },
        headers: { 'retry-after': retryAfter }
      }
    })

    expect(info.retryAfter).toBe('')
    expect(info.message).not.toContain(retryAfter)
  })

  it('distinguishes cancellation from retryable timeout', () => {
    expect(getApiErrorInfo({ code: 'ERR_CANCELED' })).toMatchObject({
      type: 'canceled',
      retryable: false
    })
    expect(getApiErrorInfo({ code: 'ETIMEDOUT' })).toMatchObject({
      type: 'timeout',
      retryable: true
    })
  })

  it('classifies Axios network failures without exposing their raw message', () => {
    const info = getApiErrorInfo({
      isAxiosError: true,
      message: 'connect ECONNREFUSED http://internal-host:8080?token=CANARY'
    })

    expect(info).toMatchObject({
      type: 'offline',
      retryable: true
    })
    expect(JSON.stringify(info)).not.toContain('CANARY')
    expect(JSON.stringify(info)).not.toContain('internal-host')
  })

  it('uses message only for display and never for machine classification', () => {
    const first = getApiErrorInfo({
      response: {
        status: 400,
        data: { errorKey: 'PERMISSION_DENIED', message: '文案甲' }
      }
    })
    const second = getApiErrorInfo({
      response: {
        status: 400,
        data: { errorKey: 'PERMISSION_DENIED', message: '文案乙' }
      }
    })

    expect(first.type).toBe('permission')
    expect(second.type).toBe('permission')
    expect(first.message).not.toBe(second.message)
  })

  it('does not expose secrets, cookies, response body details or internal errors', () => {
    const canary = 'P14_FE_CANARY_SECRET'
    const info = getApiErrorInfo({
      isAxiosError: true,
      message: `request failed with ${canary}`,
      response: {
        status: 500,
        data: {
          errorKey: 'INTERNAL_ERROR',
          message: `apiKey=${canary}`,
          token: canary,
          cookie: `session=${canary}`,
          detail: `com.example.InternalException: ${canary}`
        }
      }
    }, '操作失败')

    const serialized = JSON.stringify(info)
    expect(info.message).toBe('操作失败：服务器处理失败，请稍后重试')
    expect(serialized).not.toContain(canary)
    expect(serialized).not.toContain('InternalException')
  })

  it('removes internal authentication terminology from visible text', () => {
    expect(toUserFacingMessage('Gateway Refresh Token 校验失败'))
      .toBe('服务入口登录凭据校验失败')
  })
})
