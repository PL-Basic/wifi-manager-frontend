import { Activity, Ban, Bell, ClipboardCheck, CreditCard, FileClock, Gauge, KeyRound, MapPin, Radio, ReceiptText, RefreshCcw, Router, ScrollText, ShieldCheck, ShoppingBag, UserRound, Users } from 'lucide-vue-next'
import {ROLE_ADMIN, ROLE_SUPER_ADMIN, canAccessRoles} from '@/utils/access'

const ADMIN_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN]
const SUPER_ADMIN_ROLES = [ROLE_SUPER_ADMIN]

// 导航只登记当前已有业务，尚未完成的页面不创建假入口。
export const ACCOUNT_NAV_ITEMS = Object.freeze([
    { to: '/app/profile', label: '账户总览', icon: UserRound },
    { to: '/app/purchase', label: '购买权益', icon: ShoppingBag },
    { to: '/app/entitlements', label: '我的权益', icon: ReceiptText },
    { to: '/app/orders', label: '订单记录', icon: CreditCard },
    { to: '/app/refunds', label: '退款记录', icon: RefreshCcw },
    { to: '/app/account-security', label: '账户安全', icon: KeyRound },
    { to: '/app/connections', label: '我的连接', icon: Activity },
    { to: '/app/location', label: '我的定位', icon: MapPin }
])

export const NAVIGATION_GROUPS = [
    {
        key: 'overview',
        label: '总览',
        items: [
            { to: '/app/overview', label: '运行总览', icon: Gauge, roles: ADMIN_ROLES }
        ]
    },
    {
        key: 'network',
        label: '网络',
        items: [
            { to: '/app/network/devices', label: '设备节点', icon: Router, roles: ADMIN_ROLES },
            { to: '/app/network/clients', label: '客户端信号', icon: Radio, roles: ADMIN_ROLES },
            { to: '/app/network/sessions', label: '会话', icon: Activity, roles: ADMIN_ROLES },
            { to: '/app/network/traffic', label: '流量', icon: ScrollText, roles: ADMIN_ROLES }
        ]
    },
    {
        key: 'security',
        label: '安全',
        items: [
            { to: '/app/security/rules', label: '访问规则', icon: ShieldCheck, roles: ADMIN_ROLES },
            { to: '/app/security/blacklist', label: '黑名单', icon: Ban, roles: ADMIN_ROLES },
            { to: '/app/security/alerts', label: '告警', icon: Bell, roles: ADMIN_ROLES },
            { to: '/app/security/audits', label: '审计', icon: FileClock, roles: ADMIN_ROLES }
        ]
    },
    {
        key: 'operations',
        label: '运营',
        items: [
            { to: '/app/operations/users', label: '用户管理', icon: Users, roles: ADMIN_ROLES },
            { to: '/app/operations/approvals', label: '高风险审批', icon: ClipboardCheck, roles: SUPER_ADMIN_ROLES },
            { to: '/app/operations/refunds', label: '退款审核', icon: RefreshCcw, roles: ADMIN_ROLES }
        ]
    },
    {
        key: 'insights',
        label: '洞察',
        items: [
            { to: '/app/insights/gis', label: 'GIS 空间分析', icon: MapPin, roles: ADMIN_ROLES },
            { to: '/app/insights/analytics', label: '运行分析', icon: Activity, roles: ADMIN_ROLES },
            { to: '/app/insights/geofences', label: '地理围栏', icon: ShieldCheck, roles: ADMIN_ROLES }
        ]
    }
]

// 普通用户不会得到空的管理分组，管理员也只看到合法入口。
export function getNavigationGroups(role) {
    return NAVIGATION_GROUPS
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => canAccessRoles(item.roles, role))
        }))
        .filter((group) => group.items.length > 0)
}
