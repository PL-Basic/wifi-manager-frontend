<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import AppHeader from '@/components/app/AppHeader.vue'
import AppSidebar from '@/components/app/AppSidebar.vue'
import GlobalToast from '@/components/app/GlobalToast.vue'
import ActionConfirmDialog from '@/components/app/ActionConfirmDialog.vue'
import { useAlertSocket } from '@/composables/useAlertSocket'
import { useApiConnectivity } from '@/composables/useApiConnectivity'
import { getApiErrorMessage } from '@/utils/apiError'
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
  getStoredDisplayName,
  getStoredRole,
  getToken,
  onSessionChange
} from '@/utils/session'

const router = useRouter()
const route = useRoute()

const menuOpen = ref(false)
const role = ref(normalizeRole(getStoredRole()))
const displayName = ref(getStoredDisplayName())
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
  activeToken = nextToken

  if (identityChanged) {
    // 新账号需要使用新 JWT 重建管理员告警连接。
    disconnectAlertSocket()
    connectAlertSocket(nextRole)

    // 仍有权访问当前页面时，重新加载页面，避免显示前一个账号的数据。
    if (canStayOnCurrentRoute) {
      sessionRevision.value += 1
    }
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
