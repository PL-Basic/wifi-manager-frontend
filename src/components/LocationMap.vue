<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '@/config/runtime'

const props = defineProps({
  locations: {
    type: Array,
    default: () => []
  },
  title: {
    type: String,
    default: '定位轨迹'
  }
})

const mapElement = ref(null)
const tileError = ref(false)
let map = null
let locationLayer = null
let resizeObserver = null

const validLocations = computed(() => props.locations
  .map((item) => ({
    ...item,
    lat: Number(item.latitude),
    lng: Number(item.longitude),
    accuracyValue: Number(item.accuracy || 0)
  }))
  .filter((item) => (
    Number.isFinite(item.lat)
    && Number.isFinite(item.lng)
    && item.lat >= -90
    && item.lat <= 90
    && item.lng >= -180
    && item.lng <= 180
  )))

const latest = computed(() => validLocations.value[0] || null)
const centerText = computed(() => latest.value
  ? `${latest.value.lat.toFixed(6)}, ${latest.value.lng.toFixed(6)}`
  : '暂无定位坐标')

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function tooltipContent(point, latestPoint) {
  const label = latestPoint ? '最新定位' : '历史定位'
  return [
    `<strong>${label}</strong>`,
    escapeHtml(formatTime(point.reportTime)),
    `精度 ${escapeHtml(point.accuracy ?? '-')} 米`,
    escapeHtml(point.mac || '-')
  ].join('<br>')
}

function renderLocations() {
  if (!map || !locationLayer) return

  locationLayer.clearLayers()
  const points = validLocations.value

  if (!points.length) {
    map.setView([35, 105], 4)
    return
  }

  const chronological = [...points].reverse()
  const latLngs = chronological.map((point) => [point.lat, point.lng])

  if (latLngs.length > 1) {
    L.polyline(latLngs, {
      color: '#0891b2',
      weight: 4,
      opacity: 0.82
    }).addTo(locationLayer)
  }

  points.forEach((point, index) => {
    const isLatest = index === 0
    const latLng = [point.lat, point.lng]

    if (point.accuracyValue > 0) {
      L.circle(latLng, {
        radius: Math.min(point.accuracyValue, 1000),
        color: isLatest ? '#d97706' : '#0284c7',
        fillColor: isLatest ? '#f59e0b' : '#38bdf8',
        fillOpacity: 0.1,
        weight: 1
      }).addTo(locationLayer)
    }

    L.circleMarker(latLng, {
      radius: isLatest ? 8 : 5,
      color: '#ffffff',
      fillColor: isLatest ? '#f59e0b' : '#0284c7',
      fillOpacity: 1,
      weight: 2
    })
      .bindTooltip(tooltipContent(point, isLatest))
      .addTo(locationLayer)
  })

  if (latLngs.length === 1) {
    map.setView(latLngs[0], 16)
  } else {
    map.fitBounds(L.latLngBounds(latLngs), {
      padding: [32, 32],
      maxZoom: 17
    })
  }
}

onMounted(async () => {
  await nextTick()
  if (!mapElement.value) return

  map = L.map(mapElement.value, {
    zoomControl: true,
    attributionControl: true
  })

  L.tileLayer(MAP_TILE_URL, {
    attribution: MAP_ATTRIBUTION,
    maxZoom: 19
  })
    .on('tileload', () => {
      tileError.value = false
    })
    .on('tileerror', () => {
      tileError.value = true
    })
    .addTo(map)

  locationLayer = L.layerGroup().addTo(map)
  renderLocations()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => map?.invalidateSize())
    resizeObserver.observe(mapElement.value)
  }
})

watch(validLocations, () => {
  nextTick(renderLocations)
}, { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
  locationLayer = null
})
</script>

<template>
  <section class="location-map glass-panel">
    <header class="location-map-header">
      <div>
        <p class="page-kicker">{{ title }}</p>
        <h3>{{ centerText }}</h3>
      </div>
      <span>{{ validLocations.length }} 个定位点</span>
    </header>

    <div class="location-map-body">
      <div class="map-canvas map-canvas--leaflet">
        <div ref="mapElement" class="leaflet-map" aria-label="GPS 定位地图"></div>
        <p v-if="tileError" class="map-provider-error">
          地图底图加载失败，定位坐标仍已保留。请检查外网连接或地图服务配置。
        </p>
        <div v-if="!validLocations.length" class="map-empty map-empty--overlay">
          完成一次手机定位上报后，当前位置和历史轨迹会显示在这里
        </div>
      </div>

      <aside class="map-details">
        <article v-if="latest" class="latest-location">
          <span>最新定位</span>
          <strong>{{ latest.mac || '-' }}</strong>
          <p>{{ formatTime(latest.reportTime) }}</p>
          <p>精度 {{ latest.accuracy || '-' }} 米 · {{ latest.source || '-' }}</p>
          <p>Session {{ latest.sessionId || '-' }} · 节点 {{ latest.nodeId || '-' }}</p>
        </article>
        <article v-else class="latest-location">
          <span>最新定位</span>
          <strong>尚未上报</strong>
          <p>地图不是定位来源。需要先由手机浏览器获取 GPS，再通过 ACTIVE Session 上报。</p>
        </article>

        <article class="bounds-card">
          <span>地图服务</span>
          <p>支持平移、缩放、精度范围和历史轨迹。</p>
          <p>正式部署可通过环境变量切换已授权的地图提供方。</p>
        </article>
      </aside>
    </div>
  </section>
</template>
