<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { LocateFixed, RefreshCw, ShieldCheck, X } from 'lucide-vue-next'
import LocationMap from '@/components/LocationMap.vue'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import {
  clearLocationHistory,
  getLocationConsent,
  getMyLocations,
  grantLocationConsent,
  reportMyLocation,
  revokeLocationConsent
} from '@/api/location'
import { getMySessions } from '@/api/sessions'
import { getApiErrorMessage } from '@/utils/apiError'

const locations = ref([])
const mapLocations = ref([])
const locationLoading = ref(false)
const locationError = ref('')
const total = ref(0)
const current = ref(1)
const pageSize = ref(10)

const consent = ref({
  enabled: 0,
  consentTime: '',
  revokedTime: '',
  lastReportTime: ''
})
const consentLoading = ref(false)
const consentError = ref('')
const consentAction = ref('')

const sessions = ref([])
const sessionsLoading = ref(false)
const sessionsError = ref('')
const selectedSessionId = ref('')

const browserPermission = ref('unknown')
const locating = ref(false)
const reporting = ref(false)
const lastFix = ref(null)
let permissionStatus = null

const message = ref('')
const messageType = ref('success')
const clearDialogOpen = ref(false)
const clearingHistory = ref(false)
const clearMessage = ref('')

const consentEnabled = computed(() => Number(consent.value.enabled ?? 0) === 1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const selectedSession = computed(() => sessions.value.find(
  (item) => String(item.sessionId) === String(selectedSessionId.value)
) || null)
const secureContext = computed(() => window.isSecureContext)
const browserLocationAvailable = computed(() => (
  secureContext.value && 'geolocation' in navigator
))
const busy = computed(() => (
  locationLoading.value
  || consentLoading.value
  || sessionsLoading.value
  || Boolean(consentAction.value)
  || locating.value
  || reporting.value
  || clearingHistory.value
))

const positioningStatus = computed(() => {
  if (!secureContext.value) return '当前页面不是 HTTPS，手机浏览器会禁止读取 GPS'
  if (!('geolocation' in navigator)) return '当前浏览器不支持定位'
  if (browserPermission.value === 'denied') return '浏览器定位权限已被拒绝'
  if (!consentEnabled.value) return '需要先开启位置共享授权'
  if (sessionsLoading.value) return '正在读取可用 Session'
  if (sessionsError.value) return sessionsError.value
  if (!sessions.value.length) return '没有可用于上报的 ACTIVE Session'
  return '可以获取手机当前位置并上报'
})

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}

function normalizeConsent(value = {}) {
  return {
    enabled: Number(value.enabled ?? 0),
    consentTime: value.consentTime || '',
    revokedTime: value.revokedTime || '',
    lastReportTime: value.lastReportTime || ''
  }
}

function showMessage(text, type = 'error') {
  message.value = text
  messageType.value = type
}

function unwrap(response, fallback) {
  if (response.data?.code !== 200) {
    throw new Error(response.data?.message || fallback)
  }
  return response.data.data
}

async function loadConsent() {
  if (consentLoading.value) return
  consentLoading.value = true
  consentError.value = ''

  try {
    consent.value = normalizeConsent(unwrap(
      await getLocationConsent(),
      '定位授权状态加载失败'
    ))
  } catch (error) {
    consentError.value = getApiErrorMessage(error, '定位授权状态加载失败')
  } finally {
    consentLoading.value = false
  }
}

async function loadSessions() {
  if (sessionsLoading.value) return
  sessionsLoading.value = true
  sessionsError.value = ''

  try {
    const data = unwrap(await getMySessions({
      current: 1,
      size: 100,
      status: 1
    }), '在线 Session 加载失败') || {}

    sessions.value = Array.isArray(data.records) ? data.records : []
    if (!sessions.value.some((item) => (
      String(item.sessionId) === String(selectedSessionId.value)
    ))) {
      selectedSessionId.value = sessions.value[0]?.sessionId || ''
    }
  } catch (error) {
    sessions.value = []
    selectedSessionId.value = ''
    sessionsError.value = getApiErrorMessage(error, '在线 Session 加载失败')
  } finally {
    sessionsLoading.value = false
  }
}

