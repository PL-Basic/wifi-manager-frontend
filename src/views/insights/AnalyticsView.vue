<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RefreshCw, Search } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import AnalyticsChart from '@/components/insights/AnalyticsChart.vue'
import StateBlock from '@/components/StateBlock.vue'
import {
  getAlertRuleAnalytics,
  getSignalAnalytics,
  getTrafficAnalytics
} from '@/api/insights'
import { resolveSignalQuality } from '@/config/insightsStatus'
import {
  resolveAlertLevel,
  resolveAlertStatus,
  resolveRuleAction
} from '@/config/securityStatus'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'
import './insights.css'

const route = useRoute()
const router = useRouter()
const requestGate = useRequestGate()

const MODES = [
  { key: 'signals', label: '信号质量', title: '信号质量分析' },
  { key: 'traffic', label: '流量', title: '流量分析' },
  { key: 'alerts-rules', label: '告警与规则', title: '告警与规则分析' }
]

const RANKING_OPTIONS = [
  ['users', '用户'], ['macs', 'MAC'], ['sessions', '连接'],
  ['nodes', '设备'], ['devices', '设备'], ['destinationIps', '目标 IP'],
  ['destinationPorts', '目标端口'], ['snis', 'SNI'], ['protocols', '协议']
]

function datetimeLocal(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function recentRange(hours = 24) {
  const end = new Date()
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000)
  return { startTime: datetimeLocal(start), endTime: datetimeLocal(end) }
}

const forms = reactive({
  signals: {
    nodeId: '',
    mac: '',
    ...recentRange(6),
    sampleLimit: 31,
    bucketMinutes: 5
  },
  traffic: {
    userId: '', mac: '', sessionId: '', nodeId: '', deviceCode: '',
    ...recentRange(24),
    bucketMinutes: 60,
    topLimit: 10
  },
  'alerts-rules': {
    userId: '', mac: '', sessionId: '', nodeId: '', deviceCode: '',
    ...recentRange(24),
    topLimit: 10
  }
})

const states = reactive(Object.fromEntries(
  MODES.map((mode) => [mode.key, {
    loading: false,
    loaded: false,
    error: '',
    result: null
  }])
))

const trafficRankDimension = ref('destinationIps')
const activeMode = computed(() => (
  MODES.some((mode) => mode.key === route.query.view)
    ? route.query.view
    : 'signals'
))
const activeDefinition = computed(() => (
  MODES.find((mode) => mode.key === activeMode.value) || MODES[0]
))
const activeForm = computed(() => forms[activeMode.value])
const activeState = computed(() => states[activeMode.value])

const summaryItems = computed(() => {
  const result = activeState.value.result
  if (!result) return []

  if (activeMode.value === 'signals') {
    return [
      ['平滑 RSSI', result.smoothedRssi === null || result.smoothedRssi === undefined ? '-' : `${result.smoothedRssi} dBm`],
      ['信号质量', result.qualityDescription || resolveSignalQuality(result.qualityLevel).label],
      ['估算距离', formatMeters(result.estimatedDistanceMeters)],
      ['有效样本', result.usedSampleCount ?? 0]
    ]
  }

  if (activeMode.value === 'traffic') {
    const summary = result.summary || {}
    return [
      ['事件数', summary.eventCount ?? 0],
      ['总流量', formatBytes(summary.totalBytes)],
      ['上行', formatBytes(summary.bytesUp)],
      ['下行', formatBytes(summary.bytesDown)]
    ]
  }

  return [
    ['告警总数', result.alertSummary?.totalAlerts ?? 0],
    ['未处理告警', result.alertSummary?.unresolvedAlerts ?? 0],
    ['规则命中', result.ruleHitSummary?.totalHits ?? 0],
    ['被抑制命中', result.ruleHitSummary?.suppressedHits ?? 0]
  ]
})

const trendLabels = computed(() => {
  const result = activeState.value.result
  const source = activeMode.value === 'signals' ? result?.trend : result?.trend
  return (source || []).map((item) => formatChartTime(item.bucketTime))
})

