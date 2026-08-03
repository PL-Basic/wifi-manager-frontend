<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import { revokeSession } from '@/api/sessions'
import { getDeviceCommands } from '@/api/devices'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import {
  isCommandTerminal,
  resolveCommandStatus,
  resolveSessionStatus
} from '@/config/networkStatus'

const props = defineProps({
  open: Boolean,
  session: { type: Object, default: null }
})

const emit = defineEmits(['close', 'updated'])

const current = ref(null)
const busy = ref(false)
const commandLoading = ref(false)
const commandError = ref('')
const message = ref('')
const messageType = ref('success')
const commandRows = ref([])
const trackedCommand = ref(null)

let drawerVersion = 0
let pollTimer = null
let pollCount = 0

const sessionStatus = computed(() =>
  resolveSessionStatus(current.value?.status)
)

function readData(response, fallback) {
  const body = response?.data
  if (body?.code !== 200) {
    throw new Error(body?.message || fallback)
  }
  return body.data
}

function clearPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

async function loadCommands(trackRevoke = false) {
  if (!current.value?.sessionId) return

  const version = drawerVersion
  commandLoading.value = true
  commandError.value = ''

  try {
    const data = readData(
      await getDeviceCommands({
        current: 1,
        size: 20,
        sessionId: current.value.sessionId
      }),
      'Session 命令查询失败'
    )

    if (version !== drawerVersion) return

    commandRows.value = Array.isArray(data?.records) ? data.records : []

    if (trackRevoke) {
      const record = commandRows.value.find(
        (item) => item.purpose === 'ADMIN_REVOKE'
      )

      if (record) {
        trackedCommand.value = record

        if (isCommandTerminal(record.status)) {
          clearPolling()
          messageType.value = record.status === 2 ? 'success' : 'error'
          message.value = `撤销命令 ${record.requestId}：${resolveCommandStatus(record.status).label}`
        }
      }
    }
  } catch (error) {
    if (version !== drawerVersion) return
    commandError.value = getApiErrorMessage(error, 'Session 命令查询失败')
  } finally {
    if (version === drawerVersion) commandLoading.value = false
  }
}

async function pollRevokeCommand() {
  if (commandLoading.value) return
  pollCount += 1
  await loadCommands(true)

  if (pollCount >= 20 && !isCommandTerminal(trackedCommand.value?.status)) {
    clearPolling()
    messageType.value = 'error'
    message.value = 'Session 已关闭，但设备命令暂未返回终态，请手动刷新命令记录'
  }
}

function startPolling() {
  clearPolling()
  pollCount = 0

  pollTimer = window.setInterval(pollRevokeCommand, 3000)
  pollRevokeCommand()
}

async function executeRevoke() {
  if (!current.value || Number(current.value.status) === 0 || busy.value) return

  if (!await confirmAction({
    title: '确认注销 Session',
    message: `将向设备提交 Session ${current.value.sessionId} 的注销命令。请求受理不代表固件已经执行成功。`,
    confirmLabel: '提交注销',
    tone: 'danger'
  })) {
    return
  }

  const previousStatus = Number(current.value.status)
  busy.value = true
  message.value = ''
  commandError.value = ''
  trackedCommand.value = null

  try {
    const data = readData(
      await revokeSession(current.value.sessionId),
      'Session 注销失败'
    )

    current.value = { ...current.value, ...data }
    emit('updated', current.value)

    if (previousStatus === 3) {
      messageType.value = 'success'
      message.value = 'Session 已关闭；等待替换状态未向固件下发撤销命令'
      await loadCommands()
    } else {
      messageType.value = 'success'
      message.value = 'Session 注销请求已受理，正在查询固件执行结果'
      startPolling()
    }
  } catch (error) {
    messageType.value = 'error'
    message.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, 'Session 注销失败')
  } finally {
    busy.value = false
  }
}

function closeDrawer() {
  if (!busy.value) emit('close')
}

watch(
  [() => props.open, () => props.session?.sessionId],
  ([open]) => {
    drawerVersion += 1
    clearPolling()
    current.value = props.session ? { ...props.session } : null
    commandRows.value = []
    trackedCommand.value = null
    commandError.value = ''
    message.value = ''

    if (open && current.value) loadCommands()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  drawerVersion += 1
  clearPolling()
})
</script>