async function loadLocations(targetPage = current.value) {
  if (locationLoading.value) return
  locationLoading.value = true
  locationError.value = ''

  try {
    const [tableResponse, mapResponse] = await Promise.all([
      getMyLocations({ current: targetPage, size: pageSize.value }),
      getMyLocations({ current: 1, size: 100 })
    ])
    const page = unwrap(tableResponse, '定位记录加载失败') || {}
    const mapPage = unwrap(mapResponse, '地图轨迹加载失败') || {}

    locations.value = Array.isArray(page.records) ? page.records : []
    mapLocations.value = Array.isArray(mapPage.records) ? mapPage.records : []
    total.value = Number(page.total ?? 0)
    current.value = Number(page.current ?? targetPage)
    pageSize.value = Number(page.size ?? pageSize.value)
  } catch (error) {
    locationError.value = getApiErrorMessage(error, '定位记录加载失败')
  } finally {
    locationLoading.value = false
  }
}

async function refreshPage() {
  if (busy.value) return
  message.value = ''
  await Promise.all([loadConsent(), loadSessions(), loadLocations(current.value)])
}

async function updateConsent(nextEnabled) {
  if (busy.value || consentError.value) return
  consentAction.value = nextEnabled ? 'grant' : 'revoke'
  message.value = ''

  try {
    const response = nextEnabled
      ? await grantLocationConsent()
      : await revokeLocationConsent()
    consent.value = normalizeConsent(unwrap(
      response,
      nextEnabled ? '定位授权开启失败' : '定位授权撤销失败'
    ))
    showMessage(
      response.data?.message || (nextEnabled ? '位置共享已开启' : '位置共享已撤销'),
      'success'
    )
  } catch (error) {
    showMessage(getApiErrorMessage(
      error,
      nextEnabled ? '定位授权开启失败' : '定位授权撤销失败'
    ))
  } finally {
    consentAction.value = ''
  }
}

function geolocationErrorMessage(error) {
  if (error?.code === 1) return '浏览器定位权限被拒绝，请在站点设置中允许位置权限后重试'
  if (error?.code === 2) return '手机暂时无法确定位置，请开启系统定位并检查 GPS 或网络'
  if (error?.code === 3) return '获取手机位置超时，请移动到信号较好的位置后重试'
  return error?.message || '手机定位失败'
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000
    })
  })
}

async function locateAndReport() {
  if (busy.value) return
  message.value = ''

  if (!secureContext.value) {
    showMessage(`手机浏览器只允许 HTTPS 页面读取定位。当前地址 ${window.location.origin} 不是安全上下文。`)
    return
  }
  if (!browserLocationAvailable.value) {
    showMessage('当前浏览器不支持 GPS 定位')
    return
  }
  if (!consentEnabled.value) {
    showMessage('请先开启位置共享授权，再上报当前位置')
    return
  }
  if (!selectedSession.value) {
    showMessage('没有可用的 ACTIVE Session。请先通过 Portal 连接设备网络，再刷新 Session。')
    return
  }

  locating.value = true
  try {
    const position = await getBrowserPosition()
    const fix = {
      latitude: Number(position.coords.latitude),
      longitude: Number(position.coords.longitude),
      accuracy: Number(position.coords.accuracy),
      capturedAt: new Date(position.timestamp || Date.now()).toISOString()
    }
    lastFix.value = fix

    if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 1000) {
      showMessage(`当前定位精度为 ${Math.round(fix.accuracy || 0)} 米，超过后端允许的 1000 米，请稍后重试`)
      return
    }

    reporting.value = true
    const source = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
      ? 'mobile'
      : 'browser'
    const response = await reportMyLocation(selectedSession.value.sessionId, {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      source
    })
    unwrap(response, '位置上报失败')
    showMessage(response.data?.message || '当前位置已上报', 'success')
    current.value = 1
    await Promise.all([loadConsent(), loadSessions(), loadLocations(1)])
  } catch (error) {
    const text = error?.code && !error.response
      ? geolocationErrorMessage(error)
      : getApiErrorMessage(error, '位置上报失败')
    showMessage(text)
  } finally {
    locating.value = false
    reporting.value = false
  }
}

