import http from './http'

export function getMyLocations(params) {
    return http.get('/locations', { params })
}

export function reportMyLocation(sessionId, data) {
    return http.post(
        `/locations/sessions/${encodeURIComponent(String(sessionId))}/report`,
        data
    )
}

export function getLocationConsent() {
    return http.get('/locations/consent')
}

export function grantLocationConsent() {
    return http.post('/locations/consent')
}

export function revokeLocationConsent() {
    return http.delete('/locations/consent')
}

export function clearLocationHistory() {
    return http.delete('/locations/history')
}
