<script setup>
import { computed, reactive, watch } from 'vue'
import { RefreshCw, Search } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import SpatialCanvas from '@/components/insights/SpatialCanvas.vue'
import {
  getGisHeatmap,
  getGisNodeCoverage,
  getGisStayPoints,
  getGisTrajectory
} from '@/api/insights'
import {
  heatmapLayer,
  nodeCoverageLayer,
  stayPointLayer,
  trajectoryLayer
} from '@/utils/geoLayers'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'
import './insights.css'

const route = useRoute()
const router = useRouter()
const requestGate = useRequestGate()

const MODES = [
  { key: 'trajectory', label: '移动轨迹', title: '连接期间的移动轨迹' },
  { key: 'stays', label: '停留点', title: '停留点分析' },
  { key: 'heatmap', label: '热力图', title: '位置热力网格' },
  { key: 'coverage', label: '设备覆盖', title: '设备覆盖范围' }
]

function datetimeLocal(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function defaultRange() {
  const end = new Date()
  const start = new Date(end.getTime() - 6 * 60 * 60 * 1000)
  return {
    startTime: datetimeLocal(start),
    endTime: datetimeLocal(end)
  }
}

const range = defaultRange()
const forms = reactive({
  trajectory: {
    sessionId: '',
    ...range,
    maximumAccuracyMeters: 100
  },
  stays: {
    sessionId: '',
    ...range,
    maximumAccuracyMeters: 100,
    radiusMeters: 50,
    minimumStaySeconds: 300
  },
  heatmap: {
    userId: '',
    sessionId: '',
    nodeId: '',
    mac: '',
    ...range,
    maximumAccuracyMeters: 100,
    gridSizeMeters: 50
  },
  coverage: {
    sessionId: '',
    ...range,
    maximumAccuracyMeters: 100,
    matchToleranceSeconds: 30
  }
})

const states = reactive(Object.fromEntries(
  MODES.map((mode) => [mode.key, {
    loading: false,
    loaded: false,
    error: '',
    result: null,
    layer: { coordinateSystem: 'WGS84', features: [] }
  }])
))
const appliedQueries = reactive(Object.fromEntries(
  MODES.map((mode) => [mode.key, null])
))

const activeMode = computed(() => (
  MODES.some((mode) => mode.key === route.query.view)
    ? route.query.view
    : 'trajectory'
))
const activeDefinition = computed(() => (
  MODES.find((mode) => mode.key === activeMode.value) || MODES[0]
))
const activeForm = computed(() => forms[activeMode.value])
const activeState = computed(() => states[activeMode.value])
const canRefresh = computed(() => Boolean(appliedQueries[activeMode.value]))
const hasResultData = computed(() => {
  const result = activeState.value.result
  if (!result) return false

  if (activeMode.value === 'trajectory') return Boolean(result.points?.length)
  if (activeMode.value === 'stays') return Boolean(result.stayPoints?.length)
  if (activeMode.value === 'heatmap') return Boolean(result.grids?.length)
  return Boolean(result.observations?.length)
})

const summaryItems = computed(() => {
  const result = activeState.value.result
  if (!result) return []

  if (activeMode.value === 'trajectory') {
    return [
      ['轨迹点', result.points?.length ?? 0],
      ['总距离', formatMeters(result.totalDistanceMeters)],
      ['持续时间', formatDuration(result.durationSeconds)],
      ['有效坐标', result.filterStats?.usedPointCount ?? 0]
    ]
  }

  if (activeMode.value === 'stays') {
    return [
      ['停留点', result.stayPoints?.length ?? 0],
      ['分析半径', formatMeters(result.radiusMeters)],
      ['最短停留', formatDuration(result.minimumStaySeconds)],
      ['有效坐标', result.filterStats?.usedPointCount ?? 0]
    ]
  }

  if (activeMode.value === 'heatmap') {
    return [
      ['热力网格', result.grids?.length ?? 0],
      ['聚合坐标', result.totalAggregatedPointCount ?? 0],
      ['最高网格点数', result.maximumCellPointCount ?? 0],
      ['网格尺寸', formatMeters(result.gridSizeMeters)]
    ]
  }

  return [
    ['匹配观测', result.matchedPointCount ?? 0],
    ['GPS 坐标', result.gpsPointCount ?? 0],
    ['RSSI 样本', result.rssiSampleCount ?? 0],
    ['平均绝对误差', formatMeters(result.averageAbsoluteErrorMeters)]
  ]
})

function setMode(mode) {
  if (mode === activeMode.value) return
  router.replace({ query: { ...route.query, view: mode } })
}

function readData(response, fallback) {
  const body = response?.data
  if (body?.code !== 200) {
    throw new Error(body?.message || fallback)
  }
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

function validateRange(form, maximumHours) {
  if (!form.startTime || !form.endTime) return '开始时间和结束时间不能为空'

  const start = new Date(form.startTime).getTime()
  const end = new Date(form.endTime).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '时间格式无效'
  if (end <= start) return '结束时间必须晚于开始时间'

  if (maximumHours && end - start > maximumHours * 60 * 60 * 1000) {
    return `当前查询范围不能超过 ${maximumHours} 小时`
  }

  return ''
}

function validateNumber(value, minimum, maximum, label) {
  const number = numberValue(value)
  if (number === undefined || number < minimum || number > maximum) {
    return `${label}必须在 ${minimum} 到 ${maximum} 之间`
  }
  return ''
}

function validateInteger(value, minimum, maximum, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    return `${label}必须是 ${minimum} 到 ${maximum} 之间的整数`
  }
  return ''
}

function validatePositiveId(value, label) {
  if (!/^[1-9]\d*$/.test(idValue(value))) {
    return `${label} 必须是大于 0 的整数`
  }
  return ''
}

function validateOptionalId(value, label) {
  if (!idValue(value)) return ''
  return validatePositiveId(value, label)
}

function validate(mode, form) {
  const rangeError = validateRange(form, mode === 'coverage' ? 24 : null)
  if (rangeError) return rangeError

  if (mode !== 'heatmap') {
    const sessionError = validatePositiveId(form.sessionId, '连接编号')
    if (sessionError) return sessionError
  }

  const accuracyError = validateNumber(
    form.maximumAccuracyMeters,
    1,
    1000,
    '最大定位误差'
  )
  if (accuracyError) return accuracyError

  if (mode === 'stays') {
    return validateInteger(form.radiusMeters, 5, 1000, '停留半径')
      || validateInteger(form.minimumStaySeconds, 60, 86400, '最短停留时间')
  }

  if (mode === 'heatmap') {
    for (const [key, label] of [['userId', '用户编号'], ['sessionId', '连接编号'], ['nodeId', '设备编号']]) {
      const idError = validateOptionalId(form[key], label)
      if (idError) return idError
    }
    const normalizedMac = form.mac.trim()
    if (normalizedMac && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(normalizedMac)) {
      return 'MAC 地址必须使用 AA:BB:CC:DD:EE:FF 格式'
    }
    if (!idValue(form.userId)
        && !idValue(form.sessionId)
        && !idValue(form.nodeId)
        && !normalizedMac) {
      return '用户编号、连接编号、设备编号或 MAC 至少填写一项'
    }
    return validateInteger(form.gridSizeMeters, 10, 1000, '网格尺寸')
  }

  if (mode === 'coverage') {
    return validateInteger(form.matchToleranceSeconds, 1, 300, '匹配容差')
  }

  return ''
}

function commonParams(form) {
  return {
    startTime: form.startTime,
    endTime: form.endTime,
    maximumAccuracyMeters: numberValue(form.maximumAccuracyMeters)
  }
}

function requestFor(mode, form) {
  const common = commonParams(form)

  if (mode === 'trajectory') {
    return getGisTrajectory({
      ...common,
      sessionId: idValue(form.sessionId)
    })
  }

  if (mode === 'stays') {
    return getGisStayPoints({
      ...common,
      sessionId: idValue(form.sessionId),
      radiusMeters: numberValue(form.radiusMeters),
      minimumStaySeconds: numberValue(form.minimumStaySeconds)
    })
  }

  if (mode === 'heatmap') {
    return getGisHeatmap({
      ...common,
      userId: optionalIdValue(form.userId),
      sessionId: optionalIdValue(form.sessionId),
      nodeId: optionalIdValue(form.nodeId),
      mac: form.mac.trim().toUpperCase() || undefined,
      gridSizeMeters: numberValue(form.gridSizeMeters)
    })
  }

  return getGisNodeCoverage({
    ...common,
    sessionId: idValue(form.sessionId),
    matchToleranceSeconds: numberValue(form.matchToleranceSeconds)
  })
}

function layerFor(mode, data) {
  if (mode === 'trajectory') return trajectoryLayer(data)
  if (mode === 'stays') return stayPointLayer(data)
  if (mode === 'heatmap') return heatmapLayer(data)
  return nodeCoverageLayer(data)
}

async function executeQuery(mode, queryForm, rememberOnSuccess) {
  const state = states[mode]
  const definition = MODES.find((item) => item.key === mode) || MODES[0]

  const version = requestGate.begin(mode)
  state.loading = true
  state.error = ''

  try {
    const data = readData(await requestFor(mode, queryForm), `${definition.title}查询失败`)
    if (!requestGate.isCurrent(version, mode)) return

    state.result = data
    state.layer = layerFor(mode, data)
    state.loaded = true
    if (rememberOnSuccess) appliedQueries[mode] = { ...queryForm }
  } catch (error) {
    if (!requestGate.isCurrent(version, mode)) return
    state.error = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, `${definition.title}查询失败`)
    state.loaded = true
  } finally {
    if (requestGate.isCurrent(version, mode)) state.loading = false
  }
}

