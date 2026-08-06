<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Eye, EyeOff, RefreshCw, Send, Wifi } from 'lucide-vue-next'
import {
  getLatestWifiConfigTask,
  getWifiConfigTask,
  stageWifiCandidate
} from '@/api/devices'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import {
  isWifiConfigTerminal,
  resolveWifiConfigStatus
} from '@/config/networkStatus'

const props = defineProps({
  deviceCode: { type: String, default: '' },
  retired: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  online: { type: Boolean, default: false },
  wifiStatus: { type: String, default: '' },
  lastHeartbeat: { type: String, default: '' },
  initialRequestId: { type: String, default: '' }
})

const emit = defineEmits(['task-started'])

const busy = ref(false)
const queryBusy = ref(false)
const message = ref('')
const messageType = ref('success')
const task = ref(null)
const requestId = ref('')
const passwordVisible = ref(false)

const form = reactive({
  ssid: '',
  password: ''
})

let deviceVersion = 0
let taskVersion = 0
let pollTimer = null
let pollCount = 0

const statusInfo = computed(() =>
  resolveWifiConfigStatus(task.value?.status)
)
const unavailableReason = computed(() => {
  if (props.retired) return '设备已经退役，不能修改上游网络'
  if (!props.online) return '设备当前离线，不能下发上游网络配置'
  if (props.disabled) return '设备操作正在处理中，请稍后再试'
  if (!props.deviceCode) return '设备编码缺失，不能下发配置'
  return ''
})
const canSubmit = computed(() => !busy.value && !unavailableReason.value)

function readBody(response, fallback) {
  const body = response?.data

  if (body?.code !== 200) {
    throw new Error(body?.message || fallback)
  }

  return body.data
}

function showMessage(type, text) {
  messageType.value = type
  message.value = text
}

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}

function utf8Length(value) {
  return new TextEncoder().encode(value).length
}

function validateCredentials(ssid, password) {
  const ssidBytes = utf8Length(ssid)

  if (ssidBytes < 1 || ssidBytes > 32 || ssid.includes('\0')) {
    return 'SSID 的 UTF-8 长度必须在 1 到 32 字节之间'
  }

  const passwordBytes = utf8Length(password)
  if (passwordBytes !== 0 && (passwordBytes < 8 || passwordBytes > 63)) {
    return 'WiFi 密码需留空，或使用 8 到 63 字节的密码'
  }

  if (password.includes('\0')) {
    return 'WiFi 密码不能包含空字符'
  }

  return ''
}

function clearPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

async function queryTask(expectedRequestId = requestId.value) {
  if (
    !props.deviceCode
    || !expectedRequestId
    || expectedRequestId !== requestId.value
    || queryBusy.value
  ) {
    return
  }

  const version = deviceVersion
  const currentTaskVersion = taskVersion
  const deviceCode = props.deviceCode
  queryBusy.value = true

  try {
    const data = readBody(
      await getWifiConfigTask(deviceCode, expectedRequestId),
      'WiFi 配置状态查询失败'
    )

    // 设备或任务已经切换时，丢弃旧请求结果。
    if (
      version !== deviceVersion
      || currentTaskVersion !== taskVersion
      || deviceCode !== props.deviceCode
      || expectedRequestId !== requestId.value
    ) {
      return
    }

    task.value = data

    if (isWifiConfigTerminal(data?.status)) {
      clearPolling()

      if (Number(data?.status) === 2) {
        showMessage('success', 'ESP 上游网络配置已生效')
      } else if (Number(data?.status) === 3) {
        showMessage('error', data?.failureMessage || 'ESP 未能应用上游网络配置')
      } else if (Number(data?.status) === 5) {
        showMessage('warning', '该配置任务已被更新的候选配置替代')
      }
    }
  } catch (error) {
    if (
      version !== deviceVersion
      || currentTaskVersion !== taskVersion
      || expectedRequestId !== requestId.value
    ) {
      return
    }

    const responseStatus = Number(error.response?.status) || 0
    const businessStatus = Number(error.response?.data?.code) || 0

    // 无效或不存在的深链任务不会持续轮询，避免重复请求同一个错误地址。
    if ([400, 404].includes(responseStatus) || [400, 404].includes(businessStatus)) {
      clearPolling()
    }

    showMessage(
      'error',
      error instanceof Error && !error.response
        ? error.message
        : getApiErrorMessage(error, 'WiFi 配置状态查询失败')
    )
  } finally {
    if (
      version === deviceVersion
      && currentTaskVersion === taskVersion
      && expectedRequestId === requestId.value
    ) {
      queryBusy.value = false
    }
  }
}

