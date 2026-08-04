<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import AppHeader from '@/components/app/AppHeader.vue'
import AppSidebar from '@/components/app/AppSidebar.vue'
import GlobalToast from '@/components/app/GlobalToast.vue'
import ActionConfirmDialog from '@/components/app/ActionConfirmDialog.vue'
import AccountSwitchDialog from '@/components/app/AccountSwitchDialog.vue'
import { getMyProfile } from '@/api/account'
import { loginByVerifyCode } from '@/api/auth'
import { useAlertSocket } from '@/composables/useAlertSocket'
import { useApiConnectivity } from '@/composables/useApiConnectivity'
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
  clearSession,
  getStoredAvatar,
  getStoredDisplayName,
  getStoredRole,
  getStoredUsername,
  getToken,
  onSessionChange,
  parseTokenPayload,
  setSession,
  syncSessionUser
} from '@/utils/session'

const router = useRouter()
const route = useRoute()

const menuOpen = ref(false)
const role = ref(normalizeRole(getStoredRole()))
const displayName = ref(getStoredDisplayName())
const username = ref(getStoredUsername())
const avatar = ref(getStoredAvatar())
const currentUserId = ref(String(parseTokenPayload()?.sub || ''))
const accounts = ref(getAccountHistory())
const switchTarget = ref(null)
const switchPending = ref(false)
const switchError = ref('')
// 其他标签页切换账号后，递增版本号以重新创建当前业务页面。
const sessionRevision = ref(0)
const logoutPending = ref(false)
const logoutError = ref('')
const {
  state: apiConnectivity,
  probe: retryApiConnectivity
} = useApiConnectivity()

let activeToken = getToken()
let stopSessionSync = null

const {
  toasts,
  connectionState,
  reconnectAttempt,
  connect: connectAlertSocket,
  disconnect: disconnectAlertSocket,
  retry: retryAlertSocket
} = useAlertSocket()

const roleLabel = computed(() => {
  if (role.value === ROLE_SUPER_ADMIN) return '超级管理员'
  if (role.value === ROLE_ADMIN) return '管理员'
  return '普通用户'
})

async function loadCurrentAccount() {
  const userId = String(parseTokenPayload()?.sub || '')
  currentUserId.value = userId
  if (!userId) return

  try {
    const response = await getMyProfile(userId)
    if (response.data?.code !== 200 || !response.data.data) return
    const profile = response.data.data
    username.value = profile.username || getStoredUsername()
    displayName.value = profile.nickname || username.value
    avatar.value = profile.avatar || ''
    syncSessionUser(profile)
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

  let switchStage = 'verify'
  let sessionReplaced = false
  try {
    const response = await loginByVerifyCode(credentials)
    const body = response.data
    if (body?.code !== 200 || !body.data?.token) {
      throw new Error(body?.message || '验证码验证失败')
    }

    switchStage = 'identity'
    const verifiedUserId = String(parseTokenPayload(body.data.token)?.sub || '')
    if (!verifiedUserId || verifiedUserId !== String(switchTarget.value.userId)) {
      throw new Error('验证结果与所选历史账号不一致，请移除该账号记录后重新登录')
    }

    // 旧 JWT 仍在 localStorage 中，先用它撤销当前设备的 Portal Session。
    switchStage = 'revoke'
    await revokeActivePortalSession()

    switchStage = 'replace'
    const auth = body.data
    const nextRole = normalizeRole(auth.role)
    disconnectAlertSocket()
    setSession(auth.token, {
      username: auth.username || switchTarget.value.username,
      nickname: auth.nickname || '',
      avatar: auth.avatar || '',
      role: nextRole
    })
    sessionReplaced = true

    switchTarget.value = null
    role.value = nextRole
    username.value = auth.username || ''
    displayName.value = auth.nickname || username.value
    avatar.value = auth.avatar || ''
    activeToken = auth.token
    sessionRevision.value += 1
    connectAlertSocket(nextRole)
    await router.replace(getHomePath(nextRole))
    await loadCurrentAccount()
  } catch (error) {
    if (sessionReplaced) {
      logoutError.value = '账号已经切换，但页面跳转失败，请刷新页面。'
    } else {
      if (switchStage === 'identity') {
        switchError.value = error instanceof Error ? error.message : '历史账号身份校验失败'
      } else if (switchStage === 'revoke') {
        switchError.value = '验证码已通过，但旧网络认证结束失败，账号未切换。请恢复服务后重新获取验证码。'
      } else if (switchStage === 'replace') {
        switchError.value = '旧网络认证已经结束，但账号会话替换失败，请重新登录。'
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
    disconnectAlertSocket()
    activeToken = ''
    clearSession('')
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

function syncSessionFromStorage() {
  const nextToken = getToken()

  // 其他标签页退出后，当前应用壳立即返回登录页。
  if (!nextToken) {
    disconnectAlertSocket()
    activeToken = ''
    router.replace('/login')
    return
  }

  const nextRole = normalizeRole(getStoredRole())
  const identityChanged = nextToken !== activeToken || nextRole !== role.value
  const canStayOnCurrentRoute = canAccessRoles(route.meta.roles, nextRole)

  role.value = nextRole
  displayName.value = getStoredDisplayName()
  username.value = getStoredUsername()
  avatar.value = getStoredAvatar()
  currentUserId.value = String(parseTokenPayload()?.sub || '')
  activeToken = nextToken

  if (identityChanged) {
    // 新账号需要使用新 JWT 重建管理员告警连接。
    disconnectAlertSocket()
    connectAlertSocket(nextRole)

    // 仍有权访问当前页面时，重新加载页面，避免显示前一个账号的数据。
    if (canStayOnCurrentRoute) {
      sessionRevision.value += 1
    }
    loadCurrentAccount()
  }

  // 角色变化后不能继续停留在已经失去权限的页面。
  if (!canStayOnCurrentRoute) {
    router.replace(getHomePath(nextRole))
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
})

onBeforeUnmount(() => {
  if (stopSessionSync) stopSessionSync()
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

    <div class="app-shell-frame">
      <AppSidebar
        :role="role"
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
          @toggle-menu="menuOpen = !menuOpen"
          @retry-alert-socket="retryAlertSocket"
          @retry-api="retryApiConnectivity"
          @logout="logout"
          @switch-account="openAccountSwitch"
          @forget-account="removeRememberedAccount"
        />

        <main class="app-content">
          <p v-if="logoutError" class="alert error" aria-live="polite">{{ logoutError }}</p>
          <RouterView v-slot="{ Component, route: currentRoute }">
            <!-- 不同业务 URL 使用独立实例，避免分页和弹窗状态串场。 -->
            <component
              :is="Component"
              :key="`${currentRoute.name || currentRoute.fullPath}:${sessionRevision}`"
            />
          </RouterView>
        </main>
      </div>
    </div>
  </div>
</template>
