<script setup>
import {
  computed,
  onMounted,
  reactive,
  ref
} from 'vue'
import { Eye, RefreshCw, Search } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import AppFilterBar from '@/components/app/AppFilterBar.vue'
import AppTableFrame from '@/components/app/AppTableFrame.vue'
import TrafficDetailDrawer from '@/components/network/TrafficDetailDrawer.vue'
import {
  getTraffic
} from '@/api/traffic'
import { getTrafficAnalytics } from '@/api/insights'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'

function datetimeLocal(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16)
}

const now = new Date()
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

const filters = reactive({
  mac: '',
  sessionId: '',
  dstIp: '',
  startTime: datetimeLocal(yesterday),
  endTime: datetimeLocal(now)
})

const appliedFilters = reactive({ ...filters })

const loading = ref(false)
const analyticsLoading = ref(false)
const hasLoaded = ref(false)
const pageError = ref('')
const analyticsError = ref('')
const rows = ref([])
const analytics = ref(null)
const selectedRecord = ref(null)
const drawerOpen = ref(false)

const pager = reactive({
  current: 1,
  size: 10,
  total: 0
})

const requestGate = useRequestGate()

const analyticsNotice = computed(() =>
  appliedFilters.dstIp.trim()
    ? '后端统计接口不支持目标 IP 筛选；趋势摘要按其余条件计算。'
    : ''
)

function readData(response, fallback) {
  const body = response?.data

  if (body?.code !== 200) {
    throw new Error(body?.message || fallback)
  }

  return body.data || {}
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

function formatBytes(value) {
  const bytes = Number(value)

  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }

  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function validateTimeRange(source = filters) {
  if (!source.startTime || !source.endTime) {
    return '流量趋势要求填写开始时间和结束时间'
  }

  if (source.startTime > source.endTime) {
    return '开始时间不能晚于结束时间'
  }

  return ''
}

function listParams(page) {
  const params = {
    current: page,
    size: pager.size,
    startTime: appliedFilters.startTime,
    endTime: appliedFilters.endTime
  }

  if (appliedFilters.mac.trim()) {
    params.mac = appliedFilters.mac.trim().toUpperCase()
  }

  if (appliedFilters.sessionId.trim()) {
    params.sessionId = appliedFilters.sessionId.trim()
  }

  if (appliedFilters.dstIp.trim()) {
    params.dstIp = appliedFilters.dstIp.trim()
  }

  return params
}

function analyticsParams() {
  const params = {
    startTime: appliedFilters.startTime,
    endTime: appliedFilters.endTime,
    bucketMinutes: 60,
    topLimit: 5
  }

  if (appliedFilters.mac.trim()) {
    params.mac = appliedFilters.mac.trim().toUpperCase()
  }

  if (appliedFilters.sessionId.trim()) {
    params.sessionId = appliedFilters.sessionId.trim()
  }

  return params
}

async function loadTraffic(page = pager.current) {
  const version = requestGate.begin('list')
  loading.value = true
  pageError.value = ''

  try {
    const data = readData(
      await getTraffic(listParams(page)),
      '流量记录加载失败'
    )

    if (!requestGate.isCurrent(version, 'list')) return

    pager.current = Number(data.current) || page
    pager.size = Number(data.size) || pager.size
    pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records)
      ? data.records
      : []

    hasLoaded.value = true
  } catch (error) {
    if (!requestGate.isCurrent(version, 'list')) return

    pageError.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, '流量记录加载失败')

    hasLoaded.value = true
  } finally {
    if (requestGate.isCurrent(version, 'list')) loading.value = false
  }
}

async function loadAnalytics() {
  const version = requestGate.begin('analytics')
  analyticsLoading.value = true
  analyticsError.value = ''

  try {
    const data = readData(
      await getTrafficAnalytics(analyticsParams()),
      '流量趋势加载失败'
    )

    if (!requestGate.isCurrent(version, 'analytics')) return
    analytics.value = data
  } catch (error) {
    if (!requestGate.isCurrent(version, 'analytics')) return

    analyticsError.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, '流量趋势加载失败')
  } finally {
    if (requestGate.isCurrent(version, 'analytics')) {
      analyticsLoading.value = false
    }
  }
}

