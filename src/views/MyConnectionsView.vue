<script setup>
import { onMounted, ref } from 'vue'
import { LogOut, RefreshCw } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import { getMySessions, logoutMySession } from '@/api/sessions'
import { getMyClientSignals, getMyTraffic } from '@/api/traffic'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'

const loading = ref(true)
const error = ref('')
const sessions = ref([])
const traffic = ref([])
const signals = ref([])
const busySessionId = ref(null)

function records(response, label) {
  const body = response?.data
  if (body?.code !== 200) throw new Error(body?.message || `${label}加载失败`)
  return Array.isArray(body.data?.records) ? body.data.records : []
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

async function load() {
  loading.value = true
  error.value = ''
  const results = await Promise.allSettled([
    getMySessions({ current: 1, size: 20 }),
    getMyTraffic({ current: 1, size: 20 }),
    getMyClientSignals({ current: 1, size: 20 })
  ])
  const targets = [sessions, traffic, signals]
  const labels = ['Session', '流量', '信号']
  const failures = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      try {
        targets[index].value = records(result.value, labels[index])
      } catch (cause) {
        failures.push(cause.message)
      }
    } else {
      failures.push(getApiErrorMessage(result.reason, `${labels[index]}加载失败`))
    }
  })
  error.value = [...new Set(failures)].join('；')
  loading.value = false
}

async function logout(session) {
  const confirmed = await confirmAction({
    title: '注销当前连接',
    message: `Session ${session.sessionId} 将被注销，设备访问权限会随之撤销。`,
    confirmLabel: '确认注销',
    tone: 'danger'
  })
  if (!confirmed) return

  busySessionId.value = session.sessionId
  error.value = ''
  try {
    const { data } = await logoutMySession(session.sessionId)
    if (data?.code !== 200) throw new Error(data?.message || 'Session 注销失败')
    await load()
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, 'Session 注销失败')
  } finally {
    busySessionId.value = null
  }
}

onMounted(load)
</script>

<template>
  <section class="workspace-view connections-page">
    <header class="dashboard-header">
      <div><p class="page-kicker">个人网络</p><h2>我的连接</h2></div>
      <button type="button" :disabled="loading" @click="load"><RefreshCw :size="16" />{{ loading ? '刷新中...' : '刷新' }}</button>
    </header>
    <p v-if="error" class="alert error">{{ error }}</p>
    <StateBlock v-if="loading && !sessions.length && !traffic.length && !signals.length" type="loading" title="正在加载连接数据" />

    <section v-else class="connections-grid">
      <article class="glass-panel connection-panel">
        <header><div><p class="page-kicker">访问授权</p><h3>Session</h3></div><strong>{{ sessions.length }}</strong></header>
        <div v-if="sessions.length" class="connection-table-wrap"><table><thead><tr><th>ID</th><th>MAC</th><th>设备</th><th>状态</th><th>到期时间</th><th>操作</th></tr></thead><tbody><tr v-for="row in sessions" :key="row.sessionId"><td>{{ row.sessionId }}</td><td>{{ row.mac || '-' }}</td><td>{{ row.deviceCode || row.nodeId || '-' }}</td><td>{{ row.statusName || row.status || '-' }}</td><td>{{ formatTime(row.expireTime) }}</td><td><button class="icon-button" type="button" title="注销 Session" aria-label="注销 Session" :disabled="busySessionId !== null" @click="logout(row)"><LogOut :size="16" /></button></td></tr></tbody></table></div>
        <StateBlock v-else title="暂无 Session" text="完成 Portal 授权后，连接会显示在这里" />
      </article>

      <article class="glass-panel connection-panel">
        <header><div><p class="page-kicker">最近用量</p><h3>流量</h3></div><strong>{{ traffic.length }}</strong></header>
        <div v-if="traffic.length" class="connection-table-wrap"><table><thead><tr><th>Session</th><th>目标</th><th>上行</th><th>下行</th><th>时间</th></tr></thead><tbody><tr v-for="row in traffic" :key="row.trafficId"><td>{{ row.sessionId || '-' }}</td><td>{{ row.sni || row.dstIp || '-' }}</td><td>{{ formatBytes(row.bytesUp) }}</td><td>{{ formatBytes(row.bytesDown) }}</td><td>{{ formatTime(row.createTime) }}</td></tr></tbody></table></div>
        <StateBlock v-else title="暂无流量记录" />
      </article>

      <article class="glass-panel connection-panel connection-panel--wide">
        <header><div><p class="page-kicker">连接质量</p><h3>客户端信号</h3></div><strong>{{ signals.length }}</strong></header>
        <div v-if="signals.length" class="connection-table-wrap"><table><thead><tr><th>MAC</th><th>设备</th><th>RSSI</th><th>状态</th><th>采集时间</th></tr></thead><tbody><tr v-for="(row, index) in signals" :key="row.signalId || index"><td>{{ row.mac || '-' }}</td><td>{{ row.deviceCode || row.nodeId || '-' }}</td><td>{{ row.rssi ?? '-' }}</td><td>{{ row.state || '-' }}</td><td>{{ formatTime(row.reportTime || row.createTime) }}</td></tr></tbody></table></div>
        <StateBlock v-else title="暂无信号记录" />
      </article>
    </section>
  </section>
</template>

<style scoped>
.connections-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.connection-panel { min-width: 0; padding: 16px; border-radius: 8px; overflow: hidden; }
.connection-panel--wide { grid-column: 1 / -1; }
.connection-panel > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.connection-panel h3 { margin: 0; font-size: 17px; }
.connection-panel > header > strong { color: var(--wm-text); font-size: 20px; }
.connection-table-wrap { overflow-x: auto; scrollbar-gutter: stable; }
.connection-table-wrap table { min-width: 620px; }
.connection-table-wrap th, .connection-table-wrap td { padding: 10px 12px; }
@media (max-width: 900px) { .connections-grid { grid-template-columns: 1fr; } .connection-panel--wide { grid-column: auto; } }
</style>
