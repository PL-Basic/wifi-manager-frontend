import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '@/layouts/AppShell.vue'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import ForgotPasswordView from '@/views/ForgotPasswordView.vue'
import ChangePasswordView from '@/views/ChangePasswordView.vue'
import PortalAuthorizeView from '@/views/PortalAuthorizeView.vue'
import OverviewView from '@/views/OverviewView.vue'
import ProfileView from '@/views/ProfileView.vue'
import DevicesView from '@/views/network/DevicesView.vue'
import DeviceDetailView from '@/views/network/DeviceDetailView.vue'
import ClientsView from '@/views/network/ClientsView.vue'
import MyLocationView from '@/views/MyLocationView.vue'
import MyConnectionsView from '@/views/MyConnectionsView.vue'
import OAuthCompleteView from '@/views/OAuthCompleteView.vue'
import AccountSecurityView from '@/views/AccountSecurityView.vue'
import SessionsView from '@/views/network/SessionsView.vue'
import TrafficView from '@/views/network/TrafficView.vue'
import RulesView from '@/views/security/RulesView.vue'
import BlacklistView from '@/views/security/BlacklistView.vue'
import AlertsView from '@/views/security/AlertsView.vue'
import AuditsView from '@/views/security/AuditsView.vue'
import RefundReviewView from '@/views/operations/RefundReviewView.vue'
import EntitlementsView from '@/views/EntitlementsView.vue'
import PurchaseView from '@/views/PurchaseView.vue'
import OrdersView from '@/views/OrdersView.vue'
import OrderDetailView from '@/views/OrderDetailView.vue'
import RefundsView from '@/views/RefundsView.vue'
import RefundDetailView from '@/views/RefundDetailView.vue'
import RestrictedAccountView from '@/views/RestrictedAccountView.vue'
import {
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
  canAccessRoles,
  getHomePath,
  normalizeRole
} from '@/utils/access'
import {
  getStoredRole,
  getStoredTenantContext,
  getToken,
  isTokenExpired
} from '@/utils/session'
import { restoreAccessSession } from '@/utils/sessionRefresh'
import { getSafeInternalRedirect } from '@/utils/navigation'
import { hasPendingAccount } from '@/utils/accountState'
import {
  isLegacyTenantWorkspacePath,
  isTenantWorkspaceContext,
  migrateLegacyWorkspacePath
} from '@/utils/tenant'

const ADMIN_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN]
const SUPER_ADMIN_ROLES = [ROLE_SUPER_ADMIN]

