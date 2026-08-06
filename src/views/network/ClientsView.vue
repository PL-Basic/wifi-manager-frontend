<script setup>
import { onMounted, reactive, ref } from 'vue'
import { RefreshCw, Search } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import AppFilterBar from '@/components/app/AppFilterBar.vue'
import AppTableFrame from '@/components/app/AppTableFrame.vue'
import { getClientSignals } from '@/api/devices'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'

const route = useRoute()
const loading = ref(false)
const hasLoaded = ref(false)
const pageError = ref('')
const rows = ref([])
const pager = reactive({ current: 1, size: 10, total: 0 })

const filters = reactive({
  deviceCode: String(route.query.deviceCode || ''),
  nodeId: String(route.query.nodeId || ''),
  mac: '',
  sessionId: '',
  state: '',
  startTime: '',
  endTime: ''
})
const appliedFilters = reactive({ ...filters })

const filterFields = [
  { key: 'deviceCode', label: '设备编码', type: 'text', placeholder: 'ESP32-001' },
  { key: 'nodeId', label: '设备编号', type: 'number', placeholder: '设备编号' },
  { key: 'mac', label: '联网设备 MAC', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF' },
  { key: 'sessionId', label: '连接编号', type: 'number', placeholder: '连接编号' },
  { key: 'state', label: '连接状态', type: 'text', placeholder: '例如：已连接' },
  { key: 'startTime', label: '开始时间', type: 'datetime-local' },
  { key: 'endTime', label: '结束时间', type: 'datetime-local' }
]

const columns = [
  ['id', 'ID'],
  ['nodeId', '设备编号'],
  ['deviceCode', '设备编码'],
  ['mac', '联网设备 MAC'],
  ['sessionId', '连接编号'],
  ['rssi', '信号强度'],
  ['state', '连接状态'],
  ['reportTime', '上报时间']
]

const requestGate = useRequestGate()

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return '-'
  if (key === 'reportTime') return String(value).replace('T', ' ')
  return value
}

function signalInfo(value) {
  const rssi = Number(value)
  if (!Number.isFinite(rssi)) return { label: '-', tone: 'neutral' }
  if (rssi >= -50) return { label: `${rssi} dBm · 优`, tone: 'success' }
  if (rssi >= -65) return { label: `${rssi} dBm · 良`, tone: 'info' }
  if (rssi >= -75) return { label: `${rssi} dBm · 一般`, tone: 'warning' }
  return { label: `${rssi} dBm · 弱`, tone: 'danger' }
}

function requestParams(page) {
  const params = { current: page, size: pager.size }

  Object.entries(appliedFilters).forEach(([key, value]) => {
    let normalized = String(value ?? '').trim()
    if (!normalized) return
    if (key === 'mac' || key === 'state') normalized = normalized.toUpperCase()
    params[key] = normalized
  })

  return params
}

function readPage(response) {
  const body = response?.data
  if (body?.code !== 200) {
    throw new Error(body?.message || '连接信号加载失败')
  }
  return body.data || {}
}

async function loadSignals(page = pager.current) {
  // 每次提交筛选都先废弃上一次请求，包括本次校验失败的情况。
  const currentVersion = requestGate.begin()
  pageError.value = ''

  loading.value = true

  try {
    const data = readPage(await getClientSignals(requestParams(page)))
    if (!requestGate.isCurrent(currentVersion)) return false

    pager.current = Number(data.current) || page
    pager.size = Number(data.size) || pager.size
    pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records) ? data.records : []
    hasLoaded.value = true
    return true
  } catch (error) {
    if (!requestGate.isCurrent(currentVersion)) return false

    pageError.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, '连接信号加载失败')
    hasLoaded.value = true
    return false
  } finally {
    if (requestGate.isCurrent(currentVersion)) loading.value = false
  }
}

function searchSignals() {
  if (
    filters.startTime
    && filters.endTime
    && filters.startTime > filters.endTime
  ) {
    requestGate.invalidate()
    loading.value = false
    pageError.value = '开始时间不能晚于结束时间'
    return
  }

  Object.assign(appliedFilters, filters)
  loadSignals(1)
}

function resetFilters() {
  Object.keys(filters).forEach((key) => {
    filters[key] = ''
  })

  Object.assign(appliedFilters, filters)
  loadSignals(1)
}

onMounted(() => loadSignals(1))
</script>

<template>
  <section class="workspace-view clients-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">网络工作区</p>
        <h2>连接信号</h2>
      </div>

      <button
        class="secondary-button"
        type="button"
        :disabled="loading"
        @click="loadSignals(pager.current)"
      >
        <RefreshCw :size="16" aria-hidden="true" />
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <p v-if="pageError" class="alert error">{{ pageError }}</p>

    <AppFilterBar class="clients-toolbar" @submit="searchSignals">
      <label v-for="field in filterFields" :key="field.key">
        <span>{{ field.label }}</span>
        <input
          v-model="filters[field.key]"
          :type="field.type"
          :placeholder="field.placeholder"
          :min="field.type === 'number' ? 1 : undefined"
        />
      </label>

      <div class="clients-toolbar-actions">
        <button type="submit" :disabled="loading">
          <Search :size="16" aria-hidden="true" />
          查询
        </button>
        <button
          class="secondary-button"
          type="button"
          :disabled="loading"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </AppFilterBar>

    <StateBlock
      v-if="loading && !hasLoaded"
      type="loading"
      title="正在加载连接信号"
      text="正在同步设备上报的真实 RSSI 数据"
    />

    <StateBlock
      v-else-if="hasLoaded && !pageError && !rows.length"
      title="暂无连接信号"
      text="当前筛选条件下没有信号记录"
    />

    <AppTableFrame v-if="hasLoaded && rows.length" class="client-table-wrap" label="连接信号列表" :busy="loading">
      <table class="client-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column[0]">{{ column[1] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td v-for="column in columns" :key="column[0]">
              <span
                v-if="column[0] === 'rssi'"
                :class="['status-pill', `status-pill--${signalInfo(row.rssi).tone}`]"
              >
                {{ signalInfo(row.rssi).label }}
              </span>
              <template v-else>
                {{ formatValue(column[0], row[column[0]]) }}
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </AppTableFrame>

    <AppPagination
      v-if="hasLoaded"
      :current="pager.current"
      :size="pager.size"
      :total="pager.total"
      :busy="loading"
      @change="loadSignals"
    />
  </section>
</template>

<style scoped>
.clients-toolbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  align-items: end;
  gap: 12px;
  margin-bottom: 16px;
}

.clients-toolbar label span {
  color: var(--wm-text-soft);
}

.clients-toolbar-actions {
  display: flex;
  gap: 8px;
}

.client-table-wrap {
  min-width: 0;
  overflow-x: auto;
  border-radius: 8px;
  scrollbar-gutter: stable;
}

.client-table {
  min-width: 1080px;
}

.client-table th,
.client-table td {
  white-space: nowrap;
}

@media (max-width: 1000px) {
  .clients-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .clients-toolbar {
    grid-template-columns: 1fr;
  }

  .clients-toolbar-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .clients-toolbar-actions button {
    width: 100%;
  }
}
</style>