function startPolling(expectedRequestId = requestId.value) {
  clearPolling()
  pollCount = 0

  // 先创建定时器，立即查询到终态时才能正确停止它。
  pollTimer = window.setInterval(() => {
    if (queryBusy.value) return

    pollCount += 1

    if (pollCount >= 20) {
      clearPolling()
      showMessage('error', 'WiFi 配置状态暂未返回，请手动刷新')
      return
    }

    queryTask(expectedRequestId)
  }, 3000)

  queryTask(expectedRequestId)
}

async function submitCandidate() {
  if (!canSubmit.value) return

  const ssid = form.ssid.trim()
  const validationError = validateCredentials(ssid, form.password)

  if (validationError) {
    showMessage('error', validationError)
    return
  }

  if (!await confirmAction({
    title: '确认修改设备连接的 Wi-Fi',
    message: `设备 ${props.deviceCode} 将改为连接 Wi-Fi“${ssid}”。切换期间设备可能短暂离线。`,
    confirmLabel: '确认修改',
    tone: 'danger'
  })) {
    return
  }

  // 锁定本次请求所属的设备上下文。
  const version = deviceVersion
  const deviceCode = props.deviceCode

  busy.value = true
  message.value = ''

  try {
    const data = readBody(
      await stageWifiCandidate(deviceCode, {
        ssid,
        password: form.password
      }),
      'WiFi 候选配置提交失败'
    )

    // 请求期间设备已经切换或组件已经卸载，丢弃旧结果。
    if (
      version !== deviceVersion
      || deviceCode !== props.deviceCode
    ) {
      return
    }

    if (!data?.requestId) {
      throw new Error('服务没有返回此次配置的操作编号')
    }

    taskVersion += 1
    queryBusy.value = false
    task.value = data
    requestId.value = data.requestId
    form.password = ''
    passwordVisible.value = false
    emit('task-started', data.requestId)

    showMessage(
      'success',
      `Wi-Fi 修改请求已提交，操作编号：${data.requestId}`
    )

    startPolling()
  } catch (error) {
    if (
      version !== deviceVersion
      || deviceCode !== props.deviceCode
    ) {
      return
    }

    showMessage(
      'error',
      error instanceof Error && !error.response
        ? error.message
        : getApiErrorMessage(error, 'WiFi 候选配置提交失败')
    )
  } finally {
    // 旧设备请求不能修改新设备的提交状态。
    if (version === deviceVersion) {
      busy.value = false
    }
  }
}

function resetDeviceState() {
  deviceVersion += 1
  taskVersion += 1
  clearPolling()
  busy.value = false
  queryBusy.value = false
  task.value = null
  requestId.value = ''
  message.value = ''
  form.ssid = ''
  form.password = ''
  passwordVisible.value = false
}

function resumeInitialTask() {
  const initialRequestId = String(props.initialRequestId || '').trim()
  if (!props.deviceCode || !initialRequestId || initialRequestId === requestId.value) {
    return
  }

  taskVersion += 1
  clearPolling()
  queryBusy.value = false
  task.value = null
  requestId.value = initialRequestId
  message.value = ''
  startPolling(initialRequestId)
}