const tenantWorkspaceChildren = [
  {
    path: '',
    redirect: (to) => `/app/t/${encodeURIComponent(String(to.params.tenantCode))}/overview`
  },
  {
    path: 'overview',
    name: 'tenant-overview',
    component: OverviewView,
    meta: { title: '运行总览', breadcrumbs: ['总览', '运行总览'], roles: ADMIN_ROLES }
  },
  {
    path: 'network',
    redirect: (to) => `/app/t/${encodeURIComponent(String(to.params.tenantCode))}/network/devices`
  },
  {
    path: 'network/devices',
    name: 'tenant-network-devices',
    component: DevicesView,
    meta: { title: '设备管理', breadcrumbs: ['网络', '设备管理'], roles: ADMIN_ROLES }
  },
  {
    path: 'network/devices/:nodeId',
    name: 'tenant-network-device-detail',
    component: DeviceDetailView,
    meta: { title: '设备详情', breadcrumbs: ['网络', '设备管理', '设备详情'], roles: ADMIN_ROLES }
  },
  {
    path: 'network/clients',
    name: 'tenant-network-clients',
    component: ClientsView,
    meta: { title: '连接信号', breadcrumbs: ['网络', '连接信号'], roles: ADMIN_ROLES }
  },
  {
    path: 'network/sessions',
    name: 'tenant-network-sessions',
    component: SessionsView,
    meta: { title: '连接记录', breadcrumbs: ['网络', '连接记录'], roles: ADMIN_ROLES }
  },
  {
    path: 'network/traffic',
    name: 'tenant-network-traffic',
    component: TrafficView,
    meta: { title: '流量记录', breadcrumbs: ['网络', '流量记录'], roles: ADMIN_ROLES }
  },
  {
    path: 'security',
    redirect: (to) => `/app/t/${encodeURIComponent(String(to.params.tenantCode))}/security/rules`
  },
  {
    path: 'security/rules',
    name: 'tenant-security-rules',
    component: RulesView,
    meta: { title: '访问规则', breadcrumbs: ['安全', '访问规则'], roles: ADMIN_ROLES }
  },
  {
    path: 'security/blacklist',
    name: 'tenant-security-blacklist',
    component: BlacklistView,
    meta: { title: '黑名单', breadcrumbs: ['安全', '黑名单'], roles: ADMIN_ROLES }
  },
  {
    path: 'security/alerts',
    name: 'tenant-security-alerts',
    component: AlertsView,
    meta: { title: '告警', breadcrumbs: ['安全', '告警'], roles: ADMIN_ROLES }
  },
  {
    path: 'security/audits',
    name: 'tenant-security-audits',
    component: AuditsView,
    meta: { title: '操作记录', breadcrumbs: ['安全', '操作记录'], roles: ADMIN_ROLES }
  },
  {
    path: 'operations',
    redirect: (to) => `/app/t/${encodeURIComponent(String(to.params.tenantCode))}/operations/refunds`
  },
  {
    path: 'operations/users',
    redirect: (to) => `/app/t/${encodeURIComponent(String(to.params.tenantCode))}/operations/refunds`
  },
  {
    path: 'operations/users/:userId',
    redirect: (to) => `/app/t/${encodeURIComponent(String(to.params.tenantCode))}/operations/refunds`
  },
  {
    path: 'operations/approvals',
    redirect: (to) => `/app/t/${encodeURIComponent(String(to.params.tenantCode))}/operations/refunds`
  },
  {
    path: 'operations/refunds',
    name: 'tenant-operations-refunds',
    component: RefundReviewView,
    meta: { title: '退款审核', breadcrumbs: ['业务管理', '退款审核'], roles: ADMIN_ROLES }
  },
  {
    path: 'insights',
    redirect: (to) => `/app/t/${encodeURIComponent(String(to.params.tenantCode))}/insights/gis`
  },
  {
    path: 'insights/gis',
    name: 'tenant-insights-gis',
    component: () => import('@/views/insights/GisView.vue'),
    meta: { title: '地图分析', breadcrumbs: ['数据分析', '地图分析'], roles: ADMIN_ROLES }
  },
  {
    path: 'insights/analytics',
    name: 'tenant-insights-analytics',
    component: () => import('@/views/insights/AnalyticsView.vue'),
    meta: { title: '运行分析', breadcrumbs: ['数据分析', '运行分析'], roles: ADMIN_ROLES }
  },
  {
    path: 'insights/geofences',
    name: 'tenant-insights-geofences',
    component: () => import('@/views/insights/GeofencesView.vue'),
    meta: { title: '区域提醒', breadcrumbs: ['数据分析', '区域提醒'], roles: ADMIN_ROLES }
  }
]

