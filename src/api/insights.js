import http from './http'

export function getSignalAnalytics(params) {
  return http.get('/admin/analytics/signals', { params })
}

export function getTrafficAnalytics(params) {
  return http.get('/admin/analytics/traffic', { params })
}

export function getAlertRuleAnalytics(params) {
  return http.get('/admin/analytics/alerts-rules', { params })
}

export function getGisTrajectory(params) {
  return http.get('/admin/gis/trajectory', { params })
}

export function getGisStayPoints(params) {
  return http.get('/admin/gis/stay-points', { params })
}

export function getGisHeatmap(params) {
  return http.get('/admin/gis/heatmap', { params })
}

export function getGisNodeCoverage(params) {
  return http.get('/admin/gis/node-coverage', { params })
}

export function createGeofence(data) {
  return http.post('/admin/geofences', data)
}

export function getGeofences(params) {
  return http.get('/admin/geofences', { params })
}

export function getGeofence(fenceId) {
  return http.get(`/admin/geofences/${fenceId}`)
}

export function updateGeofence(fenceId, data) {
  return http.put(`/admin/geofences/${fenceId}`, data)
}

export function toggleGeofence(fenceId, enabled) {
  return http.patch(`/admin/geofences/${fenceId}/enabled`, null, {
    params: { enabled }
  })
}

export function deleteGeofence(fenceId) {
  return http.delete(`/admin/geofences/${fenceId}`)
}

export function getGeofenceEvents(params) {
  return http.get('/admin/geofences/events', { params })
}