const trendSeries = computed(() => {
  const result = activeState.value.result
  if (!result) return []

  if (activeMode.value === 'signals') {
    return [
      { name: '平均 RSSI', data: (result.trend || []).map((item) => item.averageRssi), area: true },
      { name: '估算距离（米）', data: (result.trend || []).map((item) => item.estimatedDistanceMeters) }
    ]
  }

  if (activeMode.value === 'traffic') {
    return [
      { name: '上行（MB）', data: (result.trend || []).map((item) => bytesToMegabytes(item.bytesUp)), area: true },
      { name: '下行（MB）', data: (result.trend || []).map((item) => bytesToMegabytes(item.bytesDown)), area: true }
    ]
  }

  return []
})

const rankingItems = computed(() => (
  activeState.value.result?.[trafficRankDimension.value] || []
))
const rankingLabel = computed(() => (
  RANKING_OPTIONS.find(([key]) => key === trafficRankDimension.value)?.[1] || '维度'
))

const alertDistribution = computed(() => {
  const result = activeState.value.result || {}
  const levels = (result.alertLevels || []).map((item) => ({
    label: `等级：${resolveAlertLevel(item.code).label}`,
    count: item.count
  }))
  const statuses = (result.alertStatuses || []).map((item) => ({
    label: `状态：${resolveAlertStatus(item.code).label}`,
    count: item.count
  }))
  const actions = (result.actionTypes || []).map((item) => ({
    label: `动作：${resolveRuleAction(item.code).label}`,
    count: item.count
  }))
  return [...levels, ...statuses, ...actions]
})

function setMode(mode) {
  if (mode !== activeMode.value) {
    router.replace({ query: { ...route.query, view: mode } })
  }
}

function readData(response, fallback) {
  const body = response?.data
  if (body?.code !== 200) throw new Error(body?.message || fallback)
  return body.data || {}
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function idValue(value) {
  return String(value ?? '').trim()
}

function optionalIdValue(value) {
  const normalized = idValue(value)
  return normalized || undefined
}

function validateTime(form, maximumHours) {
  if (!form.startTime || !form.endTime) return '开始时间和结束时间不能为空'
  const start = new Date(form.startTime).getTime()
  const end = new Date(form.endTime).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return '结束时间必须晚于开始时间'
  }
  if (end - start > maximumHours * 60 * 60 * 1000) {
    return `当前分析范围不能超过 ${maximumHours === 24 ? '24 小时' : '31 天'}`
  }
  return ''
}

function validateOptionalId(value, label) {
  if (!idValue(value)) return ''
  return /^[1-9]\d*$/.test(idValue(value)) ? '' : `${label} 必须是大于 0 的整数`
}

function validate(mode, form) {
  const timeError = validateTime(form, mode === 'signals' ? 24 : 31 * 24)
  if (timeError) return timeError

  if (mode === 'signals') {
    if (!/^[1-9]\d*$/.test(idValue(form.nodeId))) return '设备编号必须是大于 0 的整数'
    if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(form.mac.trim())) return '必须填写完整 MAC 地址'
    if (!Number.isInteger(Number(form.sampleLimit)) || Number(form.sampleLimit) < 3 || Number(form.sampleLimit) > 101) return '采样数必须是 3 到 101 之间的整数'
    if (![1, 5, 15, 30, 60].includes(Number(form.bucketMinutes))) return '信号分桶间隔无效'
    return ''
  }

  for (const [key, label] of [['userId', '用户编号'], ['sessionId', '连接编号'], ['nodeId', '设备编号']]) {
    const error = validateOptionalId(form[key], label)
    if (error) return error
  }

  if (form.mac.trim() && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(form.mac.trim())) {
    return 'MAC 地址格式无效'
  }
  if (!Number.isInteger(Number(form.topLimit)) || Number(form.topLimit) < 1 || Number(form.topLimit) > 50) return '排名数量必须是 1 到 50 之间的整数'
  if (mode === 'traffic' && ![5, 15, 60, 360, 1440].includes(Number(form.bucketMinutes))) {
    return '流量分桶间隔无效'
  }
  if (mode === 'traffic') {
    const rangeMilliseconds = new Date(form.endTime).getTime() - new Date(form.startTime).getTime()
    const bucketCount = Math.ceil(rangeMilliseconds / (Number(form.bucketMinutes) * 60 * 1000))
    if (bucketCount > 1000) return '当前时间范围和分桶间隔会产生超过 1000 个趋势桶，请增大分桶间隔'
  }
  return ''
}