function runQuery() {
  const mode = activeMode.value
  const queryForm = { ...forms[mode] }
  const validationError = validate(mode, queryForm)

  if (validationError) {
    requestGate.invalidate(mode)
    states[mode].loading = false
    states[mode].error = validationError
    return
  }

  executeQuery(mode, queryForm, true)
}

function refreshCurrentResult() {
  const mode = activeMode.value
  const appliedQuery = appliedQueries[mode]
  if (!appliedQuery || states[mode].loading) return

  executeQuery(mode, { ...appliedQuery }, false)
}

function resetActiveForm() {
  const freshRange = defaultRange()
  const mode = activeMode.value
  Object.assign(forms[mode], freshRange, {
    maximumAccuracyMeters: 100
  })

  if (mode !== 'heatmap') forms[mode].sessionId = ''
  if (mode === 'stays') {
    forms.stays.radiusMeters = 50
    forms.stays.minimumStaySeconds = 300
  } else if (mode === 'heatmap') {
    Object.assign(forms.heatmap, {
      userId: '', sessionId: '', nodeId: '', mac: '', gridSizeMeters: 50
    })
  } else if (mode === 'coverage') {
    forms.coverage.matchToleranceSeconds = 30
  }

  states[mode].error = ''
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

function formatMeters(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(number >= 100 ? 0 : 1)} m` : '-'
}

function formatDuration(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return '-'
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  return `${(seconds / 3600).toFixed(1)} 小时`
}

watch(
  () => route.query.view,
  (view) => {
    if (!MODES.some((mode) => mode.key === view)) {
      router.replace({ query: { ...route.query, view: 'trajectory' } })
    }
  },
  { immediate: true }
)

</script>

<template>
  <section class="workspace-view insights-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">数据分析</p>
        <h2>地图分析</h2>
      </div>
      <button
        class="secondary-button"
        type="button"
        :disabled="activeState.loading || !canRefresh"
        @click="refreshCurrentResult"
      >
        <RefreshCw :size="16" aria-hidden="true" />
        刷新当前结果
      </button>
    </header>

    <nav class="insights-segments" aria-label="地图分析类型">
      <button
        v-for="mode in MODES"
        :key="mode.key"
        type="button"
        :class="{ active: activeMode === mode.key }"
        @click="setMode(mode.key)"
      >
        {{ mode.label }}
      </button>
    </nav>

    <form class="glass-toolbar insights-filter-grid" @submit.prevent="runQuery">
      <label v-if="activeMode !== 'heatmap'">
        <span>连接编号</span>
        <input v-model="activeForm.sessionId" type="text" inputmode="numeric" pattern="[0-9]*" required />
      </label>

      <template v-if="activeMode === 'heatmap'">
        <label><span>用户 ID</span><input v-model="activeForm.userId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>连接编号</span><input v-model="activeForm.sessionId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>设备编号</span><input v-model="activeForm.nodeId" type="text" inputmode="numeric" pattern="[0-9]*" /></label>
        <label><span>MAC</span><input v-model="activeForm.mac" maxlength="17" placeholder="AA:BB:CC:DD:EE:FF" /></label>
      </template>

      <label>
        <span>开始时间</span>
        <input v-model="activeForm.startTime" type="datetime-local" required />
      </label>
      <label>
        <span>结束时间</span>
        <input v-model="activeForm.endTime" type="datetime-local" required />
      </label>
      <label>
        <span>最大定位误差（米）</span>
        <input v-model.number="activeForm.maximumAccuracyMeters" type="number" min="1" max="1000" />
      </label>

      <template v-if="activeMode === 'stays'">
        <label><span>停留半径（米）</span><input v-model.number="activeForm.radiusMeters" type="number" min="5" max="1000" /></label>
        <label><span>最短停留（秒）</span><input v-model.number="activeForm.minimumStaySeconds" type="number" min="60" max="86400" /></label>
      </template>

      <label v-if="activeMode === 'heatmap'">
        <span>网格尺寸（米）</span>
        <input v-model.number="activeForm.gridSizeMeters" type="number" min="10" max="1000" />
      </label>

      <label v-if="activeMode === 'coverage'">
        <span>匹配容差（秒）</span>
        <input v-model.number="activeForm.matchToleranceSeconds" type="number" min="1" max="300" />
      </label>

      <div class="insights-filter-actions">
        <button type="submit" :disabled="activeState.loading">
          <Search :size="16" aria-hidden="true" />
          查询
        </button>
        <button class="secondary-button" type="button" :disabled="activeState.loading" @click="resetActiveForm">
          重置
        </button>
      </div>
    </form>

    <p v-if="activeState.error" class="alert error">{{ activeState.error }}</p>

    <StateBlock
      v-if="activeState.loading && !activeState.result"
      type="loading"
      :title="`正在查询${activeDefinition.title}`"
    />

    <template v-if="hasResultData">
      <section class="insights-summary-grid">
        <article v-for="item in summaryItems" :key="item[0]" class="glass-panel">
          <span>{{ item[0] }}</span>
          <strong>{{ item[1] }}</strong>
        </article>
      </section>

      <SpatialCanvas :layer="activeState.layer" :title="activeDefinition.title" />

      <section class="glass-panel insights-result-table">
        <table v-if="activeMode === 'trajectory'">
          <thead><tr><th>序号</th><th>纬度</th><th>经度</th><th>精度</th><th>上报时间</th><th>距上一点</th></tr></thead>
          <tbody>
            <tr v-for="(item, index) in activeState.result.points || []" :key="item.locationId || index">
              <td>{{ index + 1 }}</td><td>{{ item.latitude }}</td><td>{{ item.longitude }}</td>
              <td>{{ formatMeters(item.accuracy) }}</td><td>{{ formatTime(item.reportTime) }}</td>
              <td>{{ formatMeters(item.distanceFromPreviousMeters) }}</td>
            </tr>
          </tbody>
        </table>

        <table v-else-if="activeMode === 'stays'">
          <thead><tr><th>停留点</th><th>中心坐标</th><th>到达</th><th>离开</th><th>持续时间</th><th>坐标数</th></tr></thead>
          <tbody>
            <tr v-for="item in activeState.result.stayPoints || []" :key="item.sequence">
              <td>{{ item.sequence }}</td><td>{{ item.centerLatitude }}, {{ item.centerLongitude }}</td>
              <td>{{ formatTime(item.arrivalTime) }}</td><td>{{ formatTime(item.departureTime) }}</td>
              <td>{{ formatDuration(item.durationSeconds) }}</td><td>{{ item.pointCount }}</td>
            </tr>
          </tbody>
        </table>

        <table v-else-if="activeMode === 'heatmap'">
          <thead><tr><th>网格</th><th>中心坐标</th><th>坐标数</th><th>权重</th><th>纬度范围</th><th>经度范围</th></tr></thead>
          <tbody>
            <tr v-for="item in activeState.result.grids || []" :key="item.gridKey">
              <td>{{ item.gridKey }}</td><td>{{ item.centerLatitude }}, {{ item.centerLongitude }}</td>
              <td>{{ item.pointCount }}</td><td>{{ item.weight }}</td>
              <td>{{ item.minimumLatitude }} ~ {{ item.maximumLatitude }}</td>
              <td>{{ item.minimumLongitude }} ~ {{ item.maximumLongitude }}</td>
            </tr>
          </tbody>
        </table>

        <table v-else>
          <thead><tr><th>定位时间</th><th>RSSI 时间</th><th>RSSI</th><th>实际距离</th><th>估算距离</th><th>绝对误差</th><th>置信度</th></tr></thead>
          <tbody>
            <tr v-for="item in activeState.result.observations || []" :key="`${item.locationId}-${item.signalId}`">
              <td>{{ formatTime(item.locationReportTime) }}</td><td>{{ formatTime(item.signalReportTime) }}</td>
              <td>{{ item.rssi }}</td><td>{{ formatMeters(item.actualDistanceMeters) }}</td>
              <td>{{ formatMeters(item.estimatedDistanceMeters) }}</td><td>{{ formatMeters(item.absoluteErrorMeters) }}</td>
              <td>{{ item.confidenceDescription || item.confidenceLevel || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <StateBlock
      v-else-if="activeState.loaded && !activeState.loading && !activeState.error"
      title="当前条件没有空间数据"
    />
    <StateBlock
      v-else-if="!activeState.loading"
      title="等待查询"
      text="填写连接编号、时间或设备条件后开始分析"
    />
  </section>
</template>