function changePage(page) {
  if (busy.value || page < 1 || page > totalPages.value || page === current.value) return
  loadLocations(page)
}

function openClearDialog() {
  if (busy.value) return
  clearMessage.value = ''
  clearDialogOpen.value = true
}

function closeClearDialog() {
  if (clearingHistory.value) return
  clearMessage.value = ''
  clearDialogOpen.value = false
}

async function confirmClearHistory() {
  if (clearingHistory.value) return
  clearingHistory.value = true
  clearMessage.value = ''

  try {
    const response = await clearLocationHistory()
    const removedCount = Number(unwrap(response, '定位历史清除失败') ?? 0)
    locations.value = []
    mapLocations.value = []
    total.value = 0
    current.value = 1
    clearDialogOpen.value = false
    showMessage(response.data?.message || `已清除 ${removedCount} 条定位记录`, 'success')
  } catch (error) {
    clearMessage.value = getApiErrorMessage(error, '定位历史清除失败')
  } finally {
    clearingHistory.value = false
  }
}

async function readBrowserPermission() {
  if (!navigator.permissions?.query) return
  try {
    permissionStatus = await navigator.permissions.query({ name: 'geolocation' })
    browserPermission.value = permissionStatus.state
    permissionStatus.onchange = () => {
      browserPermission.value = permissionStatus.state
    }
  } catch {
    browserPermission.value = 'unknown'
  }
}

onMounted(() => {
  readBrowserPermission()
  refreshPage()
})

onBeforeUnmount(() => {
  if (permissionStatus) permissionStatus.onchange = null
})
</script>

