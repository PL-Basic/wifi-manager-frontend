// 三种合法角色，必须保留数值 0 的超级管理员语义。
export const ROLE_SUPER_ADMIN = 0
export const ROLE_ADMIN = 1
export const ROLE_USER = 2

const KNOWN_ROLES = new Set([
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    ROLE_USER
])

function parseKnownRole(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null

    const normalizedValue = typeof value === 'string' ? value.trim() : value
    if (normalizedValue === '') return null

    const role = Number(normalizedValue)
    return KNOWN_ROLES.has(role) ? role : null
}

// 把 localStorage 或接口返回值转换为可信角色。
// 非法值按普通用户处理，避免误开放管理权限。
export function normalizeRole(value) {
    return parseKnownRole(value) ?? ROLE_USER
}

export function isAdminRole(value) {
    const role = normalizeRole(value)
    return role === ROLE_SUPER_ADMIN || role === ROLE_ADMIN
}

// 登录、旧路径跳转和越权回退统一使用同一个首页规则。
export function getHomePath(value, context = null) {
    if (context?.contextType === 'PLATFORM' && normalizeRole(value) === ROLE_SUPER_ADMIN) {
        return '/app/platform/tenants'
    }

    if (context?.tenantCode && isAdminRole(value)) {
        return `/app/t/${encodeURIComponent(String(context.tenantCode))}/overview`
    }

    return '/app/account/profile'
}

// 没有配置角色限制表示所有已登录用户都可访问。
export function canAccessRoles(allowedRoles, currentRole) {
    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
        return true
    }

    return allowedRoles.includes(normalizeRole(currentRole))
}

export function isSameUser(operatorId, targetUser) {
    if (operatorId === null || operatorId === undefined || !targetUser) return false
    return String(operatorId) === String(targetUser.userId)
}

// 管理员管理接口的目标权限：普通管理员只能操作普通用户；超级管理员不能操作超级管理员。
// 本人资料不属于管理接口操作，调用方应把本人引导到个人中心。
export function canManageUserTarget(operatorRole, operatorId, targetUser) {
    if (!targetUser || isSameUser(operatorId, targetUser)) return false

    const role = normalizeRole(operatorRole)
    // 目标角色来自接口，异常或缺失时必须失败关闭，不能误当成普通用户开放操作。
    const targetRole = parseKnownRole(targetUser.role)
    if (targetRole === null) return false

    if (role === ROLE_SUPER_ADMIN) return targetRole !== ROLE_SUPER_ADMIN
    if (role === ROLE_ADMIN) return targetRole === ROLE_USER
    return false
}

export function canOpenUserEditor(operatorRole, operatorId, targetUser) {
    return isSameUser(operatorId, targetUser)
        || canManageUserTarget(operatorRole, operatorId, targetUser)
}

export function canChangeManagedUserRole(operatorRole, operatorId, targetUser) {
    return normalizeRole(operatorRole) === ROLE_SUPER_ADMIN
        && canManageUserTarget(operatorRole, operatorId, targetUser)
}