function commonFilterParams(form) {
  return {
    userId: optionalIdValue(form.userId),
    mac: form.mac.trim().toUpperCase() || undefined,
    sessionId: optionalIdValue(form.sessionId),
    nodeId: optionalIdValue(form.nodeId),
    deviceCode: form.deviceCode.trim() || undefined,
    startTime: form.startTime,
    endTime: form.endTime,
    topLimit: numberValue(form.topLimit)
  }
}

function requestFor(mode, form) {
  if (mode === 'signals') {
    return getSignalAnalytics({
      nodeId: idValue(form.nodeId),
      mac: form.mac.trim().toUpperCase(),
      startTime: form.startTime,
      endTime: form.endTime,
      sampleLimit: numberValue(form.sampleLimit),
      bucketMinutes: numberValue(form.bucketMinutes)
    })
  }

  const params = commonFilterParams(form)
  if (mode === 'traffic') {
    params.bucketMinutes = numberValue(form.bucketMinutes)
    return getTrafficAnalytics(params)
  }
  return getAlertRuleAnalytics(params)
}

async function runQuery() {
  const mode = activeMode.value
  const state = states[mode]
  const form = forms[mode]
  const validationError = validate(mode, form)
  if (validationError) {
    requestGate.invalidate(mode)
    state.loading = false
    state.error = validationError
    return
  }

  const version = requestGate.begin(mode)
  state.loading = true
  state.error = ''
  try {
    const data = readData(await requestFor(mode, form), `${activeDefinition.value.title}失败`)
    if (!requestGate.isCurrent(version, mode)) return
    state.result = data
    state.loaded = true
  } catch (error) {
    if (!requestGate.isCurrent(version, mode)) return
    state.error = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, `${activeDefinition.value.title}失败`)
    state.loaded = true
  } finally {
    if (requestGate.isCurrent(version, mode)) state.loading = false
  }
}

