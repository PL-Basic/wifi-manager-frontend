<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MAP_ATTRIBUTION,
  MAP_PROVIDER,
  MAP_PROVIDER_CONFIGURED,
  MAP_TILE_URL
} from '@/config/runtime'
import { convertWgs84Positions, loadAmap } from '@/utils/amap'

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
const providerError = ref('')
let map = null
let locationLayer = null
let resizeObserver = null
let amapApi = null
let amapOverlays = []
let amapInfoWindow = null
let renderVersion = 0
let destroyed = false

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

function renderLeafletLocations() {
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

function clearAmapOverlays() {
  if (map && amapOverlays.length) map.remove(amapOverlays)
  amapOverlays = []
  amapInfoWindow?.close()
}

async function renderAmapLocations() {
  if (!map || !amapApi) return

  const version = ++renderVersion
  const points = validLocations.value
  clearAmapOverlays()

  if (!points.length) {
    map.setZoomAndCenter(4, [105, 35])
    return
  }

  try {
    const converted = await convertWgs84Positions(
      amapApi,
      points.map((point) => [point.lng, point.lat])
    )
    if (destroyed || version !== renderVersion) return

    const renderPoints = points.map((point, index) => ({
      point,
      position: converted[index]
    }))
    const chronological = [...renderPoints].reverse()

    if (chronological.length > 1) {
      amapOverlays.push(new amapApi.Polyline({
        path: chronological.map((item) => item.position),
        strokeColor: '#0891b2',
        strokeWeight: 4,
        strokeOpacity: 0.82
      }))
    }

    renderPoints.forEach(({ point, position }, index) => {
      const isLatest = index === 0

      if (point.accuracyValue > 0) {
        amapOverlays.push(new amapApi.Circle({
          center: position,
          radius: Math.min(point.accuracyValue, 1000),
          strokeColor: isLatest ? '#d97706' : '#0284c7',
          strokeWeight: 1,
          fillColor: isLatest ? '#f59e0b' : '#38bdf8',
          fillOpacity: 0.1
        }))
      }

      const marker = new amapApi.CircleMarker({
        center: position,
        radius: isLatest ? 8 : 5,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        fillColor: isLatest ? '#f59e0b' : '#0284c7',
        fillOpacity: 1,
        zIndex: isLatest ? 120 : 110
      })

      marker.on('mouseover', () => {
        if (!amapInfoWindow) {
          amapInfoWindow = new amapApi.InfoWindow({
            offset: new amapApi.Pixel(0, -8)
          })
        }
        amapInfoWindow.setContent(tooltipContent(point, isLatest))
        amapInfoWindow.open(map, position)
      })
      marker.on('mouseout', () => amapInfoWindow?.close())
      amapOverlays.push(marker)
    })

    map.add(amapOverlays)
    if (renderPoints.length === 1) {
      map.setZoomAndCenter(16, renderPoints[0].position)
    } else {
      map.setFitView(amapOverlays, false, [32, 32, 32, 32], 17)
    }
    providerError.value = ''
  } catch (error) {
    providerError.value = error?.message || '高德地图数据绘制失败'
  }
}

function renderLocations() {
  if (amapApi) {
    renderAmapLocations()
    return
  }
  renderLeafletLocations()
}

function initLeafletMap() {
  map = L.map(mapElement.value, {
    zoomControl: true,
    attributionControl: true
  })

  if (MAP_PROVIDER === 'xyz' && MAP_PROVIDER_CONFIGURED) {
    L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_ATTRIBUTION,
      maxZoom: 19
    })
      .on('tileload', () => {
        providerError.value = ''
      })
      .on('tileerror', () => {
        providerError.value = '地图底图加载失败，定位坐标仍已保留。请检查外网连接或地图服务配置。'
      })
      .addTo(map)
  }

  locationLayer = L.layerGroup().addTo(map)
  renderLeafletLocations()
}

onMounted(async () => {
  await nextTick()
  if (!mapElement.value) return

  if (MAP_PROVIDER === 'amap' && MAP_PROVIDER_CONFIGURED) {
    try {
      amapApi = await loadAmap()
      if (destroyed || !mapElement.value) return
      map = new amapApi.Map(mapElement.value, {
        viewMode: '2D',
        zoom: 4,
        center: [105, 35]
      })
      await renderAmapLocations()
    } catch (error) {
      providerError.value = error?.message || '高德地图 Provider 加载失败'
      amapApi = null
      if (!map && mapElement.value) initLeafletMap()
    }
  } else {
    initLeafletMap()
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (amapApi) map?.resize?.()
      else map?.invalidateSize?.()
    })
    resizeObserver.observe(mapElement.value)
  }
})

watch(validLocations, () => {
  nextTick(renderLocations)
}, { deep: true })

onBeforeUnmount(() => {
  destroyed = true
  renderVersion += 1
  resizeObserver?.disconnect()
  resizeObserver = null
  clearAmapOverlays()
  if (amapApi) map?.destroy?.()
  else map?.remove?.()
  map = null
  locationLayer = null
  amapApi = null
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
        <p v-if="!MAP_PROVIDER_CONFIGURED" class="map-provider-error map-provider-error--unconfigured">
          地图底图服务未配置，定位坐标、轨迹和精度范围仍可查看。
        </p>
        <p v-else-if="providerError" class="map-provider-error">{{ providerError }}</p>
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
