import { onBeforeUnmount, onMounted, reactive, readonly } from 'vue'
import { probeApiConnectivity } from '@/api/http'
import {
  API_CONNECTIVITY_EVENT,
  getApiConnectivitySnapshot,
  reportApiConnectivity
} from '@/utils/connectivity'

export function useApiConnectivity() {
  const state = reactive(getApiConnectivitySnapshot())
  let probing = false

  function handleConnectivity(event) {
    state.status = event.detail?.status || 'unknown'
    state.message = event.detail?.message || ''
    state.occurredAt = Number(event.detail?.occurredAt) || Date.now()
  }

  async function probe() {
    if (probing || document.visibilityState === 'hidden') return

    if (!navigator.onLine) {
      reportApiConnectivity({
        status: 'unreachable',
        message: '当前设备处于离线状态，请检查手机 WiFi 或移动网络'
      })
      return
    }

    probing = true
    try {
      await probeApiConnectivity()
    } finally {
      probing = false
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') probe()
  }

  function handleOffline() {
    reportApiConnectivity({
      status: 'unreachable',
      message: '当前设备处于离线状态，请检查手机 WiFi 或移动网络'
    })
  }

  // AppShell setup 早于子页面 mounted，在这里立即监听，避免漏掉首屏请求状态。
  if (typeof window !== 'undefined') {
    window.addEventListener(API_CONNECTIVITY_EVENT, handleConnectivity)
    window.addEventListener('online', probe)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', probe)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  onMounted(probe)

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(API_CONNECTIVITY_EVENT, handleConnectivity)
      window.removeEventListener('online', probe)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', probe)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  })

  return {
    state: readonly(state),
    probe
  }
}