async function resumeLatestTask() {
  if (
    !props.deviceCode
    || String(props.initialRequestId || '').trim()
    || requestId.value
    || queryBusy.value
  ) {
    return
  }

  const version = deviceVersion
  const currentTaskVersion = taskVersion
  const deviceCode = props.deviceCode
  queryBusy.value = true

  try {
    const data = readBody(
      await getLatestWifiConfigTask(deviceCode),
      '最近 WiFi 配置查询失败'
    )

    if (
      version !== deviceVersion
      || currentTaskVersion !== taskVersion
      || deviceCode !== props.deviceCode
      || String(props.initialRequestId || '').trim()
    ) {
      return
    }

    // 新设备可能从未下发过上游网络配置，data=null 是正常空状态。
    if (!data) return

    if (!data.requestId) {
      throw new Error('最近一次 Wi-Fi 配置缺少操作编号')
    }

    taskVersion += 1
    queryBusy.value = false
    task.value = data
    requestId.value = data.requestId
    emit('task-started', data.requestId)
    startPolling(data.requestId)
  } catch (error) {
    if (
      version !== deviceVersion
      || currentTaskVersion !== taskVersion
      || deviceCode !== props.deviceCode
    ) {
      return
    }

    showMessage(
      'error',
      error instanceof Error && !error.response
        ? error.message
        : getApiErrorMessage(error, '最近 WiFi 配置查询失败')
    )
  } finally {
    if (
      version === deviceVersion
      && currentTaskVersion === taskVersion
      && deviceCode === props.deviceCode
    ) {
      queryBusy.value = false
    }
  }
}

function resumeTaskContext() {
  if (String(props.initialRequestId || '').trim()) {
    resumeInitialTask()
    return
  }

  resumeLatestTask()
}

watch(
  () => props.deviceCode,
  () => {
    resetDeviceState()
    resumeTaskContext()
  },
  { immediate: true }
)

watch(
  () => props.initialRequestId,
  () => resumeTaskContext()
)

onBeforeUnmount(() => {
  deviceVersion += 1
  clearPolling()
})
</script>

<template>
  <section class="glass-panel wifi-config-panel">
    <header class="wifi-config-header">
      <div>
        <p class="page-kicker">设备配置</p>
        <h3>设备连接的 Wi-Fi</h3>
      </div>
      <Wifi :size="22" aria-hidden="true" />
    </header>

    <dl class="wifi-runtime-summary">
      <div>
        <dt>设备编码</dt>
        <dd>{{ props.deviceCode || '-' }}</dd>
      </div>
      <div>
        <dt>设备状态</dt>
        <dd>
          <span :class="['status-pill', props.online ? 'status-pill--success' : 'status-pill--neutral']">
            {{ props.retired ? '已退役' : props.online ? '在线' : '离线' }}
          </span>
        </dd>
      </div>
      <div>
        <dt>Wi-Fi 连接状态</dt>
        <dd>{{ props.wifiStatus || '-' }}</dd>
      </div>
      <div>
        <dt>最近心跳</dt>
        <dd>{{ formatTime(props.lastHeartbeat) }}</dd>
      </div>
    </dl>

    <p v-if="unavailableReason" class="alert warning">
      {{ unavailableReason }}
    </p>

    <form class="wifi-config-form" @submit.prevent="submitCandidate">
      <label>
        <span>SSID</span>
        <input
          v-model="form.ssid"
          required
          maxlength="32"
          placeholder="请输入新的 Wi-Fi 名称"
          autocomplete="off"
          :disabled="!canSubmit"
        />
      </label>

      <label>
        <span>WiFi 密码</span>
        <span class="password-input-wrap">
          <input
            v-model="form.password"
            maxlength="63"
            :type="passwordVisible ? 'text' : 'password'"
            placeholder="开放网络留空，其他网络至少 8 字节"
            autocomplete="new-password"
            :disabled="!canSubmit"
          />
          <button
            class="password-toggle"
            type="button"
            :disabled="!canSubmit"
            :title="passwordVisible ? '隐藏密码' : '显示密码'"
            @click="passwordVisible = !passwordVisible"
          >
            <EyeOff v-if="passwordVisible" :size="16" aria-hidden="true" />
            <Eye v-else :size="16" aria-hidden="true" />
          </button>
        </span>
      </label>

      <button
        type="submit"
        :disabled="!canSubmit"
      >
        <Send :size="16" aria-hidden="true" />
        {{ busy ? '提交中...' : '修改设备 Wi-Fi' }}
      </button>
    </form>

    <p
      v-if="message"
      :class="['alert', messageType]"
    >
      {{ message }}
    </p>

    <section v-if="task" class="wifi-task-summary">
      <div class="wifi-task-header">
        <div>
          <span>Wi-Fi 修改记录</span>
          <strong>{{ task.requestId }}</strong>
        </div>

        <button
          class="secondary-button compact-button"
          type="button"
          :disabled="queryBusy"
          @click="queryTask()"
        >
          <RefreshCw :size="14" aria-hidden="true" />
          刷新状态
        </button>
      </div>

      <span :class="['status-pill', `status-pill--${statusInfo.tone}`]">
        {{ statusInfo.label }}
      </span>

      <dl class="wifi-task-list">
        <dt>SSID</dt>
        <dd>{{ task.ssid || '-' }}</dd>

        <dt>是否有密码</dt>
        <dd>{{ task.passwordConfigured ? '是' : '否' }}</dd>

        <dt>配置版本</dt>
        <dd>{{ task.configVersion ?? '-' }}</dd>

        <dt>提交时间</dt>
        <dd>{{ formatTime(task.stagedTime || task.createTime) }}</dd>

        <dt>生效时间</dt>
        <dd>{{ formatTime(task.activatedTime) }}</dd>

        <dt>失败原因</dt>
        <dd>{{ task.failureMessage || '-' }}</dd>
      </dl>
    </section>
  </section>