const routes = [
  {
    path: '/',
    redirect: () => (
      getToken()
        ? getHomePath(getStoredRole(), getStoredTenantContext())
        : hasPendingAccount() ? '/account-restricted' : '/login'
    )
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { publicOnly: true }
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: { publicOnly: true }
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: ForgotPasswordView,
    meta: { publicOnly: true }
  },
  {
    path: '/oauth-complete/:provider',
    name: 'oauth-complete',
    component: OAuthCompleteView
  },
  {
    path: '/account-restricted',
    name: 'account-restricted',
    component: RestrictedAccountView,
    meta: { pendingAccountOnly: true }
  },
  {
    path: '/portal',
    name: 'portal-authorize',
    component: PortalAuthorizeView,
    meta: { requiresAuth: true }
  },
  {
    path: '/app/t/:tenantCode',
    component: AppShell,
    meta: { requiresAuth: true, tenantWorkspace: true },
    children: tenantWorkspaceChildren
  },
  {
    path: '/app',
    component: AppShell,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'app-home',
        redirect: () => getHomePath(getStoredRole(), getStoredTenantContext())
      },
      {
        path: 'overview',
        name: 'app-overview',
        component: OverviewView,
        meta: {
          title: '运行总览',
          breadcrumbs: ['总览', '运行总览'],
          roles: ADMIN_ROLES
        }
      },
      {
        path: 'account/profile',
        name: 'app-profile',
        component: ProfileView,
        meta: {
          title: '我的资料',
          breadcrumbs: ['个人', '我的资料'],
          profileSection: 'profile',
          allowWithoutTenant: true
        }
      },
      {
        path: 'account/security',
        name: 'app-account-security',
        component: AccountSecurityView,
        meta: {
          title: '账户安全',
          breadcrumbs: ['个人', '账户安全'],
          allowWithoutTenant: true
        }
      },
      {
        path: 'account/connections',
        name: 'app-connections',
        component: MyConnectionsView,
        meta: {
          title: '我的连接',
          breadcrumbs: ['个人', '我的连接'],
          tenantBound: true
        }
      },
      {
        path: 'account/change-password',
        name: 'app-change-password',
        component: ChangePasswordView,
        meta: {
          title: '修改密码',
          breadcrumbs: ['个人', '账户安全', '修改密码'],
          allowWithoutTenant: true
        }
      },
      {
        path: 'account/location',
        name: 'app-location',
        component: MyLocationView,
        meta: {
          title: '我的定位',
          breadcrumbs: ['个人', '我的定位'],
          profileSection: 'locations',
          tenantBound: true
        }
      },
      {
        path: 'profile',
        redirect: '/app/account/profile'
      },
      {
        path: 'account-security',
        redirect: '/app/account/security'
      },
      {
        path: 'connections',
        redirect: '/app/account/connections'
      },
      {
        path: 'change-password',
        redirect: '/app/account/change-password'
      },
      {
        path: 'location',
        redirect: '/app/account/location'
      },
      {
        path: 'network',
        redirect: '/app/network/devices'
      },
      {
        path: 'network/devices',
        name: 'app-network-devices',
        component: DevicesView,
        meta: {
          title: '设备管理',
          breadcrumbs: ['网络', '设备管理'],
          roles: ADMIN_ROLES
        }
      },
      {
        path: 'network/devices/:nodeId',
        name: 'app-network-device-detail',
        component: DeviceDetailView,
        meta: {
          title: '设备详情',
          breadcrumbs: ['网络', '设备管理', '设备详情'],
          roles: ADMIN_ROLES
        }
      },
      {
        path: 'network/clients',
        name: 'app-network-clients',
        component: ClientsView,
        meta: {
          title: '连接信号',
          breadcrumbs: ['网络', '连接信号'],
          roles: ADMIN_ROLES
        }
      },
      {
        path: 'network/sessions',
        name: 'app-network-sessions',
        component: SessionsView,
        meta: {
          title: '连接记录',
          breadcrumbs: ['网络', '连接记录'],
          roles: ADMIN_ROLES
        }
      },
      {
        path: 'network/traffic',
        name: 'app-network-traffic',
        component: TrafficView,
        meta: {
          title: '流量记录',
          breadcrumbs: ['网络', '流量记录'],
          roles: ADMIN_ROLES
        }
      },
      {
        path: 'security',
        redirect: '/app/security/rules'
      },
      {
        path: 'security/rules',
        name: 'app-security-rules',
        component: RulesView,
        meta: { title: '访问规则', breadcrumbs: ['安全', '访问规则'], roles: ADMIN_ROLES }
      },
      {
        path: 'entitlements',
        name: 'app-entitlements',
        component: EntitlementsView,
        meta: { title: '上网服务', breadcrumbs: ['个人', '上网服务'], tenantBound: true }
      },
      {
        path: 'purchase',
        name: 'app-purchase',
        component: PurchaseView,
        meta: { title: '购买上网时长', breadcrumbs: ['个人', '购买上网时长'], tenantBound: true }
      },
      {
        path: 'orders',
        name: 'app-orders',
        component: OrdersView,
        meta: { title: '订单记录', breadcrumbs: ['个人', '订单记录'], tenantBound: true }
      },
      {
        path: 'orders/:orderNo',
        name: 'app-order-detail',
        component: OrderDetailView,
        meta: { title: '订单详情', breadcrumbs: ['个人', '订单记录', '订单详情'], tenantBound: true }
      },
      {
        path: 'refunds',
        name: 'app-refunds',
        component: RefundsView,
        meta: { title: '我的退款', breadcrumbs: ['个人', '我的退款'], tenantBound: true }
      },
      {
        path: 'refunds/:refundNo',
        name: 'app-refund-detail',
        component: RefundDetailView,
        meta: { title: '退款详情', breadcrumbs: ['个人', '我的退款', '退款详情'], tenantBound: true }
      },
      {
        path: 'security/blacklist',
        name: 'app-security-blacklist',
        component: BlacklistView,
        meta: { title: '黑名单', breadcrumbs: ['安全', '黑名单'], roles: ADMIN_ROLES }
      },
      {
        path: 'security/alerts',
        name: 'app-security-alerts',
        component: AlertsView,
        meta: { title: '告警', breadcrumbs: ['安全', '告警'], roles: ADMIN_ROLES }
      },
      {
        path: 'security/audits',
        name: 'app-security-audits',
        component: AuditsView,
        meta: { title: '操作记录', breadcrumbs: ['安全', '操作记录'], roles: ADMIN_ROLES }
      },
      {
        path: 'operations',
        redirect: '/app/operations/refunds'
      },
      {
        path: 'operations/users',
        redirect: '/app/operations/refunds'
      },
      {
        path: 'operations/users/:userId',
        redirect: '/app/operations/refunds'
      },
      {
        path: 'operations/approvals',
        redirect: '/app/operations/refunds'
      },
      {
        path: 'operations/refunds',
        name: 'app-operations-refunds',
        component: RefundReviewView,
        meta: { title: '退款审核', breadcrumbs: ['业务管理', '退款审核'], roles: ADMIN_ROLES }
      },
      {
        path: 'platform',
        redirect: '/app/platform/tenants'
      },
      {
        path: 'platform/tenants',
        name: 'app-platform-tenants',
        component: () => import('@/views/platform/TenantsView.vue'),
        meta: { title: '组织管理', breadcrumbs: ['系统管理', '组织管理'], roles: SUPER_ADMIN_ROLES }
      },
      {
        path: 'platform/tenants/:tenantId',
        name: 'app-platform-tenant-detail',
        component: () => import('@/views/platform/TenantDetailView.vue'),
        meta: { title: '组织详情', breadcrumbs: ['系统管理', '组织管理', '组织详情'], roles: SUPER_ADMIN_ROLES }
      },
      {
        path: 'platform/saas-plans',
        name: 'app-platform-saas-plans',
        component: () => import('@/views/platform/SaasPlansView.vue'),
        meta: { title: '服务套餐', breadcrumbs: ['系统管理', '服务套餐'], roles: SUPER_ADMIN_ROLES }
      },
      {
        path: 'insights',
        redirect: '/app/insights/gis'
      },
      {
        path: 'insights/gis',
        name: 'app-insights-gis',
        component: () => import('@/views/insights/GisView.vue'),
        meta: {
          title: '地图分析',
          breadcrumbs: ['数据分析', '地图分析'],
          roles: ADMIN_ROLES
        }
      },
      {
        path: 'insights/analytics',
        name: 'app-insights-analytics',
        component: () => import('@/views/insights/AnalyticsView.vue'),
        meta: {
          title: '运行分析',
          breadcrumbs: ['数据分析', '运行分析'],
          roles: ADMIN_ROLES
        }
      },
      {
        path: 'insights/geofences',
        name: 'app-insights-geofences',
        component: () => import('@/views/insights/GeofencesView.vue'),
        meta: {
          title: '区域提醒',
          breadcrumbs: ['数据分析', '区域提醒'],
          roles: ADMIN_ROLES
        }
      }
    ]
  },

  // 保留旧地址，避免收藏或旧标签页立即失效。
  {
    path: '/dashboard',
    redirect: () => getHomePath(getStoredRole(), getStoredTenantContext())
  },
  {
    path: '/profile',
    redirect: '/app/account/profile'
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: () => (
      getToken()
        ? getHomePath(getStoredRole(), getStoredTenantContext())
        : hasPendingAccount() ? '/account-restricted' : '/login'
    )
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

let restorePromise = null

async function restoreBrowserSession() {
  if (getToken() && !isTokenExpired(getToken())) return 'active'
  if (!restorePromise) {
    restorePromise = restoreAccessSession().finally(() => {
      restorePromise = null
    })
  }
  return restorePromise
}

router.beforeEach(async (to) => {
  let restoreState = 'active'
  if (to.meta.requiresAuth || to.meta.publicOnly || getToken()) {
    restoreState = await restoreBrowserSession()
  }

  const token = getToken()
  const role = normalizeRole(getStoredRole())
  const context = getStoredTenantContext()
  const usableToken = Boolean(token && !isTokenExpired(token))

  if (to.meta.pendingAccountOnly) {
    if (usableToken) return getHomePath(role, context)
    return hasPendingAccount() ? true : { name: 'login' }
  }

  if (
    to.meta.requiresAuth
    && (
      !token
      || (!usableToken && !['unavailable', 'step-up'].includes(restoreState))
    )
  ) {
    return {
      name: 'login',
      query: { redirect: to.fullPath }
    }
  }

  if (to.meta.publicOnly && usableToken) {
    return getSafeInternalRedirect(to.query.redirect, getHomePath(role, context))
  }

  if (usableToken && isLegacyTenantWorkspacePath(to.path)) {
    const migrated = migrateLegacyWorkspacePath(to.fullPath, context)
    return migrated || getHomePath(role, context)
  }

  if (
    usableToken
    && to.path.startsWith('/app/platform')
    && context?.contextType !== 'PLATFORM'
  ) {
    return getHomePath(role, context)
  }

  if (to.meta.tenantWorkspace) {
    if (!isTenantWorkspaceContext(context)) {
      return getHomePath(role, context)
    }
    if (String(to.params.tenantCode || '') !== String(context.tenantCode || '')) {
      return getHomePath(role, context)
    }
  }

  if (usableToken && to.meta.tenantBound && !isTenantWorkspaceContext(context)) {
    return getHomePath(role, context)
  }

  if (usableToken && !canAccessRoles(to.meta.roles, role)) {
    return getHomePath(role, context)
  }

  return true
})

export default router
