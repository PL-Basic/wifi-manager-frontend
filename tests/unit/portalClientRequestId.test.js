import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_REQUEST_ID_PATTERN,
  createClientRequestIdManager,
  normalizePortalAuthorizeInput
} from '../../src/utils/clientRequestId'

describe('portal authorize clientRequestId', () => {
  it('reuses one valid key for normalized retries', async () => {
    const generate = vi.fn()
      .mockReturnValueOnce('portal-authorize:001')
    const manager = createClientRequestIdManager(normalizePortalAuthorizeInput, generate)
    const input = {
      deviceCode: 'gateway-001',
      mac: 'AA:BB:CC:DD:EE:FF',
      ip: '192.0.2.10',
      deviceInfo: 'Browser',
      forceReplaceOldest: false
    }
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ sessionId: '201' })

    await expect(manager.run(input, submit)).rejects.toThrow('network timeout')
    await manager.run({
      deviceCode: ' gateway-001 ',
      mac: 'aa:bb:cc:dd:ee:ff',
      ip: ' 192.0.2.10 ',
      deviceInfo: ' Browser ',
      forceReplaceOldest: false
    }, submit)

    const [first, retry] = submit.mock.calls.map(([request]) => request)
    expect(first.clientRequestId).toBe('portal-authorize:001')
    expect(retry.clientRequestId).toBe(first.clientRequestId)
    expect(retry).toMatchObject(input)
    expect(first.clientRequestId).toMatch(CLIENT_REQUEST_ID_PATTERN)
    expect(first.clientRequestId.length).toBeLessThanOrEqual(64)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('generates a new key when normalized business input changes', async () => {
    const generate = vi.fn()
      .mockReturnValueOnce('portal-authorize:001')
      .mockReturnValueOnce('portal-authorize:002')
    const manager = createClientRequestIdManager(normalizePortalAuthorizeInput, generate)
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ sessionId: '201' })
    const input = {
      deviceCode: 'gateway-001',
      mac: 'AA:BB:CC:DD:EE:FF',
      ip: '192.0.2.10',
      deviceInfo: 'Browser',
      forceReplaceOldest: false
    }

    await expect(manager.run(input, submit)).rejects.toThrow('network timeout')
    await manager.run({ ...input, forceReplaceOldest: true }, submit)

    expect(submit.mock.calls[0][0].clientRequestId).toBe('portal-authorize:001')
    expect(submit.mock.calls[1][0].clientRequestId).toBe('portal-authorize:002')
  })

  it('clears the key after success so the next authorization gets a new key', async () => {
    const generate = vi.fn()
      .mockReturnValueOnce('portal-authorize:001')
      .mockReturnValueOnce('portal-authorize:002')
    const manager = createClientRequestIdManager(normalizePortalAuthorizeInput, generate)
    const submit = vi.fn().mockResolvedValue({ sessionId: '201' })
    const input = {
      deviceCode: 'gateway-001',
      mac: 'AA:BB:CC:DD:EE:FF',
      ip: '192.0.2.10',
      deviceInfo: 'Browser',
      forceReplaceOldest: false
    }

    await manager.run(input, submit)
    await manager.run(input, submit)

    expect(submit.mock.calls[0][0].clientRequestId).toBe('portal-authorize:001')
    expect(submit.mock.calls[1][0].clientRequestId).toBe('portal-authorize:002')
  })
})
