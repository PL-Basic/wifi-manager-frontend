<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import AppHeader from '@/components/app/AppHeader.vue'
import AppSidebar from '@/components/app/AppSidebar.vue'
import GlobalToast from '@/components/app/GlobalToast.vue'
import ActionConfirmDialog from '@/components/app/ActionConfirmDialog.vue'
import AccountSwitchDialog from '@/components/app/AccountSwitchDialog.vue'
import RefreshStepUpDialog from '@/components/app/RefreshStepUpDialog.vue'
import TenantContextGate from '@/components/app/TenantContextGate.vue'
import { getMyProfile } from '@/api/account'
import {
  logout as logoutAuthSession,
  refreshAfterStepUp,
  switchAccount as replaceAccountSession
} from '@/api/auth'
import {
  enterPlatformTenantContext,
  returnPlatformContext,
  switchTenantContext
} from '@/api/tenants'
import { useAlertSocket } from '@/composables/useAlertSocket'
import { useApiConnectivity } from '@/composables/useApiConnectivity'
import { cancelActionDialog } from '@/composables/useActionDialog'
import { getApiErrorMessage } from '@/utils/apiError'
import { forgetAccount, getAccountHistory, rememberAccount } from '@/utils/accountHistory'
import { revokeActivePortalSession } from '@/utils/portalSession'
import {
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
  canAccessRoles,
  getHomePath,
  normalizeRole
} from '@/utils/access'
import {
  getStoredAvatar,
  getStoredDisplayName,
  getStoredRole,
  getStoredTenantContext,
  getStoredUsername,
  getToken,
  onSessionChange,
  parseTokenPayload,
  setSession,
  syncSessionUser
} from '@/utils/session'
import {
  isRefreshStepUpRequired,
  onRefreshStepUpRequired
} from '@/utils/sessionRefresh'

const router = useRouter()
const route = useRoute()

const menuOpen = ref(false)
const role = ref(normalizeRole(getStoredRole()))
const displayName = ref(getStoredDisplayName())
const username = ref(getStoredUsername())
const avatar = ref(getStoredAvatar())
const tenantContext = ref(getStoredTenantContext())
const currentUserId = ref(String(parseTokenPayload()?.sub || ''))
const currentContacts = ref([])
const accounts = ref(getAccountHistory())
const switchTarget = ref(null)
const switchPending = ref(false)
const switchError = ref('')
// 其他标签页切换账号后，递增版本号以重新创建当前业务页面。
const sessionRevision = ref(0)
const logoutPending = ref(false)
const logoutError = ref('')
const contextPending = ref(false)
const contextError = ref('')
const stepUpOpen = ref(false)
const stepUpPending = ref(false)
const stepUpError = ref('')
const {
  state: apiConnectivity,
  probe: retryApiConnectivity
} = useApiConnectivity()

let activeToken = getToken()
let stopSessionSync = null
let stopStepUpSync = null

const {
  toasts,
  connectionState,
  reconnectAttempt,
  connect: connectAlertSocket,
  disconnect: disconnectAlertSocket,
  retry: retryAlertSocket,
  clearToasts
} = useAlertSocket()

const roleLabel = computed(() => {
  if (role.value === ROLE_SUPER_ADMIN) return '超级管理员'
  if (role.value === ROLE_ADMIN) return '管理员'
  return '普通用户'
})

async function loadCurrentAccount() {
  const userId = String(parseTokenPayload()?.sub || '')
  currentUserId.value = userId
  currentContacts.value = []
  if (!userId) return

  try {
    const response = await getMyProfile(userId)
    if (response.data?.code !== 200 || !response.data.data) return
    const profile = response.data.data
    username.value = profile.username || getStoredUsername()
    displayName.value = profile.nickname || username.value
    avatar.value = profile.avatar || ''
    syncSessionUser(profile)
    currentContacts.value = [
      profile.phone ? { type: 'phone', target: profile.phone } : null,
      profile.email ? { type: 'email', target: profile.email } : null
    ].filter(Boolean)
    accounts.value = rememberAccount(profile)
  } catch {
    accounts.value = rememberAccount({
      userId,
      username: getStoredUsername(),
      nickname: getStoredDisplayName(),
      avatar: getStoredAvatar()
    })
  }
}

function openAccountSwitch(account) {
  switchTarget.value = account
  switchError.value = ''
}

function removeRememberedAccount(userId) {
  accounts.value = forgetAccount(userId)
}