function resetActiveForm() {
  const mode = activeMode.value
  const freshRange = recentRange(mode === 'signals' ? 6 : 24)
  if (mode === 'signals') {
    Object.assign(forms.signals, freshRange, { nodeId: '', mac: '', sampleLimit: 31, bucketMinutes: 5 })
  } else {
    Object.assign(forms[mode], freshRange, {
      userId: '', mac: '', sessionId: '', nodeId: '', deviceCode: '', topLimit: 10
    })
    if (mode === 'traffic') forms.traffic.bucketMinutes = 60
  }
  states[mode].error = ''
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function bytesToMegabytes(value) {
  const bytes = Number(value)
  return Number.isFinite(bytes) ? Number((bytes / 1024 ** 2).toFixed(3)) : 0
}

function formatMeters(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(1)} m` : '-'
}

function formatChartTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(5, 16)
}

watch(
  () => route.query.view,
  (view) => {
    if (!MODES.some((mode) => mode.key === view)) {
      router.replace({ query: { ...route.query, view: 'signals' } })
    }
  },
  { immediate: true }
)

</script>

<template>
  <section class="workspace-view insights-page">
    <header class="dashboard-header">
      <div><p class="page-kicker">数据分析</p><h2>运行分析</h2></div>
      <button class="secondary-button" type="button" :disabled="activeState.loading" @click="runQuery">
        <RefreshCw :size="16" aria-hidden="true" />刷新当前结果
      </button>
    </header>

    <nav class="insights-segments" aria-label="分析类型">
      <button v-for="mode in MODES" :key="mode.key" type="button" :class="{ active: activeMode === mode.key }" @click="setMode(mode.key)">
        {{ mode.label }}
      </button>
    </nav>

    <form class="glass-toolbar insights-filter-grid" @submit.prevent="runQuery">
      <template v-if="activeMode === 'signals'">
        <label><span>设备编号</span><input v-model="activeForm.nodeId" type="text" inputmode="numeric" pattern="[0-9]*" required /></label>
        <label><span>MAC</span><input v-model="activeForm.mac" maxlength="17" placeholder="AA:BB:CC:DD:EE:FF" required /></label>
      </template>
      <template v-else>
        <label><span>用户 ID</span><input v-model="activeForm.userId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>MAC</span><input v-model="activeForm.mac" maxlength="17" placeholder="AA:BB:CC:DD:EE:FF" /></label>
        <label><span>连接编号</span><input v-model="activeForm.sessionId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>设备编号</span><input v-model="activeForm.nodeId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>设备编码</span><input v-model="activeForm.deviceCode" maxlength="64" /></label>
      </template>

      <label><span>开始时间</span><input v-model="activeForm.startTime" type="datetime-local" required /></label>
      <label><span>结束时间</span><input v-model="activeForm.endTime" type="datetime-local" required /></label>

      <label v-if="activeMode === 'signals'">
        <span>采样数</span><input v-model.number="activeForm.sampleLimit" type="number" min="3" max="101" />
      </label>
      <label v-if="activeMode !== 'alerts-rules'">
        <span>分桶间隔</span>
        <select v-model.number="activeForm.bucketMinutes">
          <option v-for="value in activeMode === 'signals' ? [1, 5, 15, 30, 60] : [5, 15, 60, 360, 1440]" :key="value" :value="value">
            {{ value }} 分钟
          </option>
        </select>
      </label>
      <label v-if="activeMode !== 'signals'">
        <span>排名数量</span><input v-model.number="activeForm.topLimit" type="number" min="1" max="50" />
      </label>

      <div class="insights-filter-actions">
        <button type="submit" :disabled="activeState.loading"><Search :size="16" aria-hidden="true" />查询</button>
        <button class="secondary-button" type="button" :disabled="activeState.loading" @click="resetActiveForm">重置</button>
      </div>
    </form>

    <p v-if="activeState.error" class="alert error">{{ activeState.error }}</p>
    <StateBlock v-if="activeState.loading && !activeState.result" type="loading" :title="`正在加载${activeDefinition.title}`" />

    <template v-if="activeState.result">
      <section class="insights-summary-grid">
        <article v-for="item in summaryItems" :key="item[0]" class="glass-panel"><span>{{ item[0] }}</span><strong>{{ item[1] }}</strong></article>
      </section>

      <template v-if="activeMode === 'signals'">
        <AnalyticsChart title="RSSI 与距离趋势" :labels="trendLabels" :series="trendSeries" />
        <section class="analytics-notes glass-panel">
          <div><span>置信度</span><strong>{{ activeState.result.confidenceDescription || activeState.result.confidenceLevel || '-' }}</strong></div>
          <div><span>滤波 / 平滑</span><strong>{{ activeState.result.filterMethod || '-' }} / {{ activeState.result.smoothingMethod || '-' }}</strong></div>
          <div><span>距离范围</span><strong>{{ formatMeters(activeState.result.minimumDistanceMeters) }} ~ {{ formatMeters(activeState.result.maximumDistanceMeters) }}</strong></div>
          <p><strong>能力边界：</strong>{{ activeState.result.positioningCapability || '-' }}</p>
          <p><strong>限制：</strong>{{ activeState.result.limitation || '-' }}</p>
        </section>
      </template>

      <template v-else-if="activeMode === 'traffic'">
        <AnalyticsChart title="上下行流量趋势" :labels="trendLabels" :series="trendSeries" />
        <section class="analytics-ranking">
          <header><h3>流量排名</h3><label><span>排名维度</span><select v-model="trafficRankDimension"><option v-for="option in RANKING_OPTIONS" :key="option[0]" :value="option[0]">{{ option[1] }}</option></select></label></header>
          <AnalyticsChart :title="`${rankingLabel}排名`" :labels="rankingItems.map((item) => item.dimensionKey || '-')" :series="[{ name: '流量（MB）', type: 'bar', data: rankingItems.map((item) => bytesToMegabytes(item.totalBytes)) }]" />
        </section>
      </template>

      <template v-else>
        <AnalyticsChart title="告警与动作分布" :labels="alertDistribution.map((item) => item.label)" :series="[{ name: '数量', type: 'bar', data: alertDistribution.map((item) => item.count) }]" />
        <section class="glass-panel insights-result-table">
          <table><thead><tr><th>规则编码</th><th>命中</th><th>可执行</th><th>已抑制</th></tr></thead><tbody>
            <tr v-for="item in activeState.result.rules || []" :key="item.ruleCode"><td>{{ item.ruleCode || '-' }}</td><td>{{ item.hitCount }}</td><td>{{ item.actionableCount }}</td><td>{{ item.suppressedCount }}</td></tr>
          </tbody></table>
        </section>
      </template>
    </template>

    <StateBlock v-else-if="activeState.loaded && !activeState.loading && !activeState.error" title="当前条件没有分析数据" />
    <StateBlock v-else-if="!activeState.loading" title="等待分析查询" text="选择分析类型并填写真实筛选条件" />
  </section>
</template>
