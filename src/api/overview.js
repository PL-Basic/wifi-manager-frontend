import http from './http'

// 查询各服务健康状态和用户、设备统计。
export function getOverview() {
    return http.get('/admin/overview')
}

// 查询首页统计、最近用户和最近设备。
export function getDashboard() {
    return http.get('/admin/dashboard')
}