</template>

<style scoped>
.wifi-config-panel {
  min-width: 0;
  border-radius: 8px;
  padding: 16px;
}

.wifi-config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.wifi-config-header > svg {
  flex: 0 0 auto;
  color: var(--wm-primary);
}

.wifi-config-panel h3 {
  margin: 0;
  color: var(--wm-text);
  font-size: 17px;
}

.wifi-runtime-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 16px 0;
  border: 1px solid var(--wm-border);
  background: var(--wm-border);
}

.wifi-runtime-summary > div {
  min-width: 0;
  padding: 12px;
  background: var(--wm-bg-soft);
}

.wifi-runtime-summary dt {
  color: var(--wm-muted);
  font-size: 12px;
}

.wifi-runtime-summary dd {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  color: var(--wm-text);
}

.wifi-config-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  align-items: end;
  gap: 12px;
  margin-top: 14px;
}

.wifi-config-form span,
.wifi-task-header span {
  color: var(--wm-text-soft);
}

.password-input-wrap {
  position: relative;
  display: block;
}

.password-input-wrap input {
  width: 100%;
  padding-right: 42px;
}

.password-input-wrap .password-toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  border: 0;
  padding: 0;
  color: var(--wm-muted);
  background: transparent;
  box-shadow: none;
  transform: translateY(-50%);
}

.password-input-wrap .password-toggle:hover {
  color: var(--wm-text);
  background: var(--wm-surface-muted);
  transform: translateY(-50%);
}

.wifi-task-summary {
  margin-top: 16px;
  border-top: 1px solid var(--wm-border);
  padding-top: 14px;
}

.wifi-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wifi-task-header strong {
  display: block;
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: var(--wm-primary);
}

.wifi-task-list {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  margin: 14px 0 0;
}

.wifi-task-list dt,
.wifi-task-list dd {
  margin: 0;
  padding: 8px 0;
  border-bottom: 1px solid var(--wm-border);
}

.wifi-task-list dt {
  color: var(--wm-muted);
}

.wifi-task-list dd {
  overflow-wrap: anywhere;
  color: var(--wm-text-soft);
}

@media (max-width: 820px) {
  .wifi-runtime-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .wifi-config-form {
    grid-template-columns: 1fr;
  }

  .wifi-config-form button {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .wifi-runtime-summary {
    grid-template-columns: 1fr;
  }

  .wifi-task-header {
    align-items: stretch;
    flex-direction: column;
  }

  .wifi-task-header button {
    width: 100%;
  }
}
</style>
