import http from './http'

export function getOverview() {
  return http.get('/admin/overview')
}

export function getDashboard() {
  return http.get('/admin/dashboard')
}

export function getLocations(params) {
  return http.get('/admin/locations', { params })
}

export function getUsers(params) {
  return http.get('/admin/users', { params })
}

export function deleteUser(userId) {
  return http.delete(`/admin/users/${userId}`)
}

export function updateUserStatus(userId, data) {
  return http.put(`/admin/users/${userId}/status`, data)
}

export function updateUser(userId, data) {
  return http.put(`/admin/users/${userId}`, data)
}

export function requestPurgeUser(userId, data) {
  return http.post(`/admin/users/${userId}/purge-requests`, data)
}

export function purgeUser(userId) {
  return http.delete(`/admin/users/${userId}/purge`)
}

export function getOperationRequests(params) {
  return http.get('/admin/users/operation-requests', { params })
}

export function reviewOperationRequest(id, data) {
  return http.put(`/admin/users/operation-requests/${id}/review`, data)
}

export function getDevices(params) {
  return http.get('/admin/devices', { params })
}

export function allowDevice(deviceCode) {
  return http.post(`/admin/devices/${encodeURIComponent(deviceCode)}/allow`)
}

export function kickDevice(deviceCode, data) {
  return http.post(`/admin/devices/${encodeURIComponent(deviceCode)}/kick`, data)
}

export function getBlacklist(params) {
  return http.get('/admin/devices/blacklist', { params })
}

export function addBlacklist(data) {
  return http.post('/admin/devices/blacklist', data)
}

export function removeBlacklist(mac) {
  return http.delete(`/admin/devices/blacklist/${encodeURIComponent(mac)}`)
}

export function getSessions(params) {
  return http.get('/admin/sessions', { params })
}

export function getTraffic(params) {
  return http.get('/admin/traffic', { params })
}

export function getRules(params) {
  return http.get('/admin/rules', { params })
}

export function createRule(data) {
  return http.post('/admin/rules', data)
}

export function updateRule(id, data) {
  return http.put(`/admin/rules/${id}`, data)
}

export function deleteRule(id) {
  return http.delete(`/admin/rules/${id}`)
}

export function toggleRule(id, enabled) {
  return http.patch(`/admin/rules/${id}/enabled`, null, { params: { enabled } })
}

export function getAlerts(params) {
  return http.get('/admin/alerts', { params })
}

export function handleAlert(id, handleUserId) {
  return http.patch(`/admin/alerts/${id}/handle`, null, { params: { handleUserId } })
}

export function getAudits(params) {
  return http.get('/admin/audits', { params })
}

export function getMyLocations(params) {
  return http.get('/locations', { params })
}

export function getMyProfile(userId) {
  return http.get(`/users/${userId}`)
}

export function updateMyProfile(userId, data) {
  return http.put(`/users/${userId}`, data)
}
