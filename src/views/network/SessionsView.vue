<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Eye, RefreshCw, Search } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import AppFilterBar from '@/components/app/AppFilterBar.vue'
import AppTableFrame from '@/components/app/AppTableFrame.vue'
import SessionDetailDrawer from '@/components/network/SessionDetailDrawer.vue'
import { getSessions } from '@/api/sessions'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'
import {
  SESSION_STATUSES,
  resolveSessionStatus
} from '@/config/networkStatus'

const route = useRoute()

const loading = ref(false)
const hasLoaded = ref(false)
const pageError = ref('')
const rows = ref([])
const selectedSession = ref(null)
const drawerOpen = ref(false)

const pager = reactive({
  current: 1,
  size: 10,
  total: 0
})

const filters = reactive({
  mac: String(route.query.mac || ''),
  nodeId: String(route.query.nodeId || ''),
  userId: String(route.query.userId || ''),
  status: ''
})
const appliedFilters = reactive({ ...filters })

const requestGate = useRequestGate()

const statusOptions = Object.entries(SESSION_STATUSES).map(
  ([value, information]) => ({
    value,
    label: information.label
  })
)

function readPage(response) {
  const body = response?.data

  if (body?.code !== 200) {
    throw new Error(body?.message || '连接记录加载失败')
  }

  return body.data || {}
}

function requestParams(page) {
  const params = {
    current: page,
    size: pager.size
  }

  const mac = appliedFilters.mac.trim()
  const nodeId = appliedFilters.nodeId.trim()
  const userId = appliedFilters.userId.trim()

  if (appliedFilters.status !== '') {
    params.status = appliedFilters.status
  }

  if (mac) params.mac = mac.toUpperCase()
  if (nodeId) params.nodeId = nodeId
  if (userId) params.userId = userId

  return params
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

async function loadSessions(page = pager.current) {
  const version = requestGate.begin()
  loading.value = true
  pageError.value = ''

  try {
    const data = readPage(
      await getSessions(requestParams(page))
    )

    if (!requestGate.isCurrent(version)) return

    pager.current = Number(data.current) || page
    pager.size = Number(data.size) || pager.size
    pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records)
      ? data.records
      : []

    hasLoaded.value = true
  } catch (error) {
    if (!requestGate.isCurrent(version)) return

    pageError.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, '连接记录加载失败')

    hasLoaded.value = true
  } finally {
    if (requestGate.isCurrent(version)) {
      loading.value = false
    }
  }
}

function search() {
  Object.assign(appliedFilters, filters)
  loadSessions(1)
}

function resetFilters() {
  filters.mac = ''
  filters.nodeId = ''
  filters.userId = ''
  filters.status = ''

  Object.assign(appliedFilters, filters)
  loadSessions(1)
}

function openDetail(session) {
  selectedSession.value = session
  drawerOpen.value = true
}

function closeDetail() {
  drawerOpen.value = false
  selectedSession.value = null
}

function handleSessionUpdated(updated) {
  rows.value = rows.value.map((item) =>
    item.sessionId === updated.sessionId
      ? { ...item, ...updated }
      : item
  )
}

onMounted(() => loadSessions(1))

</script>

<template>
  <section class="workspace-view sessions-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">网络工作区</p>
        <h2>连接记录</h2>
      </div>

      <button
        class="secondary-button"
        type="button"
        :disabled="loading"
        @click="loadSessions(pager.current)"
      >
        <RefreshCw :size="16" aria-hidden="true" />
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <AppFilterBar class="sessions-toolbar" @submit="search">
      <label>
        <span>MAC 地址</span>
        <input
          v-model="filters.mac"
          maxlength="17"
          placeholder="AA:BB:CC:DD:EE:FF"
        />
      </label>

      <label>
        <span>设备编号</span>
        <input
          v-model="filters.nodeId"
          type="number"
          min="1"
          placeholder="设备编号"
        />
      </label>

      <label>
        <span>用户编号</span>
        <input
          v-model="filters.userId"
          type="number"
          min="1"
          placeholder="用户编号"
        />
      </label>

      <label>
        <span>连接状态</span>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option
            v-for="option in statusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <div class="sessions-toolbar-actions">
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

    <p v-if="pageError" class="alert error">
      {{ pageError }}
    </p>

    <StateBlock
      v-if="loading && !hasLoaded"
      type="loading"
      title="正在加载连接记录"
      text="正在读取连接和流量状态"
    />

    <StateBlock
      v-else-if="hasLoaded && !pageError && !rows.length"
      title="暂无连接记录"
      text="当前筛选条件下没有符合条件的连接"
    />

    <AppTableFrame
      v-if="hasLoaded && rows.length"
      class="sessions-table-wrap"
      label="连接记录列表"
      :busy="loading"
    >
      <table class="sessions-table">
        <thead>
          <tr>
            <th>连接编号</th>
            <th>用户</th>
            <th>设备</th>
            <th>MAC</th>
            <th>IP</th>
            <th>状态</th>
            <th>上行</th>
            <th>下行</th>
            <th>登录时间</th>
            <th>操作</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="session in rows" :key="session.sessionId">
            <td>{{ session.sessionId }}</td>
            <td>{{ session.userId ?? '-' }}</td>
            <td>{{ session.nodeId ?? '-' }}</td>
            <td>{{ session.mac || '-' }}</td>
            <td>{{ session.ip || '-' }}</td>
            <td>
              <span
                :class="[
                  'status-pill',
                  `status-pill--${resolveSessionStatus(session.status).tone}`
                ]"
              >
                {{ resolveSessionStatus(session.status).label }}
              </span>
            </td>
            <td>{{ formatBytes(session.bytesUp) }}</td>
            <td>{{ formatBytes(session.bytesDown) }}</td>
            <td>{{ formatTime(session.loginTime) }}</td>
            <td>
              <button
                class="icon-button"
                type="button"
                title="查看连接详情"
                @click="openDetail(session)"
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
      @change="loadSessions"
    />

    <SessionDetailDrawer
      :open="drawerOpen"
      :session="selectedSession"
      @close="closeDetail"
      @updated="handleSessionUpdated"
    />
  </section>
</template>

<style scoped>
.sessions-page {
  min-width: 0;
}

.sessions-toolbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr)) auto;
  align-items: end;
  gap: 12px;
  margin-bottom: 16px;
}

.sessions-toolbar label span {
  color: var(--wm-text-soft);
}

.sessions-toolbar-actions {
  display: flex;
  gap: 8px;
}

.sessions-table-wrap {
  min-width: 0;
  overflow-x: auto;
  border-radius: 8px;
  scrollbar-gutter: stable;
}

.sessions-table {
  min-width: 1160px;
}

.sessions-table th,
.sessions-table td {
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .sessions-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .sessions-toolbar {
    grid-template-columns: 1fr;
  }

  .sessions-toolbar-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .sessions-toolbar-actions button {
    width: 100%;
  }
}
</style>