function runSearch() {
  const validationError = validateTimeRange()

  if (validationError) {
    requestGate.invalidate('list')
    requestGate.invalidate('analytics')
    loading.value = false
    analyticsLoading.value = false
    pageError.value = validationError
    analyticsError.value = validationError
    return
  }

  Object.assign(appliedFilters, filters)

  loadTraffic(1)
  loadAnalytics()
}

function resetFilters() {
  const resetNow = new Date()
  const resetStart = new Date(
    resetNow.getTime() - 24 * 60 * 60 * 1000
  )

  filters.mac = ''
  filters.sessionId = ''
  filters.dstIp = ''
  filters.startTime = datetimeLocal(resetStart)
  filters.endTime = datetimeLocal(resetNow)

  runSearch()
}

function openDetail(record) {
  selectedRecord.value = record
  drawerOpen.value = true
}

function closeDetail() {
  drawerOpen.value = false
  selectedRecord.value = null
}

onMounted(runSearch)

</script>

<template>
  <section class="workspace-view traffic-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">网络工作区</p>
        <h2>流量记录</h2>
      </div>

      <button
        class="secondary-button"
        type="button"
        :disabled="loading || analyticsLoading"
        @click="runSearch"
      >
        <RefreshCw :size="16" aria-hidden="true" />
        刷新
      </button>
    </header>

    <AppFilterBar class="traffic-toolbar" @submit="runSearch">
      <label>
        <span>MAC 地址</span>
        <input
          v-model="filters.mac"
          maxlength="17"
          placeholder="AA:BB:CC:DD:EE:FF"
        />
      </label>

      <label>
        <span>连接编号</span>
        <input
          v-model="filters.sessionId"
          type="number"
          min="1"
          placeholder="连接编号"
        />
      </label>

      <label>
        <span>目标 IP</span>
        <input
          v-model="filters.dstIp"
          maxlength="45"
          placeholder="192.168.1.10"
        />
      </label>

      <label>
        <span>开始时间</span>
        <input
          v-model="filters.startTime"
          type="datetime-local"
        />
      </label>

      <label>
        <span>结束时间</span>
        <input
          v-model="filters.endTime"
          type="datetime-local"
        />
      </label>

      <div class="traffic-toolbar-actions">
        <button type="submit" :disabled="loading || analyticsLoading">
          <Search :size="16" aria-hidden="true" />
          查询
        </button>

        <button
          class="secondary-button"
          type="button"
          :disabled="loading || analyticsLoading"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </AppFilterBar>

    <section class="traffic-analytics">
      <header class="section-heading">
        <div>
          <p class="page-kicker">真实统计</p>
          <h3>趋势摘要</h3>
        </div>
      </header>

      <p v-if="analyticsNotice" class="alert">
        {{ analyticsNotice }}
      </p>

      <p v-if="analyticsError" class="alert error">
        {{ analyticsError }}
      </p>

      <StateBlock
        v-if="analyticsLoading && !analytics"
        type="loading"
        title="正在加载流量趋势"
      />

      <template v-if="analytics?.summary">
        <section class="traffic-summary-grid">
          <article class="glass-panel">
            <span>事件数</span>
            <strong>{{ analytics.summary.eventCount ?? 0 }}</strong>
          </article>

          <article class="glass-panel">
            <span>总流量</span>
            <strong>{{ formatBytes(analytics.summary.totalBytes) }}</strong>
          </article>

          <article class="glass-panel">
            <span>上行流量</span>
            <strong>{{ formatBytes(analytics.summary.bytesUp) }}</strong>
          </article>

          <article class="glass-panel">
            <span>下行流量</span>
            <strong>{{ formatBytes(analytics.summary.bytesDown) }}</strong>
          </article>

          <article class="glass-panel">
            <span>不同 MAC</span>
            <strong>{{ analytics.summary.distinctMacs ?? 0 }}</strong>
          </article>
        </section>

        <section class="traffic-insight-grid">
          <article class="glass-panel traffic-trend-panel">
            <h4>时间趋势</h4>

            <div class="traffic-small-table">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>事件</th>
                    <th>总流量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="bucket in analytics.trend || []"
                    :key="bucket.bucketTime"
                  >
                    <td>{{ formatTime(bucket.bucketTime) }}</td>
                    <td>{{ bucket.eventCount ?? 0 }}</td>
                    <td>{{ formatBytes(bucket.totalBytes) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article class="glass-panel traffic-rank-panel">
            <h4>目标 IP 排名</h4>

            <StateBlock
              v-if="!(analytics.destinationIps || []).length"
              title="暂无目标 IP 排名"
            />

            <ol v-else>
              <li
                v-for="item in analytics.destinationIps"
                :key="item.dimensionKey"
              >
                <span>{{ item.dimensionKey || '-' }}</span>
                <strong>{{ formatBytes(item.totalBytes) }}</strong>
              </li>
            </ol>
          </article>
        </section>
      </template>
    </section>

    <p v-if="pageError" class="alert error">
      {{ pageError }}
    </p>

    <StateBlock
      v-if="loading && !hasLoaded"
      type="loading"
      title="正在加载流量记录"
      text="正在查询真实设备流量日志"
    />

    <StateBlock
      v-else-if="hasLoaded && !pageError && !rows.length"
      title="暂无流量记录"
      text="当前筛选条件下没有流量数据"
    />

    <AppTableFrame
      v-if="hasLoaded && rows.length"
      class="traffic-table-wrap"
      label="流量记录列表"
      :busy="loading"
    >
      <table class="traffic-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>设备</th>
            <th>连接编号</th>
            <th>MAC</th>
            <th>目标</th>
            <th>SNI</th>
            <th>协议</th>
            <th>上行</th>
            <th>下行</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="record in rows" :key="record.id">
            <td>{{ record.id }}</td>
            <td>{{ record.deviceCode || record.nodeId || '-' }}</td>
            <td>{{ record.sessionId ?? '-' }}</td>
            <td>{{ record.mac || '-' }}</td>
            <td>
              {{ record.dstIp || '-' }}:{{ record.dstPort ?? '-' }}
            </td>
            <td>{{ record.sni || '-' }}</td>
            <td>{{ record.protocol || '-' }}</td>
            <td>{{ formatBytes(record.bytesUp) }}</td>
            <td>{{ formatBytes(record.bytesDown) }}</td>
            <td>{{ formatTime(record.logTime) }}</td>
            <td>
              <button
                class="icon-button"
                type="button"
                title="查看流量详情"
                @click="openDetail(record)"
              >
                <Eye :size="16" aria-hidden="true" />
              </button>
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
      @change="loadTraffic"
    />

    <TrafficDetailDrawer
      :open="drawerOpen"
      :record="selectedRecord"
      @close="closeDetail"
    />
  </section>
</template>

<style scoped>
.traffic-page {
  min-width: 0;
}

.traffic-toolbar {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr)) auto;
  align-items: end;
  gap: 12px;
  margin-bottom: 18px;
}

