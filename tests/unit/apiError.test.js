import { describe, expect, it } from 'vitest'
import { getApiErrorInfo, toUserFacingMessage } from '@/utils/apiError'

describe('API error utilities', () => {
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

  it('distinguishes cancellation from retryable timeout', () => {
    expect(getApiErrorInfo({ code: 'ERR_CANCELED' }).type).toBe('canceled')
    expect(getApiErrorInfo({ code: 'ETIMEDOUT' })).toMatchObject({
      type: 'timeout',
      retryable: true
    })
  })

  it('removes internal authentication terminology from visible text', () => {
    expect(toUserFacingMessage('Gateway Refresh Token 校验失败'))
      .toBe('服务入口登录凭据校验失败')
  })
})