function closeAccountSwitch() {
  if (switchPending.value) return
  switchTarget.value = null
  switchError.value = ''
}

async function switchAccount(credentials) {
  if (switchPending.value || !switchTarget.value) return
  switchPending.value = true
  switchError.value = ''

  let switchStage = 'revoke'
  let sessionReplaced = false
  try {
    // 后端账号切换会立即撤销旧 sid；Portal 注销必须在调用切换接口前完成。
    await revokeActivePortalSession()

    switchStage = 'replace'
    const response = await replaceAccountSession(credentials)
    const body = response.data
    if (body?.code !== 200 || !body.data?.token) {
      throw new Error(body?.message || '验证码验证失败')
    }

    const verifiedUserId = String(body.data.userId || parseTokenPayload(body.data.token)?.sub || '')
    if (!verifiedUserId || verifiedUserId !== String(switchTarget.value.userId)) {
      throw new Error('验证结果与所选历史账号不一致，请移除该账号记录后重新登录')
    }

    const auth = body.data
    const nextRole = normalizeRole(auth.role)
    disconnectAlertSocket()
    clearToasts()
    setSession({
      ...auth,
      username: auth.username || switchTarget.value.username,
      role: nextRole
    }, {}, 'account-switch')
    sessionReplaced = true

    switchTarget.value = null
    await router.replace(getHomePath(nextRole, auth.context))
    await loadCurrentAccount()
  } catch (error) {
    if (sessionReplaced) {
      logoutError.value = '账号已经切换，但页面跳转失败，请刷新页面。'
    } else {
      if (switchStage === 'revoke') {
        switchError.value = '当前网络认证结束失败，账号未切换。请恢复服务后重试。'
      } else if (switchStage === 'replace') {
        switchError.value = error instanceof Error && !error.response
          ? error.message
          : getApiErrorMessage(error, '旧网络认证已经结束，但账号会话替换失败')
      } else {
        switchError.value = error instanceof Error && !error.response
          ? error.message
          : getApiErrorMessage(error, '账号切换失败')
      }
    }
  } finally {
    switchPending.value = false
  }
}

async function logout() {
  if (logoutPending.value) return
  logoutPending.value = true
  logoutError.value = ''

  try {
    await revokeActivePortalSession()
    await logoutAuthSession()
    disconnectAlertSocket()
    clearToasts()
    activeToken = ''
    await router.push('/login')
  } catch (error) {
    logoutError.value = getApiErrorMessage(
      error,
      '当前设备的网络认证结束失败，账号尚未退出，请检查服务后重试'
    )
  } finally {
    logoutPending.value = false
  }
}

async function applyContextChange(request) {
  if (contextPending.value) return
  contextPending.value = true
  contextError.value = ''
  try {
    const response = await request()
    const auth = response.data?.data
    if (response.data?.code !== 200 || !auth?.token || !auth?.context) {
      throw new Error(response.data?.message || '工作区切换失败，服务没有返回新的登录状态')
    }

    disconnectAlertSocket()
    clearToasts()
    setSession(auth, {}, 'context')
    await router.replace(getHomePath(auth.role, auth.context))
  } catch (error) {
    contextError.value = getApiErrorMessage(error, '工作区切换失败，请稍后重试')
  } finally {
    contextPending.value = false
  }
}

function switchTenant(tenant) {
  return applyContextChange(() => switchTenantContext(tenant.tenantId))
}

function enterPlatformTenant({ tenant, reason }) {
  return applyContextChange(() => enterPlatformTenantContext(tenant.tenantId, reason))
}

function returnPlatform() {
  return applyContextChange(() => returnPlatformContext())
}

async function completeStepUp(payload) {
  if (stepUpPending.value) return
  stepUpPending.value = true
  stepUpError.value = ''
  try {
    await refreshAfterStepUp(payload)
    stepUpOpen.value = false
    sessionRevision.value += 1
  } catch (error) {
    stepUpError.value = getApiErrorMessage(error, '身份验证失败')
  } finally {
    stepUpPending.value = false
  }
}

