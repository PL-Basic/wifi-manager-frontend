<script setup>
import { computed, onMounted, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'
import { getDeviceCommands } from '@/api/devices'
import { getDashboard, getOverview } from '@/api/overview'
import {
  resolveCommandStatus,
  resolveDeviceStatus,
  resolveServiceStatus
} from '@/config/networkStatus'

const loading = ref(true)
const refreshing = ref(false)
const overview = ref(null)
const dashboard = ref(null)
const recentCommands = ref([])
const pageError = ref('')
const partialNotice = ref('')

const requestGate = useRequestGate()

const userStats = computed(() => (
  overview.value?.userStats
  || dashboard.value?.userStats
  || {}
))

const deviceStats = computed(() => (
  overview.value?.deviceStats
  || dashboard.value?.deviceStats
  || {}
))

const recentDevices = computed(() => (
  dashboard.value?.recentDevices?.records || []
))

const hasData = computed(() => (
  Boolean(
    overview.value
    || dashboard.value
    || recentCommands.value.length
  )
))

const onlineRate = computed(() => {
  const total = Number(deviceStats.value.totalNodes || 0)
  const online = Number(deviceStats.value.onlineNodes || 0)

  if (!total) return '-'

  return `${Math.round((online / total) * 100)}%`
})

const metricItems = computed(() => [
  {
    label: '用户总数',
    value: userStats.value.totalUsers ?? '-'
  },
  {
    label: '启用用户',
    value: userStats.value.enabledUsers ?? '-'
  },
  {
    label: '节点总数',
    value: deviceStats.value.totalNodes ?? '-'
  },
  {
    label: '在线节点',
    value: deviceStats.value.onlineNodes ?? '-'
  },
  {
    label: '当前客户端',
    value: deviceStats.value.currentClients ?? '-'
  },
  {
    label: '开放 Session',
    value: deviceStats.value.onlineSessions ?? '-'
  },
  {
    label: '黑名单数量',
    value: deviceStats.value.blacklistCount ?? '-'
  },
  {
    label: '节点在线率',
    value: onlineRate.value
  }
])

const serviceItems = computed(() => [
  {
    label: 'Gateway',
    value: overview.value?.gatewayStatus || 'UNKNOWN'
  },
  {
    label: 'User Service',
    value: overview.value?.userServiceStatus || 'UNKNOWN'
  },
  {
    label: 'Device Service',
    value: overview.value?.deviceServiceStatus || 'UNKNOWN'
  },
  {
    label: 'Monitor Service',
    value: overview.value?.monitorServiceStatus || 'UNKNOWN'
  }
])

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}

function serviceStatus(value) {
  return resolveServiceStatus(value)
}

function deviceStatus(value) {
  return resolveDeviceStatus(value)
}

function commandStatus(value) {
  return resolveCommandStatus(value)
}

function statusClass(status) {
  return ['status-pill', `status-pill--${status.tone}`]
}

function readResponseData(response, label) {
  const body = response?.data

  if (body?.code !== 200) {
    throw new Error(body?.message || `${label}加载失败`)
  }

  return body.data
}

function readableError(error, fallback) {
  if (error instanceof Error && !error.response) {
    return error.message || fallback
  }

  return getApiErrorMessage(error, fallback)
}

function summarizeFailures(failures, showScopes) {
  const grouped = new Map()

  failures.forEach(({ scope, message }) => {
    const scopes = grouped.get(message) || []
    scopes.push(scope)
    grouped.set(message, scopes)
  })

  return Array.from(grouped.entries()).map(([message, scopes]) => {
    return showScopes ? `${message}（${scopes.join('、')}）` : message
  }).join('；')
}

async function loadOverview() {
  const currentVersion = requestGate.begin()
  const hasPreviousData = hasData.value

  loading.value = !hasPreviousData
  refreshing.value = true
  pageError.value = ''
  partialNotice.value = ''

  const results = await Promise.allSettled([
    getOverview(),
    getDashboard(),
    getDeviceCommands({ current: 1, size: 5 })
  ])

  if (!requestGate.isCurrent(currentVersion)) return

  const failures = []
  let successCount = 0

  const overviewResult = results[0]

  if (overviewResult.status === 'fulfilled') {
    try {
      overview.value = readResponseData(overviewResult.value, '系统状态')
      successCount += 1
    } catch (error) {
      failures.push({ scope: '系统状态', message: readableError(error, '系统状态加载失败') })
    }
  } else {
    failures.push({ scope: '系统状态', message: readableError(overviewResult.reason, '系统状态加载失败') })
  }

  const dashboardResult = results[1]

  if (dashboardResult.status === 'fulfilled') {
    try {
      dashboard.value = readResponseData(dashboardResult.value, '首页统计')
      successCount += 1
    } catch (error) {
      failures.push({ scope: '首页统计', message: readableError(error, '首页统计加载失败') })
    }
  } else {
    failures.push({ scope: '首页统计', message: readableError(dashboardResult.reason, '首页统计加载失败') })
  }

  const commandResult = results[2]

  if (commandResult.status === 'fulfilled') {
    try {
      const data = readResponseData(commandResult.value, '设备命令')
      recentCommands.value = Array.isArray(data?.records)
        ? data.records
        : []
      successCount += 1
    } catch (error) {
      failures.push({ scope: '设备命令', message: readableError(error, '设备命令加载失败') })
    }
  } else {
    failures.push({ scope: '设备命令', message: readableError(commandResult.reason, '设备命令加载失败') })
  }

  if (successCount === 0) {
    pageError.value = summarizeFailures(failures, new Set(failures.map((item) => item.message)).size > 1)
      || 'Overview 暂时无法加载'
  } else if (failures.length) {
    partialNotice.value = `部分数据暂时不可用：${summarizeFailures(failures, true)}`
  }

  loading.value = false
  refreshing.value = false
}

