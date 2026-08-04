<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Plus, RefreshCw, Search, Wifi } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import AppTableFrame from '@/components/app/AppTableFrame.vue'
import DeviceFormModal from '@/components/network/DeviceFormModal.vue'
import { getDevices } from '@/api/devices'
import { getApiErrorMessage } from '@/utils/apiError'
import { resolveDeviceStatus } from '@/config/networkStatus'
import { useRequestGate } from '@/composables/useRequestGate'

const loading = ref(false)
const router = useRouter()
const hasLoaded = ref(false)
const formOpen = ref(false)
const pageError = ref('')
const actionMessage = ref('')
const keyword = ref('')
const appliedKeyword = ref('')
const rows = ref([])

const pager = reactive({
  current: 1,
  size: 10,
  total: 0
})

const requestGate = useRequestGate()

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}

function deviceStatus(value) {
  return resolveDeviceStatus(value)
}

function statusClass(value) {
  const status = deviceStatus(value)

  return [
    'status-pill',
    `status-pill--${status.tone}`
  ]
}

function readPage(response) {
  const body = response?.data

  if (body?.code !== 200) {
    throw new Error(body?.message || '设备列表加载失败')
  }

  return body.data || {}
}

async function loadDevices(page = pager.current) {
  const currentVersion = requestGate.begin()

  loading.value = true
  pageError.value = ''

  try {
    const response = await getDevices({
      current: page,
      size: pager.size,
      keyword: appliedKeyword.value || undefined
    })

    if (!requestGate.isCurrent(currentVersion)) return false

    const data = readPage(response)

    pager.current = Number(data.current) || page
    pager.size = Number(data.size) || pager.size
    pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records) ? data.records : []
    hasLoaded.value = true
    return true
  } catch (error) {
    if (!requestGate.isCurrent(currentVersion)) return

    pageError.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, '设备列表加载失败')
    hasLoaded.value = true
    return false
  } finally {
    if (requestGate.isCurrent(currentVersion)) {
      loading.value = false
    }
  }
}

function searchDevices() {
  appliedKeyword.value = keyword.value.trim()
  loadDevices(1)
}

function resetSearch() {
  keyword.value = ''
  appliedKeyword.value = ''
  loadDevices(1)
}

function openCreateModal() {
  pageError.value = ''
  actionMessage.value = ''
  formOpen.value = true
}

function openDetail(device, section = 'overview') {
  if (!device?.nodeId) return

  router.push({
    name: 'app-network-device-detail',
    params: {
      nodeId: device.nodeId
    },
    query: { section }
  })
}

async function handleSaved() {
  actionMessage.value = ''

  const refreshed = await loadDevices(pager.current)

  if (refreshed) {
    actionMessage.value = '设备已保存，列表已刷新'
  }
}

onMounted(() => {
  loadDevices(1)
})

</script>