function syncSessionFromStorage() {
  const nextToken = getToken()

  // 其他标签页退出后，当前应用壳立即返回登录页。
  if (!nextToken) {
    disconnectAlertSocket()
    clearToasts()
    activeToken = ''
    router.replace('/login')
    return
  }

  const nextRole = normalizeRole(getStoredRole())
  const nextContext = getStoredTenantContext()
  const nextUserId = String(parseTokenPayload(nextToken)?.sub || '')
  const tokenChanged = nextToken !== activeToken
  const identityChanged = nextUserId !== currentUserId.value || nextRole !== role.value
  const contextChanged = JSON.stringify(nextContext) !== JSON.stringify(tenantContext.value)
  const canStayOnCurrentRoute = canAccessRoles(route.meta.roles, nextRole)

  role.value = nextRole
  displayName.value = getStoredDisplayName()
  username.value = getStoredUsername()
  avatar.value = getStoredAvatar()
  currentUserId.value = nextUserId
  tenantContext.value = nextContext
  activeToken = nextToken

  if (tokenChanged) {
    stepUpOpen.value = false
    stepUpError.value = ''
    // WebSocket 子协议携带 Access JWT，续期后也必须重建连接。
    disconnectAlertSocket()
    if (identityChanged || contextChanged) clearToasts()
    connectAlertSocket(nextRole)
  }

  if (identityChanged || contextChanged) {
    cancelActionDialog()
    sessionRevision.value += 1
    loadCurrentAccount()
  }

  if (contextChanged || identityChanged) {
    router.replace(getHomePath(nextRole, nextContext))
    return
  }

  // 角色变化后不能继续停留在已经失去权限的页面。
  if (!canStayOnCurrentRoute) {
    router.replace(getHomePath(nextRole, nextContext))
  }
}

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  }
)

onMounted(() => {
  connectAlertSocket(role.value)
  loadCurrentAccount()
  stopSessionSync = onSessionChange(syncSessionFromStorage)
  stopStepUpSync = onRefreshStepUpRequired(() => {
    stepUpError.value = ''
    stepUpOpen.value = true
  })
  if (isRefreshStepUpRequired()) stepUpOpen.value = true
})

onBeforeUnmount(() => {
  if (stopSessionSync) stopSessionSync()
  if (stopStepUpSync) stopStepUpSync()
})
</script>

<template>
  <div class="admin-starry app-shell">
    <StarrySky />
    <GlobalToast :toasts="toasts" />
    <ActionConfirmDialog />
    <AccountSwitchDialog
      :open="Boolean(switchTarget)"
      :account="switchTarget"
      :submitting="switchPending"
      :submit-error="switchError"
      @close="closeAccountSwitch"
      @submit="switchAccount"
    />
    <RefreshStepUpDialog
      :open="stepUpOpen"
      :contacts="currentContacts"
      :submitting="stepUpPending"
      :submit-error="stepUpError"
      @close="stepUpOpen = false"
      @submit="completeStepUp"
    />

    <div class="app-shell-frame">
      <AppSidebar
        :role="role"
        :context="tenantContext"
        :open="menuOpen"
        @close="menuOpen = false"
      />

      <button
        v-if="menuOpen"
        class="app-sidebar-backdrop"
        type="button"
        aria-label="关闭导航"
        @click="menuOpen = false"
      ></button>

      <div class="app-shell-body">
        <AppHeader
          :display-name="displayName"
          :username="username"
          :avatar="avatar"
          :current-user-id="currentUserId"
          :accounts="accounts"
          :role-label="roleLabel"
          :menu-open="menuOpen"
          :connection-state="connectionState"
          :reconnect-attempt="reconnectAttempt"
          :api-status="apiConnectivity.status"
          :api-message="apiConnectivity.message"
          :logout-busy="logoutPending"
          :role="role"
          :tenant-context="tenantContext"
          :context-busy="contextPending"
          @toggle-menu="menuOpen = !menuOpen"
          @retry-alert-socket="retryAlertSocket"
          @retry-api="retryApiConnectivity"
          @logout="logout"
          @switch-account="openAccountSwitch"
          @forget-account="removeRememberedAccount"
          @switch-tenant="switchTenant"
          @enter-platform-tenant="enterPlatformTenant"
          @return-platform="returnPlatform"
        />

        <main class="app-content">
          <p v-if="logoutError" class="alert error" aria-live="polite">{{ logoutError }}</p>
          <p v-if="contextError" class="alert error" aria-live="polite">{{ contextError }}</p>
          <TenantContextGate :context="tenantContext">
            <RouterView v-slot="{ Component, route: currentRoute }">
              <!-- 不同业务 URL 使用独立实例，避免分页和弹窗状态串场。 -->
              <component
                :is="Component"
                :key="`${currentRoute.name || currentRoute.fullPath}:${sessionRevision}`"
              />
            </RouterView>
          </TenantContextGate>
        </main>
      </div>
    </div>
  </div>
</template>
