import http from './http'

function encodePath(value) {
    return encodeURIComponent(String(value))
}

// 支持 current、size、mac、nodeId、userId、status。
export function getSessions(params) {
    return http.get('/admin/sessions', { params })
}

// 普通用户只能查询由 Gateway 身份限定的本人 Session。
export function getMySessions(params) {
    return http.get('/sessions', { params })
}

export function revokeSession(sessionId) {
    return http.post(
        `/admin/sessions/${encodePath(sessionId)}/revoke`
    )
}

export function authorizePortal(data) {
    return http.post('/sessions/portal-authorize', data)
}

export function getPortalStatus(sessionId) {
    return http.get(`/sessions/${encodePath(sessionId)}/portal-status`)
}
