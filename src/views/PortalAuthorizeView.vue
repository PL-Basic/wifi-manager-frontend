<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Check, CircleAlert, LogIn, RefreshCw, Wifi } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { authorizePortal, getPortalStatus } from '@/api/sessions'
import { getApiErrorInfo } from '@/utils/apiError'
import { resolveCommandStatus, resolveSessionStatus } from '@/config/networkStatus'
import { formatDateTime, formatDuration } from '@/utils/billing'
import {
  createClientRequestIdManager,
  normalizePortalAuthorizeInput
} from '@/utils/clientRequestId'
import { clearSession, getStoredDisplayName, getToken, onSessionChange } from '@/utils/session'
import {
  forgetActivePortalSession,
  getActivePortalSessionId,
  rememberActivePortalSession,
  revokeActivePortalSession
} from '@/utils/portalSession'
import './operations/operations.css'
import './billing.css'
import './portal.css'

const route = useRoute()
const router = useRouter()
const form = reactive({
  deviceCode: String(route.query.deviceCode || route.query.device || '').trim(),
  mac: String(route.query.mac || '').trim().toUpperCase(),
  ip: String(route.query.ip || '').trim(),
  deviceInfo: String(route.query.deviceInfo || navigator.userAgent || '').slice(0, 255),
  forceReplaceOldest: false
})
const status = ref(null)
const submitting = ref(false)
const polling = ref(false)
const error = ref('')
const errorType = ref('')
const message = ref('')
const pollCount = ref(0)
let pollTimer = null
let stopSessionSync = null
let activeToken = ''
const switchingAccount = ref(false)
const authorizeRequestIds = createClientRequestIdManager(normalizePortalAuthorizeInput)

const contextValid = computed(() => (
  Boolean(form.deviceCode)
  && form.deviceCode.length <= 64
  && /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(form.mac)
  && Boolean(form.ip)
  && form.ip.length <= 45
))

const sessionState = computed(() => resolveSessionStatus(status.value?.sessionStatusCode))
const commandState = computed(() => resolveCommandStatus(status.value?.commandStatusCode))
const authorized = computed(() => Number(status.value?.sessionStatusCode) === 1)
const failed = computed(() => (
  Number(status.value?.sessionStatusCode) === 0
  || [3, 4, 5].includes(Number(status.value?.commandStatusCode))
))
const canForceReplace = computed(() => errorType.value === 'conflict')

const progressSteps = computed(() => [
  { label: '账号身份', text: `${getStoredDisplayName() || '当前账号'} 已登录`, state: 'success' },
  {
    label: '认证请求',
    text: status.value ? `连接申请 ${status.value.sessionId} 已提交` : '等待提交联网申请',
    state: status.value ? 'success' : submitting.value ? 'active' : 'idle'
  },
  {
    label: '设备授权',
    text: status.value?.commandRequestId
      ? `${commandState.value.label} · ${status.value.commandRequestId}`
      : '等待设备命令',
    state: failed.value ? 'danger' : status.value?.commandRequestId ? (commandState.value.terminal ? 'success' : 'active') : 'idle'
  },
  {
    label: '网络接入',
    text: authorized.value ? '认证完成，可以开始上网' : (status.value?.statusMessage || '等待授权完成'),
    state: authorized.value ? 'success' : failed.value ? 'danger' : status.value ? 'active' : 'idle'
  }
])

function unwrap(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
  return response.data.data
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
  polling.value = false
}

function replaceSessionQuery(sessionId) {
  if (String(route.query.sessionId || '') === String(sessionId)) return
  router.replace({ query: { ...route.query, sessionId: String(sessionId) } })
}

function schedulePoll(delay = 1800) {
  stopPolling()
  if (!status.value?.sessionId || failed.value) return
  if (!authorized.value && pollCount.value >= 40) return
  polling.value = true
  pollTimer = setTimeout(() => pollStatus(status.value.sessionId), authorized.value ? 10000 : delay)
}

