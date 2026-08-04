import http from './http'

const path = (value) => encodeURIComponent(String(value))

export const getMyTenants = () => http.get('/tenants/me')
export const getPlatformTenants = (params) => http.get('/admin/platform/tenants', { params })
export const createPlatformTenant = (data) => http.post('/admin/platform/tenants', data)
export const getPlatformTenant = (tenantId) => http.get(`/admin/platform/tenants/${path(tenantId)}`)
export const updatePlatformTenant = (tenantId, data) => http.put(`/admin/platform/tenants/${path(tenantId)}`, data)
export const updatePlatformTenantStatus = (tenantId, data) => http.put(`/admin/platform/tenants/${path(tenantId)}/status`, data)
export const getPlatformTenantMembers = (tenantId, params) => http.get(`/admin/platform/tenants/${path(tenantId)}/members`, { params })
export const getPlatformSaasPlans = () => http.get('/admin/platform/saas-plans')
