<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { RefreshCw, Send, UserX, Ban } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import {
  blockTraffic,
  disconnectMac,
  getDeviceCommands
} from '@/api/devices'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import {
  isCommandTerminal,
  resolveCommandStatus
} from '@/config/networkStatus'

const props = defineProps({
  deviceCode: {
    type: String,
    default: ''
  },
  retired: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const mode = ref('disconnect')
const busy = ref(false)
const listLoading = ref(false)
const pollBusy = ref(false)
const listError = ref('')
const message = ref('')
const messageType = ref('success')
const rows = ref([])
const currentRecord = ref(null)
const currentRequestId = ref('')

const form = reactive({
  mac: '',
  dstIp: '',
  sni: ''
})

let deviceVersion = 0
let pollTimer = null
let pollCount = 0

const commandStatus = computed(() =>
  resolveCommandStatus(currentRecord.value?.status)
)

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

function clearPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}

async function fetchCommands(version = deviceVersion) {
  if (!props.deviceCode) return []

  const data = readBody(
    await getDeviceCommands({
      current: 1,
      size: 20,
      deviceCode: props.deviceCode
    }),
    '设备命令查询失败'
  )

  if (version !== deviceVersion) return []
  return Array.isArray(data?.records) ? data.records : []
}

async function loadHistory() {
  const version = deviceVersion
  listLoading.value = true
  listError.value = ''

  try {
    rows.value = await fetchCommands(version)

    if (currentRequestId.value) {
      currentRecord.value = rows.value.find(
        (item) => item.requestId === currentRequestId.value
      ) || currentRecord.value
    }
  } catch (error) {
    if (version !== deviceVersion) return

    listError.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, '设备命令查询失败')
  } finally {
    if (version === deviceVersion) listLoading.value = false
  }
}

function trackRequest(requestId) {
  currentRequestId.value = requestId || ''
  currentRecord.value = null

  if (!requestId) return

  loadHistory()
  startPolling(requestId)
}

defineExpose({
  refresh: loadHistory,
  trackRequest
})

async function pollRequest(requestId) {
  if (!requestId || requestId !== currentRequestId.value || pollBusy.value) return
  const version = deviceVersion
  pollCount += 1
  pollBusy.value = true

  try {
    const records = await fetchCommands(deviceVersion)
    const record = records.find((item) => item.requestId === requestId)

    if (version !== deviceVersion || requestId !== currentRequestId.value)  return
    rows.value = records

    if (record) {
      currentRecord.value = record

      if (isCommandTerminal(record.status)) {
        clearPolling()
        showMessage(
          record.status === 2 ? 'success' : 'error',
          `命令 ${requestId}：${resolveCommandStatus(record.status).label}`
        )
      }
    }

    // 只停止轮询，不把“暂未查到记录”伪装成超时终态。
    if (pollCount >= 20 && !isCommandTerminal(record?.status)) {
      clearPolling()
      showMessage('error', '命令记录暂未返回，请手动刷新命令历史')
    }
  } catch (error) {
    if (requestId !== currentRequestId.value) return
    showMessage('error', getApiErrorMessage(error, '命令状态查询失败'))
  } finally {
    pollBusy.value = false
  }
}

function startPolling(requestId) {
  clearPolling()
  pollCount = 0

  pollTimer = window.setInterval(() => {
    pollRequest(requestId)
  }, 3000)
  pollRequest(requestId)
}

async function submitCommand() {
  if (busy.value || props.disabled || props.retired || !props.deviceCode) return

  const action = mode.value
  const payload = action === 'disconnect'
    ? { mac: form.mac.trim() }
    : {
        dstIp: form.dstIp.trim(),
        sni: form.sni.trim() || undefined
      }

  if (action === 'disconnect' && !payload.mac) {
    showMessage('error', 'MAC 地址不能为空')
    return
  }

  if (action === 'block' && !payload.dstIp) {
    showMessage('error', '目标 IP 不能为空')
    return
  }

  const title = action === 'disconnect' ? '断开客户端' : '阻断流量'
  if (!await confirmAction({
    title: `确认${title}`,
    message: `将向设备 ${props.deviceCode} 提交${title}命令，并根据 requestId 跟踪真实终态。`,
    confirmLabel: '提交命令',
    tone: 'danger'
  })) {
    return
  }

  busy.value = true
  message.value = ''
  currentRecord.value = null

  try {
    const response = action === 'disconnect'
      ? await disconnectMac(props.deviceCode, payload)
      : await blockTraffic(props.deviceCode, payload)

    const data = readBody(response, `${title}请求失败`)

    if (!data?.requestId) {
      throw new Error('后端未返回真实 requestId')
    }

    showMessage('success', `${title}请求已受理，requestId：${data.requestId}`)
    trackRequest(data.requestId)
  } catch (error) {
    showMessage(
      'error',
      error instanceof Error && !error.response
        ? error.message
        : getApiErrorMessage(error, `${title}请求失败`)
    )
  } finally {
    busy.value = false
  }
}

