<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  BarChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
])

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  labels: {
    type: Array,
    default: () => []
  },
  series: {
    type: Array,
    default: () => []
  },
  emptyText: {
    type: String,
    default: '暂无可绘制数据'
  }
})

const chartElement = ref(null)
let chart = null
let resizeObserver = null

function render() {
  if (!chart || !props.labels.length || !props.series.length) return

  chart.setOption({
    animationDuration: 260,
    aria: {
      enabled: true,
      description: `${props.title}，包含 ${props.labels.length} 个数据点`
    },
    color: ['#2fa896', '#d6a23d', '#45ad6a', '#dc5b5b', '#4c8bf5'],
    textStyle: { color: '#c5cfcc' },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: '#151a1c',
      borderColor: '#435054',
      textStyle: { color: '#edf3f1' }
    },
    legend: {
      type: 'scroll',
      top: 4,
      right: 8,
      left: 8,
      textStyle: { color: '#c5cfcc' }
    },
    grid: { left: 18, right: 18, top: 48, bottom: 38, containLabel: true },
    xAxis: {
      type: 'category',
      data: props.labels,
      axisLabel: { color: '#91a09d', hideOverlap: true },
      axisLine: { lineStyle: { color: '#435054' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#91a09d' },
      splitLine: { lineStyle: { color: '#303a3d' } }
    },
    series: props.series.map((item) => ({
      name: item.name,
      type: item.type || 'line',
      data: item.data || [],
      smooth: item.type !== 'bar',
      showSymbol: (item.data || []).length <= 40,
      symbolSize: 7,
      barMaxWidth: 34,
      areaStyle: item.area ? { opacity: 0.08 } : undefined,
      emphasis: { focus: 'series' }
    }))
  }, true)
}

async function initialize() {
  await nextTick()
  if (!chartElement.value || chart) return

  chart = echarts.init(chartElement.value, null, { renderer: 'canvas' })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartElement.value)
  render()
}

watch(
  () => [props.labels, props.series],
  () => {
    if (props.labels.length && props.series.length) {
      initialize().then(render)
    } else if (chart) {
      chart.clear()
    }
  },
  { deep: true }
)

onMounted(initialize)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <section class="analytics-chart glass-panel">
    <h3>{{ title }}</h3>
    <div v-show="labels.length && series.length" ref="chartElement" class="analytics-chart-canvas"></div>
    <div v-if="!labels.length || !series.length" class="analytics-chart-empty">{{ emptyText }}</div>
  </section>
</template>