onMounted(loadOverview)

</script>

<template>
  <section class="workspace-view overview-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">管理工作区</p>
        <h2>运行总览</h2>
      </div>

      <button
        type="button"
        :disabled="refreshing"
        @click="loadOverview"
      >
        <RefreshCw :size="16" aria-hidden="true" />
        {{ refreshing ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <p v-if="pageError" class="alert error">
      {{ pageError }}
    </p>

    <p v-else-if="partialNotice" class="alert warning">
      {{ partialNotice }}
    </p>

    <StateBlock
      v-if="loading && !hasData"
      type="loading"
      title="正在加载运行总览"
      text="正在同步服务状态和节点统计"
    />

    <StateBlock
      v-else-if="!hasData"
      title="暂无总览数据"
      text="当前没有可展示的系统统计"
    />

    <template v-else>
      <section class="metric-grid overview-metrics">
        <article
          v-for="item in metricItems"
          :key="item.label"
          class="metric-card"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <section class="overview-grid">
        <article class="glass-panel overview-panel">
          <header class="overview-panel__header">
            <div>
              <p class="page-kicker">服务状态</p>
              <h3>依赖服务</h3>
            </div>
          </header>

          <div class="service-list">
            <div
              v-for="item in serviceItems"
              :key="item.label"
              class="service-row"
            >
              <span>{{ item.label }}</span>
              <span :class="statusClass(serviceStatus(item.value))">
                {{ serviceStatus(item.value).label }}
              </span>
            </div>
          </div>
        </article>

        <article class="glass-panel overview-panel">
          <header class="overview-panel__header">
            <div>
              <p class="page-kicker">最近节点</p>
              <h3>设备概况</h3>
            </div>
          </header>

          <div v-if="recentDevices.length" class="overview-table-wrap">
            <table class="overview-table">
              <thead>
                <tr>
                  <th>设备</th>
                  <th>状态</th>
                  <th>客户端</th>
                  <th>最近心跳</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="device in recentDevices"
                  :key="device.nodeId"
                >
                  <td>
                    <strong>{{ device.name || device.deviceCode || '-' }}</strong>
                    <small>{{ device.deviceCode || '-' }}</small>
                  </td>
                  <td>
                    <span :class="statusClass(deviceStatus(device.status))">
                      {{ deviceStatus(device.status).label }}
                    </span>
                  </td>
                  <td>{{ device.currentClients ?? '-' }}</td>
                  <td>{{ formatTime(device.lastHeartbeat) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <StateBlock
            v-else
            title="暂无最近设备"
            text="当前没有可展示的节点记录"
          />
        </article>
      </section>

      <section class="glass-panel overview-panel overview-command-panel">
        <header class="overview-panel__header">
          <div>
            <p class="page-kicker">最近命令</p>
            <h3>设备执行状态</h3>
          </div>
        </header>

        <div v-if="recentCommands.length" class="overview-table-wrap">
          <table class="overview-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>设备</th>
                <th>命令</th>
                <th>状态</th>
                <th>结果时间</th>
                <th>结果消息</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="command in recentCommands"
                :key="command.commandId || command.requestId"
              >
                <td class="breakable-cell">
                  {{ command.requestId || '-' }}
                </td>
                <td>{{ command.deviceCode || '-' }}</td>
                <td>{{ command.commandType || '-' }}</td>
                <td>
                  <span :class="statusClass(commandStatus(command.status))">
                    {{ commandStatus(command.status).label }}
                  </span>
                </td>
                <td>{{ formatTime(command.resultTime) }}</td>
                <td class="breakable-cell">
                  {{ command.resultMessage || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <StateBlock
          v-else
          title="暂无命令记录"
          text="当前没有最近设备命令"
        />
      </section>
    </template>
  </section>
</template>

<style scoped>
.overview-page {
  min-width: 0;
}

.overview-metrics {
  margin-bottom: 16px;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(260px, 0.75fr) minmax(0, 1.25fr);
  gap: 16px;
  margin-top: 16px;
}

.overview-panel {
  min-width: 0;
  overflow: hidden;
  border-radius: 8px;
  padding: 16px;
}

.overview-command-panel {
  margin-top: 16px;
}

.overview-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.overview-panel__header h3 {
  margin: 0;
  color: var(--wm-text);
  font-size: 17px;
}

.service-list {
  display: grid;
  gap: 10px;
}

.service-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--wm-border);
}

.service-row:last-child {
  border-bottom: 0;
}

.service-row > span:first-child {
  color: var(--wm-text-soft);
  overflow-wrap: anywhere;
}

.overview-table-wrap {
  min-width: 0;
  overflow-x: auto;
  scrollbar-gutter: stable;
}

.overview-table {
  min-width: 680px;
}

.overview-table th,
.overview-table td {
  padding: 10px 12px;
}

.overview-table td > strong,
.overview-table td > small {
  display: block;
}

.overview-table td > strong {
  color: var(--wm-text);
}

.overview-table td > small {
  margin-top: 3px;
  color: var(--wm-muted);
}

.breakable-cell {
  max-width: 260px;
  white-space: normal;
  overflow-wrap: anywhere;
}

@media (max-width: 820px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .overview-panel {
    padding: 14px;
  }

  .overview-table {
    min-width: 620px;
  }
}
</style>
