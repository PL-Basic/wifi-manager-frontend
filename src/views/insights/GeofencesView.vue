<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Eye, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import GeofenceFormModal from '@/components/insights/GeofenceFormModal.vue'
import SpatialCanvas from '@/components/insights/SpatialCanvas.vue'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import {
  createGeofence,
  deleteGeofence,
  getGeofence,
  getGeofenceEvents,
  getGeofences,
  toggleGeofence,
  updateGeofence
} from '@/api/insights'
import { resolveGeofenceEvent } from '@/config/insightsStatus'
import { geofenceLayer } from '@/utils/geoLayers'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import { useRequestGate } from '@/composables/useRequestGate'
import './insights.css'

const route = useRoute()
const router = useRouter()
const requestGate = useRequestGate()
const MODES = [{ key: 'fences', label: '围栏' }, { key: 'events', label: '进入 / 离开事件' }]

const fenceFilters = reactive({ keyword: '', enabled: '' })
const appliedFenceFilters = reactive({ ...fenceFilters })
const eventFilters = reactive({
  fenceId: '', userId: '', sessionId: '', mac: '', eventType: '', startTime: '', endTime: ''
})
const appliedEventFilters = reactive({ ...eventFilters })

const fenceState = reactive({ loading: false, loaded: false, error: '', rows: [] })
const eventState = reactive({ loading: false, loaded: false, error: '', rows: [] })
const fencePager = reactive({ current: 1, size: 10, total: 0 })
const eventPager = reactive({ current: 1, size: 10, total: 0 })
const pageSuccess = ref('')
const actionError = ref('')
const mutatingIds = ref(new Set())
const inspectingId = ref(null)

const modalOpen = ref(false)
const modalFence = ref(null)
const modalLoading = ref(false)
const modalError = ref('')
const modalSuccess = ref('')

const activeMode = computed(() => route.query.view === 'events' ? 'events' : 'fences')
const fenceTotalPages = computed(() => Math.max(1, Math.ceil(fencePager.total / fencePager.size)))
const eventTotalPages = computed(() => Math.max(1, Math.ceil(eventPager.total / eventPager.size)))
const fenceMapLayer = computed(() => geofenceLayer(fenceState.rows))

function readData(response, fallback) {
  const body = response?.data
  if (body?.code !== 200) throw new Error(body?.message || fallback)
  return body.data || {}
}

function setMode(mode) {
  if (mode !== activeMode.value) router.replace({ query: { ...route.query, view: mode } })
}

function idValue(value) {
  return String(value ?? '').trim()
}

function optionalIdValue(value) {
  const normalized = idValue(value)
  return normalized || undefined
}

async function loadFences(page = fencePager.current) {
  const version = requestGate.begin('fences')
  fenceState.loading = true
  fenceState.error = ''
  try {
    const data = readData(await getGeofences({
      current: page,
      size: fencePager.size,
      enabled: appliedFenceFilters.enabled === '' ? undefined : Number(appliedFenceFilters.enabled),
      keyword: appliedFenceFilters.keyword.trim() || undefined
    }), '围栏列表加载失败')
    if (!requestGate.isCurrent(version, 'fences')) return
    fenceState.rows = Array.isArray(data.records) ? data.records : []
    fencePager.current = Number(data.current) || page
    fencePager.size = Number(data.size) || fencePager.size
    fencePager.total = Number(data.total) || 0
    fenceState.loaded = true
  } catch (error) {
    if (!requestGate.isCurrent(version, 'fences')) return
    fenceState.error = error instanceof Error && !error.response ? error.message : getApiErrorMessage(error, '围栏列表加载失败')
    fenceState.loaded = true
  } finally {
    if (requestGate.isCurrent(version, 'fences')) fenceState.loading = false
  }
}

function validateEventFilters() {
  for (const [key, label] of [['fenceId', '围栏 ID'], ['userId', '用户 ID'], ['sessionId', 'Session ID']]) {
    if (idValue(eventFilters[key]) && !/^[1-9]\d*$/.test(idValue(eventFilters[key]))) return `${label} 必须是大于 0 的整数`
  }
  if (eventFilters.mac.trim() && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(eventFilters.mac.trim())) return 'MAC 地址格式无效'
  if ((eventFilters.startTime && !eventFilters.endTime) || (!eventFilters.startTime && eventFilters.endTime)) return '事件时间范围必须同时填写开始和结束时间'
  if (eventFilters.startTime && new Date(eventFilters.endTime) <= new Date(eventFilters.startTime)) return '结束时间必须晚于开始时间'
  return ''
}

