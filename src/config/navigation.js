import { Activity, Ban, Bell, Building2, CreditCard, FileClock, Gauge, KeyRound, Layers3, MapPin, Radio, ReceiptText, RefreshCcw, Router, ScrollText, ShieldCheck, ShoppingBag, UserRound } from 'lucide-vue-next'
import {ROLE_ADMIN, ROLE_SUPER_ADMIN, canAccessRoles} from '@/utils/access'
import { isTenantWorkspaceContext, withTenantWorkspace } from '@/utils/tenant'

const ADMIN_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN]
const SUPER_ADMIN_ROLES = [ROLE_SUPER_ADMIN]

// 导航只登记当前已有业务，尚未完成的页面不创建假入口。
export const ACCOUNT_NAV_ITEMS = Object.freeze([
    { to: '/app/account/profile', label: '账户总览', icon: UserRound },
    { to: '/app/purchase', label: '购买上网时长', icon: ShoppingBag, tenantBound: true },
    { to: '/app/entitlements', label: '上网服务', icon: ReceiptText, tenantBound: true },
    { to: '/app/orders', label: '订单记录', icon: CreditCard, tenantBound: true },
    { to: '/app/refunds', label: '退款记录', icon: RefreshCcw, tenantBound: true },
    { to: '/app/account/security', label: '账户安全', icon: KeyRound },
    { to: '/app/account/connections', label: '我的连接', icon: Activity, tenantBound: true },
    { to: '/app/account/location', label: '我的定位', icon: MapPin, tenantBound: true }
])

export function getAccountNavigationItems(context) {
    return ACCOUNT_NAV_ITEMS.filter(
        (item) => !item.tenantBound || isTenantWorkspaceContext(context)
    )
}

export const NAVIGATION_GROUPS = [
    {
        key: 'overview',
        label: '总览',
        items: [
            { to: '/app/overview', label: '运行总览', icon: Gauge, roles: ADMIN_ROLES, tenantScoped: true }
        ]
    },
    {
        key: 'platform',
        label: '系统管理',
        items: [
            { to: '/app/platform/tenants', label: '组织管理', icon: Building2, roles: SUPER_ADMIN_ROLES },
            { to: '/app/platform/saas-plans', label: '服务套餐', icon: Layers3, roles: SUPER_ADMIN_ROLES }
        ]
    },
    {
        key: 'network',
        label: '网络',
        items: [
            { to: '/app/network/devices', label: '设备管理', icon: Router, roles: ADMIN_ROLES, tenantScoped: true },
            { to: '/app/network/clients', label: '连接信号', icon: Radio, roles: ADMIN_ROLES, tenantScoped: true },
            { to: '/app/network/sessions', label: '连接记录', icon: Activity, roles: ADMIN_ROLES, tenantScoped: true },
            { to: '/app/network/traffic', label: '流量记录', icon: ScrollText, roles: ADMIN_ROLES, tenantScoped: true }
        ]
    },
    {
        key: 'security',
        label: '安全',
        items: [
            { to: '/app/security/rules', label: '访问规则', icon: ShieldCheck, roles: ADMIN_ROLES, tenantScoped: true },
            { to: '/app/security/blacklist', label: '黑名单', icon: Ban, roles: ADMIN_ROLES, tenantScoped: true },
            { to: '/app/security/alerts', label: '告警', icon: Bell, roles: ADMIN_ROLES, tenantScoped: true },
            { to: '/app/security/audits', label: '操作记录', icon: FileClock, roles: ADMIN_ROLES, tenantScoped: true }
        ]
    },
    {
        key: 'operations',
        label: '业务管理',
        items: [
            { to: '/app/operations/refunds', label: '退款审核', icon: RefreshCcw, roles: ADMIN_ROLES, tenantScoped: true }
        ]
    },
    {
        key: 'insights',
        label: '数据分析',
        items: [
            { to: '/app/insights/gis', label: '地图分析', icon: MapPin, roles: ADMIN_ROLES, tenantScoped: true },
            { to: '/app/insights/analytics', label: '运行分析', icon: Activity, roles: ADMIN_ROLES, tenantScoped: true },
            { to: '/app/insights/geofences', label: '区域提醒', icon: ShieldCheck, roles: ADMIN_ROLES, tenantScoped: true }
        ]
    }
]

// 普通用户不会得到空的管理分组，管理员也只看到合法入口。
export function getNavigationGroups(role, context) {
    return NAVIGATION_GROUPS
        .filter((group) => group.key !== 'platform' || context?.contextType === 'PLATFORM')
        .map((group) => ({
            ...group,
            items: group.items
                .filter((item) => canAccessRoles(item.roles, role))
                .filter((item) => !item.tenantScoped || isTenantWorkspaceContext(context))
                .map((item) => ({
                    ...item,
                    to: item.tenantScoped ? withTenantWorkspace(item.to, context) : item.to
                }))
        }))
        .filter((group) => group.items.length > 0)
}