.traffic-toolbar label span {
  color: var(--wm-text-soft);
}

.traffic-toolbar-actions {
  display: flex;
  gap: 8px;
}

.traffic-analytics {
  margin-bottom: 20px;
}

.traffic-analytics h3,
.traffic-insight-grid h4 {
  margin: 0;
  color: var(--wm-text);
}

.traffic-summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.traffic-summary-grid article,
.traffic-insight-grid article {
  min-width: 0;
  border-radius: 8px;
  padding: 14px;
}

.traffic-summary-grid span {
  display: block;
  color: var(--wm-muted);
}

.traffic-summary-grid strong {
  display: block;
  margin-top: 6px;
  overflow-wrap: anywhere;
  color: var(--wm-text);
  font-size: 20px;
}

.traffic-insight-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.traffic-small-table,
.traffic-table-wrap {
  min-width: 0;
  overflow-x: auto;
  scrollbar-gutter: stable;
}

.traffic-small-table table {
  min-width: 520px;
}

.traffic-rank-panel ol {
  margin: 14px 0 0;
  padding-left: 22px;
}

.traffic-rank-panel li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 7px 0;
  color: var(--wm-text-soft);
}

.traffic-rank-panel li span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.traffic-rank-panel li strong {
  color: var(--wm-primary);
  white-space: nowrap;
}

.traffic-table-wrap {
  border-radius: 8px;
}

.traffic-table {
  min-width: 1320px;
}

.traffic-table th,
.traffic-table td {
  white-space: nowrap;
}

@media (max-width: 1200px) {
  .traffic-toolbar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .traffic-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .traffic-insight-grid {
    grid-template-columns: 1fr;
  }

  .traffic-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .traffic-toolbar,
  .traffic-summary-grid {
    grid-template-columns: 1fr;
  }

  .traffic-toolbar-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .traffic-toolbar-actions button {
    width: 100%;
  }
}
</style>