async function loadEvents(page = eventPager.current) {
  const version = requestGate.begin('events')
  eventState.loading = true
  eventState.error = ''
  try {
    const data = readData(await getGeofenceEvents({
      current: page,
      size: eventPager.size,
      fenceId: optionalIdValue(appliedEventFilters.fenceId),
      userId: optionalIdValue(appliedEventFilters.userId),
      sessionId: optionalIdValue(appliedEventFilters.sessionId),
      mac: appliedEventFilters.mac.trim().toUpperCase() || undefined,
      eventType: appliedEventFilters.eventType || undefined,
      startTime: appliedEventFilters.startTime || undefined,
      endTime: appliedEventFilters.endTime || undefined
    }), '围栏事件加载失败')
    if (!requestGate.isCurrent(version, 'events')) return
    eventState.rows = Array.isArray(data.records) ? data.records : []
    eventPager.current = Number(data.current) || page
    eventPager.size = Number(data.size) || eventPager.size
    eventPager.total = Number(data.total) || 0
    eventState.loaded = true
  } catch (error) {
    if (!requestGate.isCurrent(version, 'events')) return
    eventState.error = error instanceof Error && !error.response ? error.message : getApiErrorMessage(error, '围栏事件加载失败')
    eventState.loaded = true
  } finally {
    if (requestGate.isCurrent(version, 'events')) eventState.loading = false
  }
}

function searchFences() {
  pageSuccess.value = ''
  actionError.value = ''
  Object.assign(appliedFenceFilters, fenceFilters)
  loadFences(1)
}

function searchEvents() {
  const error = validateEventFilters()
  if (error) {
    requestGate.invalidate('events')
    eventState.loading = false
    eventState.error = error
    return
  }
  Object.assign(appliedEventFilters, eventFilters)
  loadEvents(1)
}

function resetFenceFilters() {
  Object.assign(fenceFilters, { keyword: '', enabled: '' })
  searchFences()
}

function resetEventFilters() {
  Object.assign(eventFilters, { fenceId: '', userId: '', sessionId: '', mac: '', eventType: '', startTime: '', endTime: '' })
  searchEvents()
}

function openCreate() {
  modalFence.value = null
  modalError.value = ''
  modalSuccess.value = ''
  modalOpen.value = true
}

async function openEdit(fenceId) {
  if (inspectingId.value) return
  inspectingId.value = fenceId
  actionError.value = ''
  try {
    modalFence.value = readData(await getGeofence(fenceId), '围栏详情加载失败')
    modalError.value = ''
    modalSuccess.value = ''
    modalOpen.value = true
  } catch (error) {
    actionError.value = error instanceof Error && !error.response ? error.message : getApiErrorMessage(error, '围栏详情加载失败')
  } finally {
    inspectingId.value = null
  }
}

function closeModal() {
  if (modalLoading.value) return
  modalOpen.value = false
  modalFence.value = null
  modalError.value = ''
  modalSuccess.value = ''
}

async function saveFence(payload) {
  modalLoading.value = true
  modalError.value = ''
  modalSuccess.value = ''
  try {
    const editing = Boolean(modalFence.value?.fenceId)
    const updatePayload = { ...payload }
    delete updatePayload.enabled
    const response = editing
      ? await updateGeofence(modalFence.value.fenceId, updatePayload)
      : await createGeofence(payload)
    const data = readData(response, editing ? '围栏更新失败' : '围栏创建失败')
    modalFence.value = data
    modalSuccess.value = editing ? '围栏更新成功' : '围栏创建成功'
    pageSuccess.value = modalSuccess.value
    await loadFences(editing ? fencePager.current : 1)
  } catch (error) {
    modalError.value = error instanceof Error && !error.response ? error.message : getApiErrorMessage(error, '围栏保存失败')
  } finally {
    modalLoading.value = false
  }
}

function setMutating(fenceId, active) {
  const next = new Set(mutatingIds.value)
  if (active) next.add(fenceId)
  else next.delete(fenceId)
  mutatingIds.value = next
}

