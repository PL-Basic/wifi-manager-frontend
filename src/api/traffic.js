import http from './http'

// 支持 current、size、mac、sessionId、dstIp、startTime、endTime。
export function getTraffic(params) {
    return http.get('/admin/traffic', { params })
}

// 支持 deviceCode、nodeId、mac、sessionId、state 和时间范围。
export function getClientSignals(params) {
    return http.get('/admin/client-signals', { params })
}

export function getMyTraffic(params) {
    return http.get('/traffic', { params })
}

export function getMyClientSignals(params) {
    return http.get('/client-signals', { params })
}