async function pollStatus(sessionId) {
  if (!sessionId || failed.value) return
  polling.value = true

  try {
    const data = unwrap(await getPortalStatus(sessionId), '认证状态查询失败')
    status.value = data
    pollCount.value += 1
    error.value = ''
    errorType.value = ''

    if (authorized.value) {
      rememberActivePortalSession(data.sessionId)
      message.value = data.statusMessage || '网络认证成功'
      // 认证成功后继续低频刷新，页面才能显示租约消费和最终断开状态。
      schedulePoll(10000)
    } else if (failed.value) {
      forgetActivePortalSession(data.sessionId)
      error.value = data.commandResultMessage || data.statusMessage || data.endReason || '设备未能完成授权'
      stopPolling()
    } else {
      schedulePoll()
    }
  } catch (cause) {
    const info = getApiErrorInfo(cause, '认证状态查询失败')
    error.value = info.message
    errorType.value = info.type
    stopPolling()
  }
}

function portalQueryWithoutSession() {
  const query = { ...route.query }
  delete query.sessionId
  return query
}

async function switchAccount() {
  if (switchingAccount.value) return
  const redirect = router.resolve({
    name: 'portal-authorize',
    query: portalQueryWithoutSession()
  }).fullPath

  switchingAccount.value = true
  error.value = ''

  try {
    await revokeActivePortalSession(status.value?.sessionId)
    stopPolling()
    status.value = null
    clearSession('当前网络接入账号已退出，请登录要使用网络的账号', true, 'success')
    await router.replace({ name: 'login', query: { redirect } })
  } catch (cause) {
    const info = getApiErrorInfo(cause, '当前设备的网络认证结束失败，请重试')
    error.value = info.message
    errorType.value = info.type
    switchingAccount.value = false
  }
}

async function submit() {
  if (!contextValid.value) {
    error.value = '接入信息不完整，请从 WiFi 热点认证入口重新打开此页面'
    errorType.value = 'validation'
    return
  }

  submitting.value = true
  error.value = ''
  errorType.value = ''
  message.value = ''
  stopPolling()

  try {
    const data = await authorizeRequestIds.run(
      form,
      async (request) => unwrap(
        await authorizePortal(request),
        '网络接入请求失败'
      )
    )
    status.value = data
    pollCount.value = 0
    replaceSessionQuery(data.sessionId)

    if (authorized.value) {
      rememberActivePortalSession(data.sessionId)
      message.value = data.statusMessage || '网络认证成功'
    } else if (failed.value) {
      forgetActivePortalSession(data.sessionId)
      error.value = data.commandResultMessage || data.statusMessage || '设备未能完成授权'
    } else {
      message.value = data.statusMessage || '认证请求已受理，正在等待设备确认'
      schedulePoll(900)
    }
  } catch (cause) {
    const info = getApiErrorInfo(cause, '网络接入请求失败')
    error.value = info.message
    errorType.value = info.type
  } finally {
    submitting.value = false
  }
}

function continueBrowsing() {
  const target = String(route.query.continueUrl || route.query.continue || '').trim()
  if (/^https?:\/\//i.test(target)) {
    window.location.assign(target)
    return
  }
  router.push('/app/account/profile')
}

onMounted(() => {
  activeToken = getToken()
  stopSessionSync = onSessionChange(() => {
    if (switchingAccount.value) return
    const currentToken = getToken()
    if (!currentToken) {
      router.replace({ path: '/login', query: { redirect: router.resolve({ name: 'portal-authorize', query: portalQueryWithoutSession() }).fullPath } })
      return
    }
    if (currentToken !== activeToken) {
      activeToken = currentToken
      stopPolling()
      status.value = null
      message.value = '登录账号已切换，请重新开始认证'
      router.replace({ name: 'portal-authorize', query: portalQueryWithoutSession() })
    }
  })

  const querySessionId = String(route.query.sessionId || '').trim()
  const existingSessionId = (
    /^\d+$/.test(querySessionId) && querySessionId !== '0'
      ? querySessionId
      : getActivePortalSessionId()
  )
  if (existingSessionId) {
    status.value = { sessionId: existingSessionId }
    replaceSessionQuery(existingSessionId)
    pollStatus(existingSessionId)
  } else if (!contextValid.value) {
    error.value = '接入信息不完整，请从 WiFi 热点认证入口重新打开此页面'
    errorType.value = 'validation'
  }
})