async function changeEnabled(fence) {
  if (mutatingIds.value.has(fence.fenceId)) return
  setMutating(fence.fenceId, true)
  actionError.value = ''
  pageSuccess.value = ''
  const enabled = fence.enabled === 1 ? 0 : 1
  try {
    const data = readData(await toggleGeofence(fence.fenceId, enabled), '围栏状态更新失败')
    const index = fenceState.rows.findIndex((item) => item.fenceId === fence.fenceId)
    if (index >= 0) fenceState.rows[index] = data
    pageSuccess.value = enabled === 1 ? '围栏已启用' : '围栏已停用'
  } catch (error) {
    actionError.value = error instanceof Error && !error.response ? error.message : getApiErrorMessage(error, '围栏状态更新失败')
  } finally {
    setMutating(fence.fenceId, false)
  }
}

async function removeFence(fence) {
  if (mutatingIds.value.has(fence.fenceId)) return
  if (!await confirmAction({
    title: '确认删除围栏',
    message: `围栏“${fence.name}”删除后不能恢复，已有围栏事件不会自动删除。`,
    confirmLabel: '删除围栏',
    tone: 'danger'
  })) return
  setMutating(fence.fenceId, true)
  actionError.value = ''
  pageSuccess.value = ''
  try {
    readData(await deleteGeofence(fence.fenceId), '围栏删除失败')
    pageSuccess.value = '围栏已删除'
    const targetPage = fenceState.rows.length === 1 && fencePager.current > 1 ? fencePager.current - 1 : fencePager.current
    await loadFences(targetPage)
  } catch (error) {
    actionError.value = error instanceof Error && !error.response ? error.message : getApiErrorMessage(error, '围栏删除失败')
  } finally {
    setMutating(fence.fenceId, false)
  }
}

