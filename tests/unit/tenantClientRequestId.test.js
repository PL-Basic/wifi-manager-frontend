import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_REQUEST_ID_PATTERN,
  createClientRequestIdManager,
  generateClientRequestId,
  normalizeTenantCreateInput
} from '../../src/utils/clientRequestId'

describe('tenant create clientRequestId', () => {
  it('generates a browser-owned key within the frozen contract', () => {
    const requestId = generateClientRequestId()

    expect(requestId).toMatch(CLIENT_REQUEST_ID_PATTERN)
    expect(requestId.length).toBeLessThanOrEqual(64)
  })

  it('reuses one valid key for normalized retries', async () => {
    const generate = vi.fn()
      .mockReturnValueOnce('tenant-create.001')
    const manager = createClientRequestIdManager(normalizeTenantCreateInput, generate)
    const input = {
      tenantCode: 'team-alpha',
      name: 'Alpha Team',
      timezone: 'Asia/Shanghai'
    }
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ tenantId: '101' })

    await expect(manager.run(input, submit)).rejects.toThrow('network timeout')
    await manager.run({
      tenantCode: ' team-alpha ',
      name: ' Alpha Team ',
      timezone: ' Asia/Shanghai '
    }, submit)

    const [first, retry] = submit.mock.calls.map(([request]) => request)
    expect(first.clientRequestId).toBe('tenant-create.001')
    expect(retry.clientRequestId).toBe(first.clientRequestId)
    expect(retry).toMatchObject(input)
    expect(first.clientRequestId).toMatch(CLIENT_REQUEST_ID_PATTERN)
    expect(first.clientRequestId.length).toBeLessThanOrEqual(64)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('generates a new key when normalized business input changes', async () => {
    const generate = vi.fn()
      .mockReturnValueOnce('tenant-create.001')
      .mockReturnValueOnce('tenant-create.002')
    const manager = createClientRequestIdManager(normalizeTenantCreateInput, generate)
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ tenantId: '101' })

    await expect(manager.run({
      tenantCode: 'team-alpha',
      name: 'Alpha Team',
      timezone: 'Asia/Shanghai'
    }, submit)).rejects.toThrow('network timeout')
    await manager.run({
      tenantCode: 'team-alpha',
      name: 'Alpha Operations',
      timezone: 'Asia/Shanghai'
    }, submit)

    expect(submit.mock.calls[0][0].clientRequestId).toBe('tenant-create.001')
    expect(submit.mock.calls[1][0].clientRequestId).toBe('tenant-create.002')
  })

  it('clears the key after success so the next create gets a new key', async () => {
    const generate = vi.fn()
      .mockReturnValueOnce('tenant-create.001')
      .mockReturnValueOnce('tenant-create.002')
    const manager = createClientRequestIdManager(normalizeTenantCreateInput, generate)
    const submit = vi.fn().mockResolvedValue({ tenantId: '101' })
    const input = {
      tenantCode: 'team-alpha',
      name: 'Alpha Team',
      timezone: 'Asia/Shanghai'
    }

    await manager.run(input, submit)
    await manager.run(input, submit)

    expect(submit.mock.calls[0][0].clientRequestId).toBe('tenant-create.001')
    expect(submit.mock.calls[1][0].clientRequestId).toBe('tenant-create.002')
  })
})