function changeMode(nextMode) {
  if (!busy.value) {
    mode.value = nextMode
    message.value = ''
  }
}

watch(
  () => props.deviceCode,
  () => {
    deviceVersion += 1
    clearPolling()
    currentRequestId.value = ''
    currentRecord.value = null
    rows.value = []
    loadHistory()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  deviceVersion += 1
  clearPolling()
})
</script>

<template>
  <section class="glass-panel device-command-panel">
    <header>
      <p class="page-kicker">设备命令</p>
      <h3>客户端和流量控制</h3>
    </header>

    <div class="command-mode-switch">
      <button
        :class="{ active: mode === 'disconnect' }"
        type="button"
        :disabled="busy || props.retired"
        @click="changeMode('disconnect')"
      >
        <UserX :size="16" aria-hidden="true" />
        断开 MAC
      </button>

      <button
        :class="{ active: mode === 'block' }"
        type="button"
        :disabled="busy || props.retired"
        @click="changeMode('block')"
      >
        <Ban :size="16" aria-hidden="true" />
        阻断流量
      </button>
    </div>

    <form class="command-action-form" @submit.prevent="submitCommand">
      <label v-if="mode === 'disconnect'">
        <span>客户端 MAC</span>
        <input
          v-model="form.mac"
          required
          maxlength="17"
          pattern="[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}"
          placeholder="AA:BB:CC:DD:EE:FF"
          :disabled="busy || props.retired"
        />
      </label>

      <template v-else>
        <label>
          <span>目标 IPv4</span>
          <input
            v-model="form.dstIp"
            required
            maxlength="15"
            placeholder="192.168.1.10"
            :disabled="busy || props.retired"
          />
        </label>

        <label>
          <span>SNI（可选）</span>
          <input
            v-model="form.sni"
            maxlength="255"
            placeholder="example.com"
            :disabled="busy || props.retired"
          />
        </label>
      </template>

      <button
        class="danger-button"
        type="submit"
        :disabled="busy || props.disabled || props.retired || !props.deviceCode"
      >
        <Send :size="16" aria-hidden="true" />
        {{ busy ? '发送中...' : '发送命令' }}
      </button>
    </form>

    <p
      v-if="message"
      :class="['alert', messageType === 'success' ? 'success' : 'error']"
    >
      {{ message }}
    </p>

    <div v-if="currentRequestId" class="command-current">
      <span>当前 requestId</span>
      <strong>{{ currentRequestId }}</strong>
      <span v-if="currentRecord" :class="['status-pill', `status-pill--${commandStatus.tone}`]">
        {{ commandStatus.label }}
      </span>
    </div>

<StateBlock
  v-if="listLoading && !rows.length"
  type="loading"
  title="正在加载命令历史"
  text="正在读取设备命令终态"
/>

<p v-if="listError" class="alert error">
  {{ listError }}
</p>

<StateBlock
  v-if="!listLoading && !listError && !rows.length"
  title="暂无命令记录"
  text="该设备还没有可查询的命令"
/>

<div v-if="rows.length" class="command-history-wrap">
  <div class="command-history-head">
        <strong>命令历史</strong>
        <button
          class="secondary-button compact-button"
          type="button"
          :disabled="listLoading"
          @click="loadHistory"
        >
          <RefreshCw :size="14" aria-hidden="true" />
          刷新
        </button>
      </div>

      <table class="command-history-table">
        <thead>
          <tr>
            <th>requestId</th>
            <th>命令</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.commandId || row.requestId">
            <td class="breakable-cell">{{ row.requestId || '-' }}</td>
            <td>{{ row.commandType || row.purpose || '-' }}</td>
            <td>
              <span :class="['status-pill', `status-pill--${resolveCommandStatus(row.status).tone}`]">
                {{ resolveCommandStatus(row.status).label }}
              </span>
            </td>
            <td>{{ formatTime(row.createTime) }}</td>
            <td class="breakable-cell">{{ row.resultMessage || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.command-mode-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.command-mode-switch button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--wm-border);
  border-radius: 6px;
  padding: 8px 12px;
  color: var(--wm-text-soft);
  background: var(--wm-bg-soft);
  box-shadow: none;
}

.command-mode-switch button.active {
  color: var(--wm-text);
  border-color: var(--wm-primary);
  background: var(--wm-surface-muted);
}

.command-action-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.command-current,
.command-history-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.command-current span:first-child {
  color: var(--wm-muted);
}

.command-current strong {
  overflow-wrap: anywhere;
  color: var(--wm-primary);
}

.command-history-wrap {
  min-width: 0;
  margin-top: 14px;
  overflow-x: auto;
  scrollbar-gutter: stable;
}

.command-history-table {
  min-width: 820px;
}

.command-history-table th,
.command-history-table td {
  white-space: nowrap;
}

@media (max-width: 700px) {
  .command-action-form {
    grid-template-columns: 1fr;
  }

  .command-action-form button {
    width: 100%;
  }
}
</style>
