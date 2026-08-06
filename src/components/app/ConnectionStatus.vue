<script setup>
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'

const props = defineProps({
  socketStatus: { type: String, default: 'idle' },
  socketAttempt: { type: Number, default: 0 },
  apiStatus: { type: String, default: 'unknown' },
  apiMessage: { type: String, default: '' }
})

const emit = defineEmits(['retry-socket', 'retry-api'])

const socketLabels = {
  connecting: '正在连接实时提醒',
  connected: '实时提醒正常',
  reconnecting: '正在恢复实时提醒',
  disconnected: '实时提醒已断开',
  idle: '当前账号无需接收实时提醒'
}

const summary = computed(() => {
  if (props.apiStatus === 'unreachable') {
    return { label: '无法连接服务', tone: 'unreachable' }
  }

  if (props.apiStatus === 'degraded') {
    return { label: '部分功能暂不可用', tone: 'degraded' }
  }

  if (props.apiStatus === 'unknown') {
    return { label: '正在检查连接', tone: 'connecting' }
  }

  if (props.socketStatus === 'disconnected') {
    return { label: '实时提醒已断开', tone: 'disconnected' }
  }

  if (props.socketStatus === 'reconnecting') {
    return { label: '正在恢复实时提醒', tone: 'reconnecting' }
  }

  if (props.socketStatus === 'connecting') {
    return { label: '正在连接实时提醒', tone: 'connecting' }
  }

  return { label: '连接正常', tone: 'connected' }
})

const detail = computed(() => {
  const apiText = props.apiStatus === 'unreachable'
    ? (props.apiMessage || '当前设备无法访问服务')
    : props.apiStatus === 'degraded'
      ? (props.apiMessage || '部分功能暂时不可用')
      : props.apiStatus === 'online'
        ? '主要功能正常'
        : '正在确认服务状态'

  const socketText = socketLabels[props.socketStatus] || '实时提醒状态未知'
  const attemptText = props.socketStatus === 'reconnecting' && props.socketAttempt
    ? `，第 ${props.socketAttempt} 次重试`
    : ''

  return `${apiText}；${socketText}${attemptText}`
})

const canRetryApi = computed(() => (
  props.apiStatus === 'unreachable' || props.apiStatus === 'degraded'
))

const canRetrySocket = computed(() => (
  props.socketStatus === 'disconnected' || props.socketStatus === 'reconnecting'
))

const retryTitle = computed(() => {
  if (canRetryApi.value && canRetrySocket.value) return '重新检查服务并恢复实时提醒'
  if (canRetryApi.value) return '重新检查服务连接'
  return '立即恢复实时提醒'
})

function retry() {
  if (canRetryApi.value) emit('retry-api')
  if (canRetrySocket.value) emit('retry-socket')
}
</script>

<template>
  <div class="connection-status" aria-live="polite">
    <span
      :class="['connection-item', `connection-item--${summary.tone}`]"
      :title="detail"
    >
      <span :class="['connection-dot', `connection-dot--${summary.tone}`]"></span>
      {{ summary.label }}
    </span>

    <button
      v-if="canRetryApi || canRetrySocket"
      class="icon-button"
      type="button"
      :title="retryTitle"
      :aria-label="retryTitle"
      @click="retry"
    >
      <RefreshCw :size="14" />
    </button>
  </div>
</template>

<style scoped>
.connection-status,
.connection-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--wm-text-soft);
  font-size: 12px;
}

.connection-status {
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.connection-item {
  line-height: 1.3;
}

.connection-item--unreachable,
.connection-item--degraded,
.connection-item--disconnected,
.connection-item--reconnecting {
  color: #f2d89b;
}

.connection-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--wm-muted);
}

.connection-dot--connected,
.connection-dot--online {
  background: var(--wm-success);
}

.connection-dot--connecting,
.connection-dot--reconnecting,
.connection-dot--degraded {
  background: var(--wm-warning);
}

.connection-dot--disconnected,
.connection-dot--unreachable {
  background: var(--wm-danger);
}

.connection-status .icon-button {
  width: 30px;
  height: 30px;
  flex-basis: 30px;
}

@media (max-width: 700px) {
  .connection-item {
    max-width: calc(100vw - 92px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 460px) {
  .connection-item {
    max-width: calc(100vw - 92px);
  }
}
</style>
