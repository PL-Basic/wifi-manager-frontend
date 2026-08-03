function status(label, tone, terminal = false) {
    return Object.freeze({ label, tone, terminal })
}

export const SERVICE_STATUSES = Object.freeze({
    UP: status('正常', 'success'),
    DEGRADED: status('部分降级', 'warning'),
    DOWN: status('不可用', 'danger'),
    UNKNOWN: status('未知', 'neutral')
})

export const DEVICE_STATUSES = Object.freeze({
    0: status('离线', 'neutral'),
    1: status('在线', 'success')
})

export const SESSION_STATUSES = Object.freeze({
    0: status('已结束', 'neutral', true),
    1: status('已授权', 'success'),
    2: status('等待固件确认', 'warning'),
    3: status('等待替换旧会话', 'info')
})

export const COMMAND_STATUSES = Object.freeze({
    0: status('等待发布', 'warning'),
    1: status('已发布，等待设备结果', 'info'),
    2: status('执行成功', 'success', true),
    3: status('设备执行失败', 'danger', true),
    4: status('MQTT 发布失败', 'danger', true),
    5: status('等待结果超时', 'warning', true)
})

export const WIFI_CONFIG_STATUSES = Object.freeze({
    0: status('正在下发', 'info'),
    1: status('候选配置已保存', 'success'),
    2: status('配置已生效', 'success', true),
    3: status('配置失败', 'danger', true),
    4: status('结果未知', 'warning'),
    5: status('已被新配置替代', 'neutral', true)
})

function resolveStatus(statuses, value, normalize = String) {
    const key = normalize(value)
    const matched = statuses[key]

    if (matched) {
        return {
            code: value,
            ...matched
        }
    }

    return {
        code: value,
        label: value === null || value === undefined
            ? '未知'
            : `未知（${value}）`,
        tone: 'neutral',
        terminal: false
    }
}

export function resolveServiceStatus(value) {
    return resolveStatus(
        SERVICE_STATUSES,
        value,
        (item) => String(item || 'UNKNOWN').trim().toUpperCase()
    )
}

export function resolveDeviceStatus(value) {
    return resolveStatus(DEVICE_STATUSES, value)
}

export function resolveSessionStatus(value) {
    return resolveStatus(SESSION_STATUSES, value)
}

export function resolveCommandStatus(value) {
    return resolveStatus(COMMAND_STATUSES, value)
}

export function resolveWifiConfigStatus(value) {
    return resolveStatus(WIFI_CONFIG_STATUSES, value)
}

export function isCommandTerminal(value) {
    return resolveCommandStatus(value).terminal
}

export function isWifiConfigTerminal(value) {
    return resolveWifiConfigStatus(value).terminal
}