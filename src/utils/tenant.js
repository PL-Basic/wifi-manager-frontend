import { ROLE_ADMIN, ROLE_SUPER_ADMIN, normalizeRole } from '@/utils/access'

export const CONTEXT_TENANT = 'TENANT'
export const CONTEXT_PLATFORM = 'PLATFORM'
export const CONTEXT_PLATFORM_TENANT = 'PLATFORM_TENANT'

export function isTenantWorkspaceContext(context) {
  return [CONTEXT_TENANT, CONTEXT_PLATFORM_TENANT].includes(context?.contextType)
    && Boolean(context?.tenantCode)
}

export function isPlatformContext(context) {
  return context?.contextType === CONTEXT_PLATFORM
}

export function isManagedTenantContext(context) {
  return context?.contextType === CONTEXT_PLATFORM_TENANT
}

export function tenantWorkspaceRoot(context) {
  if (!isTenantWorkspaceContext(context)) return ''
  return `/app/t/${encodeURIComponent(context.tenantCode)}`
}

export function resolveSessionHomePath(role, context) {
  const normalizedRole = normalizeRole(role)

  if (isPlatformContext(context) && normalizedRole === ROLE_SUPER_ADMIN) {
    return '/app/platform/tenants'
  }

  if (
    isTenantWorkspaceContext(context)
    && [ROLE_SUPER_ADMIN, ROLE_ADMIN].includes(normalizedRole)
  ) {
    return `${tenantWorkspaceRoot(context)}/overview`
  }

  return '/app/account/profile'
}

export function withTenantWorkspace(path, context) {
  const root = tenantWorkspaceRoot(context)
  if (!root) return path

  const normalized = String(path || '').replace(/^\/app\/?/, '')
  return `${root}/${normalized}`.replace(/\/+$/, '')
}

export function isLegacyTenantWorkspacePath(path) {
  return /^\/app\/(overview|network|security|operations|insights)(\/|$)/.test(
    String(path || '')
  )
}

export function migrateLegacyWorkspacePath(fullPath, context) {
  if (!isLegacyTenantWorkspacePath(fullPath) || !isTenantWorkspaceContext(context)) {
    return ''
  }

  const suffix = String(fullPath).slice('/app'.length)
  return `${tenantWorkspaceRoot(context)}${suffix}`
}
