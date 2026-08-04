import http from './http'

function encodePath(value) {
    return encodeURIComponent(String(value))
}

export function getDevices(params) {
    return http.get('/admin/devices', { params })
}

export function getDeviceStats() {
    return http.get('/admin/devices/stats')
}

export function getDevice(nodeId) {
    return http.get(`/admin/devices/${encodePath(nodeId)}`)
}

export function createDevice(data) {
    return http.post('/admin/devices', data)
}

export function updateDevice(nodeId, data) {
    return http.put(`/admin/devices/${encodePath(nodeId)}`, data)
}

export function deleteDevice(nodeId) {
    return http.delete(`/admin/devices/${encodePath(nodeId)}`)
}

export function restoreDevice(nodeId) {
    return http.post(`/admin/devices/${encodePath(nodeId)}/restore`)
}

export function allowDevice(deviceCode) {
    return http.post(`/admin/devices/${encodePath(deviceCode)}/allow`)
}

export function kickDevice(deviceCode, data) {
    return http.post(`/admin/devices/${encodePath(deviceCode)}/kick`, data)
}

// DTO：{ mac }
export function disconnectMac(deviceCode, data) {
    return http.post(
        `/admin/devices/${encodePath(deviceCode)}/disconnect-mac`,
        data
    )
}

// DTO：{ dstIp, sni }
export function blockTraffic(deviceCode, data) {
    return http.post(
        `/admin/devices/${encodePath(deviceCode)}/block-traffic`,
        data
    )
}

// DTO：{ ssid, password }
export function stageWifiCandidate(deviceCode, data) {
    return http.post(
        `/admin/devices/${encodePath(deviceCode)}/wifi-config/candidate`,
        data
    )
}

export function getWifiConfigTask(deviceCode, requestId) {
    return http.get(
        `/admin/devices/${encodePath(deviceCode)}/wifi-config/${encodePath(requestId)}`
    )
}

export function getLatestWifiConfigTask(deviceCode) {
    return http.get(
        `/admin/devices/${encodePath(deviceCode)}/wifi-config/latest`
    )
}

export function getDeviceCommands(params) {
    return http.get('/admin/device-commands', { params })
}

export function getClientSignals(params) {
    return http.get('/admin/client-signals', { params })
}
