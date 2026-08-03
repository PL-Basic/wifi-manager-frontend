import { onBeforeUnmount, ref } from 'vue'
import { getAlertWebSocketUrl } from '@/config/runtime'
import { isAdminRole } from '@/utils/access'
import { getToken } from '@/utils/session'

export function useAlertSocket() {
  const toasts = ref([])
  const connectionState = ref('idle')
  const reconnectAttempt = ref(0)
  let socket = null
  let reconnectTimer = null
  let desiredRole = null
  let toastSeed = 0
  const toastTimers = new Set()

  function removeToast(id) {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  function pushToast(payload = {}) {
    const toast = {
      id: ++toastSeed,
      title: payload.title || payload.ruleCode || '新告警',
      text: payload.mac
        ? `${payload.mac} 触发访问规则`
        : payload.message || '检测到新的告警事件'
    }

    toasts.value = [toast, ...toasts.value].slice(0, 4)
    const timer = window.setTimeout(() => {
      removeToast(toast.id)
      toastTimers.delete(timer)
    }, 5000)
    toastTimers.add(timer)
  }

  function clearReconnect() {
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function closeSocket() {
    if (!socket) return
    const current = socket
    socket = null
    current.onopen = null
    current.onmessage = null
    current.onerror = null
    current.onclose = null
    current.close()
  }

  function scheduleReconnect() {
    if (!isAdminRole(desiredRole) || !getToken() || reconnectTimer) return

    if (!navigator.onLine) {
      connectionState.value = 'disconnected'
      return
    }

    const delay = Math.min(1000 * (2 ** reconnectAttempt.value), 30000)
    reconnectAttempt.value += 1
    connectionState.value = 'reconnecting'
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      openSocket()
    }, delay)
  }

  function openSocket() {
    if (!isAdminRole(desiredRole) || !getToken() || typeof WebSocket === 'undefined') return
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return

    closeSocket()
    connectionState.value = reconnectAttempt.value ? 'reconnecting' : 'connecting'
    const current = new WebSocket(
      getAlertWebSocketUrl(),
      ['access_token', getToken()]
    )

    socket = current
    current.onopen = () => {
      if (socket !== current) return
      connectionState.value = 'connected'
      reconnectAttempt.value = 0
    }
    current.onmessage = (event) => {
      if (socket !== current) return
      let payload
      try {
        payload = JSON.parse(event.data)
      } catch {
        payload = { title: String(event.data || '新告警') }
      }
      pushToast(payload)
      window.dispatchEvent(new CustomEvent('wifi:alert-received', { detail: payload }))
    }
    current.onerror = () => {
      if (socket === current) current.close()
    }
    current.onclose = () => {
      if (socket !== current) return
      socket = null
      connectionState.value = 'disconnected'
      scheduleReconnect()
    }
  }

  function connect(role) {
    desiredRole = role
    if (!isAdminRole(role)) {
      disconnect()
      return
    }
    clearReconnect()
    openSocket()
  }

  function retry() {
    if (!isAdminRole(desiredRole)) return
    clearReconnect()
    closeSocket()
    reconnectAttempt.value = 0
    openSocket()
  }

  function disconnect() {
    desiredRole = null
    clearReconnect()
    closeSocket()
    reconnectAttempt.value = 0
    connectionState.value = 'idle'
  }

  function handleOnline() {
    if (isAdminRole(desiredRole)) retry()
  }

  function handleOffline() {
    if (!isAdminRole(desiredRole)) return
    clearReconnect()
    closeSocket()
    connectionState.value = 'disconnected'
  }

  function handleVisibilityChange() {
    if (
      document.visibilityState === 'visible'
      && isAdminRole(desiredRole)
      && connectionState.value !== 'connected'
      && connectionState.value !== 'connecting'
    ) {
      retry()
    }
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  onBeforeUnmount(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    disconnect()
    toastTimers.forEach((timer) => window.clearTimeout(timer))
    toastTimers.clear()
  })

  return {
    toasts,
    connectionState,
    reconnectAttempt,
    connect,
    disconnect,
    retry,
    removeToast
  }
}
