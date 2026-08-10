import { describe, expect, it } from 'vitest'
import {
  isLegacyTenantWorkspacePath,
  migrateLegacyWorkspacePath,
  resolveSessionHomePath,
  tenantWorkspaceRoot,
  withTenantWorkspace
} from '@/utils/tenant'

describe('tenant workspace utilities', () => {
  const tenantContext = {
    contextType: 'TENANT',
    tenantCode: 'tenant/a'
  }

  it('builds encoded tenant workspace paths without changing IDs', () => {
    expect(tenantWorkspaceRoot(tenantContext)).toBe('/app/t/tenant%2Fa')
    expect(withTenantWorkspace('/app/network/devices', tenantContext))
      .toBe('/app/t/tenant%2Fa/network/devices')
  })

  it('resolves role and context specific home paths', () => {
    expect(resolveSessionHomePath(0, { contextType: 'PLATFORM' }))
      .toBe('/app/platform/tenants')
    expect(resolveSessionHomePath(1, tenantContext))
      .toBe('/app/t/tenant%2Fa/overview')
    expect(resolveSessionHomePath(2, tenantContext))
      .toBe('/app/account/profile')
  })

  it('migrates only known legacy workspace paths', () => {
    expect(isLegacyTenantWorkspacePath('/app/security/alerts')).toBe(true)
    expect(migrateLegacyWorkspacePath('/app/security/alerts?status=open', tenantContext))
      .toBe('/app/t/tenant%2Fa/security/alerts?status=open')
    expect(migrateLegacyWorkspacePath('/app/account/profile', tenantContext)).toBe('')
  })
})