<template>
  <AppDrawer v-if="current" :open="open" :title="`Session ${current.sessionId}`" kicker="Session 详情" width="680px" :close-disabled="busy" @close="closeDrawer">
        <span :class="['status-pill', `status-pill--${sessionStatus.tone}`]">
          {{ sessionStatus.label }}
        </span>

        <dl class="session-detail-list">
          <dt>用户 ID</dt><dd>{{ current.userId ?? '-' }}</dd>
          <dt>节点 ID</dt><dd>{{ current.nodeId ?? '-' }}</dd>
          <dt>MAC</dt><dd>{{ current.mac || '-' }}</dd>
          <dt>IP</dt><dd>{{ current.ip || '-' }}</dd>
          <dt>设备信息</dt><dd>{{ current.deviceInfo || '-' }}</dd>
          <dt>替换的 Session</dt><dd>{{ current.replacedSessionId ?? '-' }}</dd>
          <dt>上行流量</dt><dd>{{ formatBytes(current.bytesUp) }}</dd>
          <dt>下行流量</dt><dd>{{ formatBytes(current.bytesDown) }}</dd>
          <dt>登录时间</dt><dd>{{ formatTime(current.loginTime) }}</dd>
          <dt>过期时间</dt><dd>{{ formatTime(current.expireTime) }}</dd>
          <dt>注销时间</dt><dd>{{ formatTime(current.logoutTime) }}</dd>
        </dl>

        <button
          class="danger-button"
          type="button"
          :disabled="busy || Number(current.status) === 0"
          @click="executeRevoke"
        >
          {{ busy ? '注销中...' : '注销 Session' }}
        </button>

        <p v-if="message" :class="['alert', messageType]">{{ message }}</p>

        <div class="session-command-header">
          <h4>关联设备命令</h4>
          <button class="secondary-button" type="button" :disabled="commandLoading" @click="loadCommands(false)">
            <RefreshCw :size="14" />
            刷新
          </button>
        </div>

        <p v-if="commandError" class="alert error">{{ commandError }}</p>

        <StateBlock
          v-if="commandLoading && !commandRows.length"
          type="loading"
          title="正在查询设备命令"
        />

        <StateBlock
          v-else-if="!commandError && !commandRows.length"
          title="暂无关联命令"
          text="部分未真正下发到固件的 Session 不会产生撤销命令"
        />

        <div v-else class="session-command-list">
          <article v-for="command in commandRows" :key="command.commandId || command.requestId">
            <strong>{{ command.requestId || '-' }}</strong>
            <span :class="['status-pill', `status-pill--${resolveCommandStatus(command.status).tone}`]">
              {{ resolveCommandStatus(command.status).label }}
            </span>
            <small>{{ command.purpose || command.commandType || '-' }}</small>
            <p>{{ command.resultMessage || '等待设备返回结果' }}</p>
          </article>
        </div>
  </AppDrawer>
</template>

<style scoped>
.session-command-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.session-command-header h4 {
  margin: 0;
  color: var(--wm-text);
}

.session-detail-list {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  margin: 18px 0;
}

.session-detail-list dt,
.session-detail-list dd {
  margin: 0;
  padding: 9px 0;
  border-bottom: 1px solid var(--wm-border);
}

.session-detail-list dt { color: var(--wm-muted); }
.session-detail-list dd { overflow-wrap: anywhere; color: var(--wm-text-soft); }

.session-command-header { margin-top: 22px; }

.session-command-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.session-command-list article {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--wm-border);
  border-radius: 6px;
}

.session-command-list strong {
  display: block;
  overflow-wrap: anywhere;
  color: var(--wm-primary);
}

.session-command-list small { color: var(--wm-muted); }
.session-command-list p { margin-bottom: 0; color: var(--wm-text-soft); }

@media (max-width: 560px) {
  .session-detail-list { grid-template-columns: 1fr; }
  .session-detail-list dt { padding-bottom: 2px; border-bottom: 0; }

  .session-command-header {
    align-items: stretch;
    flex-direction: column;
  }

  .session-command-header button {
    width: 100%;
  }
}
</style>