function openFenceEvents(fence) {
  eventFilters.fenceId = String(fence.fenceId)
  Object.assign(appliedEventFilters, eventFilters)
  router.replace({ query: { ...route.query, view: 'events' } }).then(() => loadEvents(1))
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

watch(
  () => route.query.view,
  (view) => {
    if (view !== 'fences' && view !== 'events') router.replace({ query: { ...route.query, view: 'fences' } })
    if (view === 'events' && !eventState.loaded && !eventState.loading) loadEvents(1)
  },
  { immediate: true }
)

onMounted(() => loadFences(1))
</script>

<template>
  <section class="workspace-view insights-page">
    <header class="dashboard-header">
      <div><p class="page-kicker">洞察工作区</p><h2>地理围栏</h2></div>
      <button v-if="activeMode === 'fences'" type="button" @click="openCreate"><Plus :size="16" aria-hidden="true" />创建围栏</button>
      <button v-else class="secondary-button" type="button" :disabled="eventState.loading" @click="loadEvents()"><RefreshCw :size="16" aria-hidden="true" />刷新事件</button>
    </header>

    <nav class="insights-segments" aria-label="围栏视图">
      <button v-for="mode in MODES" :key="mode.key" type="button" :class="{ active: activeMode === mode.key }" @click="setMode(mode.key)">{{ mode.label }}</button>
    </nav>

    <template v-if="activeMode === 'fences'">
      <form class="glass-toolbar geofence-filter-grid" @submit.prevent="searchFences">
        <label><span>关键词</span><input v-model="fenceFilters.keyword" maxlength="64" placeholder="名称或描述" /></label>
        <label><span>启停状态</span><select v-model="fenceFilters.enabled"><option value="">全部</option><option value="1">启用</option><option value="0">停用</option></select></label>
        <div class="insights-filter-actions"><button type="submit" :disabled="fenceState.loading"><Search :size="16" aria-hidden="true" />查询</button><button class="secondary-button" type="button" :disabled="fenceState.loading" @click="resetFenceFilters">重置</button></div>
      </form>

      <p v-if="pageSuccess" class="alert success">{{ pageSuccess }}</p>
      <p v-if="actionError || fenceState.error" class="alert error">{{ actionError || fenceState.error }}</p>
      <StateBlock v-if="fenceState.loading && !fenceState.loaded" type="loading" title="正在加载围栏" />
      <StateBlock v-else-if="fenceState.loaded && !fenceState.rows.length && !fenceState.error" title="暂无围栏" text="可以创建第一个圆形地理围栏" />

      <template v-if="fenceState.rows.length">
        <SpatialCanvas :layer="fenceMapLayer" title="当前页围栏中心" />
        <section class="glass-panel insights-result-table geofence-table">
          <table><thead><tr><th>ID</th><th>名称</th><th>中心坐标</th><th>半径</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
            <tr v-for="fence in fenceState.rows" :key="fence.fenceId">
              <td>{{ fence.fenceId }}</td><td><strong>{{ fence.name }}</strong><small>{{ fence.description || '无描述' }}</small></td>
              <td>{{ fence.centerLatitude }}, {{ fence.centerLongitude }}</td><td>{{ fence.radiusMeters }} m</td>
              <td><span :class="['status-pill', fence.enabled === 1 ? 'success' : 'neutral']">{{ fence.enabled === 1 ? '启用' : '停用' }}</span></td>
              <td>{{ formatTime(fence.updateTime) }}</td>
              <td><div class="action-cell">
                <button class="compact-button secondary-button" type="button" :disabled="mutatingIds.has(fence.fenceId)" @click="changeEnabled(fence)">{{ fence.enabled === 1 ? '停用' : '启用' }}</button>
                <button class="icon-button" type="button" title="编辑围栏" :disabled="inspectingId === fence.fenceId || mutatingIds.has(fence.fenceId)" @click="openEdit(fence.fenceId)"><Pencil :size="16" aria-hidden="true" /></button>
                <button class="icon-button" type="button" title="查看围栏事件" @click="openFenceEvents(fence)"><Eye :size="16" aria-hidden="true" /></button>
                <button class="icon-button danger-icon" type="button" title="删除围栏" :disabled="mutatingIds.has(fence.fenceId)" @click="removeFence(fence)"><Trash2 :size="16" aria-hidden="true" /></button>
              </div></td>
            </tr>
          </tbody></table>
        </section>
        <AppPagination :current="fencePager.current" :size="fencePager.size" :total="fencePager.total" :busy="fenceState.loading" @change="loadFences" />
      </template>
    </template>

    <template v-else>
      <form class="glass-toolbar geofence-event-filter-grid" @submit.prevent="searchEvents">
        <label><span>围栏 ID</span><input v-model="eventFilters.fenceId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>用户 ID</span><input v-model="eventFilters.userId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>Session ID</span><input v-model="eventFilters.sessionId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>MAC</span><input v-model="eventFilters.mac" maxlength="17" /></label>
        <label><span>事件类型</span><select v-model="eventFilters.eventType"><option value="">全部</option><option value="ENTER">进入</option><option value="EXIT">离开</option></select></label>
        <label><span>开始时间</span><input v-model="eventFilters.startTime" type="datetime-local" /></label>
        <label><span>结束时间</span><input v-model="eventFilters.endTime" type="datetime-local" /></label>
        <div class="insights-filter-actions"><button type="submit" :disabled="eventState.loading"><Search :size="16" aria-hidden="true" />查询</button><button class="secondary-button" type="button" :disabled="eventState.loading" @click="resetEventFilters">重置</button></div>
      </form>
      <p v-if="eventState.error" class="alert error">{{ eventState.error }}</p>
      <StateBlock v-if="eventState.loading && !eventState.loaded" type="loading" title="正在加载围栏事件" />
      <StateBlock v-else-if="eventState.loaded && !eventState.rows.length && !eventState.error" title="暂无围栏事件" />
      <section v-if="eventState.rows.length" class="glass-panel insights-result-table geofence-event-table">
        <table><thead><tr><th>事件</th><th>围栏</th><th>用户 / Session</th><th>设备 / MAC</th><th>事件坐标</th><th>时间</th></tr></thead><tbody>
          <tr v-for="event in eventState.rows" :key="event.eventId">
            <td><span :class="['status-pill', resolveGeofenceEvent(event.eventType).tone]">{{ resolveGeofenceEvent(event.eventType).label }}</span></td>
            <td>{{ event.fenceName || '-' }}（{{ event.fenceId }}）</td><td>{{ event.userId ?? '-' }} / {{ event.sessionId ?? '-' }}</td>
            <td>{{ event.deviceCode || event.nodeId || '-' }} / {{ event.mac || '-' }}</td><td>{{ event.latitude }}, {{ event.longitude }}</td><td>{{ formatTime(event.eventTime) }}</td>
          </tr>
        </tbody></table>
      </section>
      <AppPagination v-if="eventState.rows.length" :current="eventPager.current" :size="eventPager.size" :total="eventPager.total" :busy="eventState.loading" @change="loadEvents" />
    </template>

    <GeofenceFormModal :open="modalOpen" :fence="modalFence" :loading="modalLoading" :error="modalError" :success="modalSuccess" @close="closeModal" @save="saveFence" />
  </section>
</template>
