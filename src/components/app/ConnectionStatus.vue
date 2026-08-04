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
  connecting: '告警连接中',
  connected: '告警已连接',
  reconnecting: '告警重连中',
  disconnected: '告警已断开',
  idle: '当前账号不使用告警通道'
}

const summary = computed(() => {
  if (props.apiStatus === 'unreachable') {
    return { label: '服务不可达', tone: 'unreachable' }
  }

  if (props.apiStatus === 'degraded') {
    return { label: '服务降级', tone: 'degraded' }
  }

  if (props.apiStatus === 'unknown') {
    return { label: '正在检查连接', tone: 'connecting' }
  }

  if (props.socketStatus === 'disconnected') {
    return { label: '告警通道断开', tone: 'disconnected' }
  }

  if (props.socketStatus === 'reconnecting') {
    return { label: '告警通道重连中', tone: 'reconnecting' }
  }

  if (props.socketStatus === 'connecting') {
    return { label: '告警通道连接中', tone: 'connecting' }
  }

  return { label: '连接正常', tone: 'connected' }
})

const detail = computed(() => {
  const apiText = props.apiStatus === 'unreachable'
    ? (props.apiMessage || '当前设备无法访问服务')
    : props.apiStatus === 'degraded'
      ? (props.apiMessage || '下游服务暂时不可用')
      : props.apiStatus === 'online'
        ? 'API 正常'
        : 'API 状态等待确认'

  const socketText = socketLabels[props.socketStatus] || '告警连接状态未知'
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
  if (canRetryApi.value && canRetrySocket.value) return '重新检查服务并重连告警通道'
  if (canRetryApi.value) return '重新检查服务连接'
  return '立即重连告警 WebSocket'
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