<template>
  <section class="workspace-view location-workspace">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">个人定位</p>
        <h2>我的位置与轨迹</h2>
      </div>
      <button class="secondary-button" type="button" :disabled="busy" @click="refreshPage">
        <RefreshCw :size="16" />{{ locationLoading || consentLoading ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <p v-if="message" :class="['alert', messageType]" aria-live="polite">{{ message }}</p>

    <section class="role-action-grid location-summary-grid">
      <article class="role-action-card glass-panel">
        <span>位置共享授权</span>
        <strong>{{ consentLoading ? '读取中' : consentError ? '状态不可用' : consentEnabled ? '已开启' : '已关闭' }}</strong>
        <p v-if="consentError" class="alert error">{{ consentError }}</p>
        <template v-else>
          <p>{{ consentEnabled ? `授权时间：${formatTime(consent.consentTime)}` : `撤销时间：${formatTime(consent.revokedTime)}` }}</p>
          <button type="button" :class="['compact-button', consentEnabled ? 'danger-button' : '']" :disabled="busy" @click="updateConsent(!consentEnabled)">
            {{ consentAction ? '处理中...' : consentEnabled ? '撤销定位授权' : '开启定位授权' }}
          </button>
        </template>
      </article>

      <article class="role-action-card glass-panel">
        <span>位置历史</span>
        <strong>{{ total }} 条记录</strong>
        <p>最近上报：{{ formatTime(consent.lastReportTime) }}</p>
        <button type="button" class="danger-button compact-button" :disabled="busy || total === 0" @click="openClearDialog">清空定位历史</button>
      </article>
    </section>

    <section class="location-report-panel glass-panel">
      <div class="location-report-copy">
        <div class="location-report-title">
          <LocateFixed :size="22" />
          <div><span>手机 GPS</span><strong>获取并上报当前位置</strong></div>
        </div>
        <p>{{ positioningStatus }}</p>
        <p v-if="!secureContext" class="location-diagnostic">正式使用必须通过 HTTPS 打开本站；局域网 IP 的 HTTP 页面无法调用手机定位。</p>
        <p v-else-if="browserPermission === 'denied'" class="location-diagnostic">请打开浏览器的站点权限，将“位置信息”改为允许。</p>
        <p v-if="lastFix" class="location-last-fix">本次 GPS：{{ lastFix.latitude.toFixed(6) }}, {{ lastFix.longitude.toFixed(6) }} · 精度 {{ Math.round(lastFix.accuracy) }} 米</p>
      </div>

      <div class="location-report-actions">
        <label>
          <span>用于上报的在线 Session</span>
          <select v-model="selectedSessionId" :disabled="busy || !sessions.length">
            <option value="">{{ sessionsLoading ? '正在读取...' : sessions.length ? '请选择 Session' : '没有 ACTIVE Session' }}</option>
            <option v-for="item in sessions" :key="item.sessionId" :value="item.sessionId">
              #{{ item.sessionId }} · {{ item.mac }} · 节点 {{ item.nodeId }}
            </option>
          </select>
        </label>
        <p v-if="selectedSession" class="location-session-meta">到期 {{ formatTime(selectedSession.expireTime) }} · IP {{ selectedSession.ip || '-' }}</p>
        <button type="button" :disabled="busy || !browserLocationAvailable || !consentEnabled || !selectedSession" @click="locateAndReport">
          <ShieldCheck :size="16" />{{ locating ? '正在获取 GPS...' : reporting ? '正在上报...' : '定位并上报' }}
        </button>
      </div>
    </section>

    <p v-if="locationError" class="alert error">{{ locationError }}</p>

    <LocationMap class="location-panel" :locations="mapLocations" title="我的真实 GPS 轨迹" />

    <section class="table-panel glass-panel">
      <div class="table-summary"><strong>{{ total }}</strong><span>条我的定位记录</span></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Session</th><th>MAC</th><th>节点</th><th>纬度</th><th>经度</th><th>精度</th><th>来源</th><th>上报时间</th></tr></thead>
          <tbody>
            <tr v-if="locationLoading"><td colspan="8"><StateBlock type="loading" title="正在加载" text="正在同步你的定位记录" /></td></tr>
            <tr v-else-if="locations.length === 0"><td colspan="8"><StateBlock title="暂无定位" text="选择 ACTIVE Session 并点击“定位并上报”后会生成真实记录" /></td></tr>
            <template v-else>
              <tr v-for="item in locations" :key="item.id">
                <td>{{ item.sessionId || '-' }}</td><td>{{ item.mac || '-' }}</td><td>{{ item.nodeId || '-' }}</td>
                <td>{{ item.latitude }}</td><td>{{ item.longitude }}</td><td>{{ item.accuracy ?? '-' }} m</td>
                <td>{{ item.source || '-' }}</td><td>{{ formatTime(item.reportTime) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <AppPagination :current="current" :size="pageSize" :total="total" :busy="locationLoading" @change="changePage" />
    </section>

    <div v-if="clearDialogOpen" class="modal-backdrop" @click.self="closeClearDialog">
      <section class="modal-panel glass-panel" role="dialog" aria-modal="true" aria-labelledby="clear-location-title">
        <header class="modal-header">
          <h3 id="clear-location-title">确认清空定位历史</h3>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" :disabled="clearingHistory" @click="closeClearDialog"><X :size="20" /></button>
        </header>
        <p>当前账号的定位历史将被永久删除。定位授权状态不会因此改变。</p>
        <p v-if="clearMessage" class="alert error modal-alert" aria-live="polite">{{ clearMessage }}</p>
        <div class="action-cell">
          <button type="button" class="secondary-button" :disabled="clearingHistory" @click="closeClearDialog">取消</button>
          <button type="button" class="danger-button" :disabled="clearingHistory" @click="confirmClearHistory">{{ clearingHistory ? '清除中...' : '确认清空' }}</button>
        </div>
      </section>
    </div>
  </section>
</template>
