import http from './http'

const encodePath = (value) => encodeURIComponent(String(value))

export const getRules = (params) => http.get('/admin/rules', { params })
export const getRule = (id) => http.get(`/admin/rules/${encodePath(id)}`)
export const createRule = (data) => http.post('/admin/rules', data)
export const updateRule = (id, data) => http.put(`/admin/rules/${encodePath(id)}`, data)
export const deleteRule = (id) => http.delete(`/admin/rules/${encodePath(id)}`)
export const toggleRule = (id, enabled) => http.patch(
  `/admin/rules/${encodePath(id)}/enabled`,
  null,
  { params: { enabled } }
)

export const getBlacklist = (params) => http.get('/admin/devices/blacklist', { params })
export const addBlacklist = (data) => http.post('/admin/devices/blacklist', data)
export const removeBlacklist = (mac) => http.delete(
  `/admin/devices/blacklist/${encodePath(mac)}`
)

export const getAlerts = (params) => http.get('/admin/alerts', { params })
export const getAlert = (id) => http.get(`/admin/alerts/${encodePath(id)}`)

// 处理人只能由 Gateway 根据当前 JWT 注入，前端不能传 handleUserId。
export const handleAlert = (id) => http.patch(`/admin/alerts/${encodePath(id)}/handle`)

export const getAudits = (params) => http.get('/admin/audits', { params })
export const getAudit = (id) => http.get(`/admin/audits/${encodePath(id)}`)