<template>
  <section class="workspace-view devices-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">网络工作区</p>
        <h2>设备节点</h2>
      </div>

      <div class="devices-header-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="loading"
          @click="loadDevices(pager.current)"
        >
          <RefreshCw :size="16" aria-hidden="true" />
          {{ loading ? '刷新中...' : '刷新' }}
        </button>

        <button type="button" @click="openCreateModal">
          <Plus :size="16" aria-hidden="true" />
          新增设备
        </button>
      </div>
    </header>

    <p v-if="pageError" class="alert error">
      {{ pageError }}
    </p>

    <p v-if="actionMessage" class="alert success">
      {{ actionMessage }}
    </p>

    <section class="glass-toolbar devices-toolbar">
      <label>
        <span>关键字</span>
        <input
          v-model="keyword"
          type="search"
          placeholder="设备编码、名称或位置"
          @keyup.enter="searchDevices"
        />
      </label>

      <div class="devices-toolbar-actions">
        <button type="button" :disabled="loading" @click="searchDevices">
          <Search :size="16" aria-hidden="true" />
          查询
        </button>

        <button
          class="secondary-button"
          type="button"
          :disabled="loading"
          @click="resetSearch"
        >
          重置
        </button>
      </div>

      <p class="toolbar-note">
        共 {{ pager.total }} 个节点
      </p>
    </section>

    <StateBlock
      v-if="loading && !hasLoaded"
      type="loading"
      title="正在加载设备节点"
      text="正在同步设备列表"
    />

    <StateBlock
    v-else-if="hasLoaded && !pageError && !rows.length"
    title="暂无设备节点"
    text="当前筛选条件下没有设备记录"
    />

    <AppTableFrame
      v-else-if="hasLoaded"
      class="device-table-wrap"
      label="设备节点列表"
      :busy="loading"
    >
      <table class="device-table">
        <thead>
          <tr>
            <th>节点 ID</th>
            <th>设备编码</th>
            <th>名称</th>
            <th>位置</th>
            <th>IP</th>
            <th>状态</th>
            <th>在线客户端</th>
            <th>最大容量</th>
            <th>最近心跳</th>
            <th>操作</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="device in rows" :key="device.nodeId">
            <td>{{ device.nodeId ?? '-' }}</td>
            <td class="breakable-cell">{{ device.deviceCode || '-' }}</td>
            <td>{{ device.name || '-' }}</td>
            <td class="breakable-cell">{{ device.location || '-' }}</td>
            <td>{{ device.ip || '-' }}</td>
            <td>
              <span :class="statusClass(device.status)">
                {{ deviceStatus(device.status).label }}
              </span>
            </td>
            <td>{{ device.currentClients ?? '-' }}</td>
            <td>{{ device.maxClients ?? '-' }}</td>
            <td>{{ formatTime(device.lastHeartbeat) }}</td>
            <td class="action-cell">
              <button
                class="secondary-button compact-button"
                type="button"
                :disabled="loading || device.status !== 1"
                title="修改 ESP 上游网络"
                @click="openDetail(device, 'upstream')"
              >
                <Wifi :size="14" aria-hidden="true" />
                上游网络
              </button>
              <button
                class="secondary-button compact-button"
                type="button"
                :disabled="loading"
                @click="openDetail(device, 'overview')"
              >
                详情
                <ArrowRight :size="14" aria-hidden="true" />
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
      @change="loadDevices"
    />

    <DeviceFormModal
      :open="formOpen"
      mode="create"
      @close="formOpen = false"
      @saved="handleSaved"
    />
  </section>
</template>

<style scoped>
.devices-page {
  min-width: 0;
}

.devices-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.devices-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 360px) auto minmax(120px, 1fr);
  align-items: end;
  gap: 12px;
  margin-bottom: 16px;
}

.devices-toolbar label span {
  color: var(--wm-text-soft);
}

.devices-toolbar input {
  color: var(--wm-text);
  background: var(--wm-bg-soft);
  border-color: var(--wm-border-strong);
}

.devices-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-note {
  margin: 0;
  align-self: center;
  color: var(--wm-muted);
  text-align: right;
}

.device-table-wrap {
  min-width: 0;
  overflow-x: auto;
  border-radius: 8px;
  scrollbar-gutter: stable;
}

.device-table {
  min-width: 1160px;
}

.device-table th,
.device-table td {
  white-space: nowrap;
}

.breakable-cell {
  max-width: 220px;
  white-space: normal !important;
  overflow-wrap: anywhere;
}

@media (max-width: 820px) {
  .devices-toolbar {
    grid-template-columns: 1fr;
  }

  .toolbar-note {
    text-align: left;
  }
}

@media (max-width: 560px) {
  .devices-header-actions {
    width: 100%;
  }

  .devices-header-actions button {
    flex: 1 1 0;
  }

  .devices-toolbar-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .devices-toolbar-actions button {
    width: 100%;
  }
}
</style>
