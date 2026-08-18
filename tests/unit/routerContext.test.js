import { describe, expect, it } from 'vitest'
import router from '@/router'
import { setSession } from '@/utils/session'
import { createUnsignedTestToken } from '../fixtures/session'

function setWorkspaceSession({ role, contextType, tenantCode = '' }) {
  setSession({
    token: createUnsignedTestToken({
      sub: '61',
      role,
      contextType,
      tenantCode,
      exp: 4102444800
    }),
    role
  })
}

describe('workspace route guards', () => {
  it('migrates a legacy tenant URL to the active tenant workspace', async () => {
    setWorkspaceSession({
      role: 1,
      contextType: 'TENANT',
      tenantCode: 'tenant-a'
    })

    await router.push('/app/network/devices?status=online')

    expect(router.currentRoute.value.fullPath)
      .toBe('/app/t/tenant-a/network/devices?status=online')
  })

  it('redirects tenant-bound pages away from platform context', async () => {
    setWorkspaceSession({ role: 0, contextType: 'PLATFORM' })

    await router.push('/app/orders')

    expect(router.currentRoute.value.fullPath).toBe('/app/platform/tenants')
  })

  it('rejects the platform workspace for an ordinary administrator', async () => {
    setWorkspaceSession({ role: 1, contextType: 'PLATFORM' })

    await router.push('/app/platform/tenants?attempt=ordinary-admin')

    expect(router.currentRoute.value.fullPath).toBe('/app/account/profile')
  })
})