onBeforeUnmount(() => {
  stopPolling()
  if (stopSessionSync) stopSessionSync()
})
</script>

<template>
  <div class="portal-scene">
    <StarrySky />
    <main class="portal-shell">
      <header class="portal-brand">
        <div><p class="page-kicker">Wifi Manager 网络接入</p><h1>{{ status?.hotspotName || 'Wi-Fi 网络登录' }}</h1></div>
        <button class="portal-account" type="button" title="结束当前网络认证并切换账号" aria-label="结束当前网络认证并切换账号" :disabled="switchingAccount" @click="switchAccount">
          <LogIn :size="16" />{{ getStoredDisplayName() }}
        </button>
      </header>

      <section class="glass-panel portal-panel">
        <div class="billing-section-heading">
          <div><p class="page-kicker">接入请求</p><h3>{{ authorized ? '网络已连接' : '验证此设备' }}</h3></div>
          <span v-if="status" :class="['status-pill', `status-pill--${sessionState.tone}`]">{{ sessionState.label }}</span>
        </div>

        <p v-if="error" class="alert error"><CircleAlert :size="16" />{{ error }}</p>
        <p v-if="message" class="alert success">{{ message }}</p>

        <section class="portal-context" aria-label="接入设备信息">
          <div><span>热点设备</span><strong>{{ form.deviceCode || '-' }}</strong></div>
          <div><span>当前设备 MAC</span><strong>{{ form.mac || '-' }}</strong></div>
          <div><span>当前设备 IP</span><strong>{{ form.ip || '-' }}</strong></div>
        </section>

        <section class="portal-progress" aria-label="认证进度">
          <article v-for="(step, index) in progressSteps" :key="step.label" :class="['portal-step', `portal-step--${step.state}`]">
            <span class="portal-step__marker"><Check v-if="step.state === 'success'" :size="14" /><template v-else>{{ index + 1 }}</template></span>
            <div><strong>{{ step.label }}</strong><p>{{ step.text }}</p></div>
          </article>
        </section>

        <label v-if="canForceReplace" class="portal-force">
          <input v-model="form.forceReplaceOldest" type="checkbox" />
          <span>在线连接数已达到上限，可以结束最早的连接后重试</span>
        </label>

        <dl v-if="status" class="operations-detail portal-status-detail">
          <dt>申请编号</dt><dd>{{ status.sessionId }}</dd>
          <dt>授权模式</dt><dd>{{ status.authorizationMode || '-' }}</dd>
          <dt>剩余时长</dt><dd>{{ formatDuration(status.remainingSeconds) }}</dd>
          <dt>订阅结束</dt><dd>{{ formatDateTime(status.subscriptionEndTime) }}</dd>
          <dt>租约到期</dt><dd>{{ formatDateTime(status.leaseExpireTime) }}</dd>
          <dt>命令结果</dt><dd>{{ status.commandResultMessage || '-' }}</dd>
        </dl>

        <div class="portal-actions">
          <button v-if="authorized" type="button" @click="continueBrowsing"><Wifi :size="16" />继续上网</button>
          <button v-else type="button" :disabled="submitting || polling || (!contextValid && !status?.sessionId)" @click="status?.sessionId && !failed ? pollStatus(status.sessionId) : submit()">
            <RefreshCw v-if="polling" :size="16" />
            <Wifi v-else :size="16" />
            {{ submitting ? '提交中...' : polling ? '等待设备确认...' : failed ? '重试认证' : status?.sessionId ? '重新查询状态' : canForceReplace && form.forceReplaceOldest ? '替换旧连接并认证' : '开始认证' }}
          </button>
          <button v-if="!authorized && canForceReplace && !form.forceReplaceOldest" class="secondary-button" type="button" @click="form.forceReplaceOldest = true">允许替换旧连接</button>
        </div>
      </section>
    </main>
  </div>
</template>
