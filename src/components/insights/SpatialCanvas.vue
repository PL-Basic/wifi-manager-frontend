<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '@/config/runtime'

const props = defineProps({
  layer: {
    type: Object,
    default: () => ({ coordinateSystem: 'WGS84', features: [] })
  },
  title: {
    type: String,
    default: '空间视图'
  }
})

const mapElement = ref(null)
const tileError = ref(false)
let map = null
let featureLayer = null
let resizeObserver = null

const positions = computed(() => {
  const result = []
  for (const feature of props.layer?.features || []) {
    if (feature.type === 'point') result.push(feature.coordinates)
    else result.push(...(feature.coordinates || []))
  }
  return result.filter(validPosition)
})

const bounds = computed(() => {
  if (!positions.value.length) return null
  const longitudes = positions.value.map((item) => Number(item[0]))
  const latitudes = positions.value.map((item) => Number(item[1]))
  return {
    minimumLongitude: Math.min(...longitudes),
    maximumLongitude: Math.max(...longitudes),
    minimumLatitude: Math.min(...latitudes),
    maximumLatitude: Math.max(...latitudes)
  }
})

function validPosition(value) {
  if (!Array.isArray(value) || value.length < 2) return false
  const longitude = Number(value[0])
  const latitude = Number(value[1])
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= -180 && longitude <= 180
    && latitude >= -90 && latitude <= 90
}

function latLng(value) {
  return [Number(value[1]), Number(value[0])]
}

function colorFor(tone) {
  if (tone === 'amber' || tone === 'heat') return '#d97706'
  if (tone === 'green') return '#16a34a'
  if (tone === 'muted') return '#64748b'
  return '#0891b2'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function addFeature(feature) {
  const color = colorFor(feature.tone)
  const label = escapeHtml(feature.label || feature.id || '空间要素')

  if (feature.type === 'line') {
    const points = (feature.coordinates || []).filter(validPosition).map(latLng)
    if (points.length > 1) {
      L.polyline(points, { color, weight: 4, opacity: 0.85 })
        .bindTooltip(label)
        .addTo(featureLayer)
    }
    return
  }

  if (feature.type === 'polygon') {
    const points = (feature.coordinates || []).filter(validPosition).map(latLng)
    if (points.length > 2) {
      const weight = Number(feature.weight)
      L.polygon(points, {
        color,
        fillColor: color,
        fillOpacity: Number.isFinite(weight)
          ? Math.min(0.72, Math.max(0.18, 0.18 + weight * 0.54))
          : 0.35,
        weight: 2
      }).bindTooltip(label).addTo(featureLayer)
    }
    return
  }

  if (!validPosition(feature.coordinates)) return
  const weight = Number(feature.weight)
  const radius = Number.isFinite(weight) && weight > 0
    ? Math.min(14, 6 + Math.log10(weight + 1) * 2)
    : 7
  L.circleMarker(latLng(feature.coordinates), {
    radius,
    color: '#ffffff',
    fillColor: color,
    fillOpacity: 0.92,
    weight: 2
  }).bindTooltip(label).addTo(featureLayer)
}

function renderLayer() {
  if (!map || !featureLayer) return
  featureLayer.clearLayers()
  ;(props.layer?.features || []).forEach(addFeature)

  if (!positions.value.length) {
    map.setView([35, 105], 4)
    return
  }

  const allPoints = positions.value.map(latLng)
  if (allPoints.length === 1) map.setView(allPoints[0], 16)
  else map.fitBounds(L.latLngBounds(allPoints), { padding: [32, 32], maxZoom: 17 })
}

onMounted(async () => {
  await nextTick()
  if (!mapElement.value) return
  map = L.map(mapElement.value)
  L.tileLayer(MAP_TILE_URL, {
    attribution: MAP_ATTRIBUTION,
    maxZoom: 19
  })
    .on('tileload', () => { tileError.value = false })
    .on('tileerror', () => { tileError.value = true })
    .addTo(map)
  featureLayer = L.layerGroup().addTo(map)
  renderLayer()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => map?.invalidateSize())
    resizeObserver.observe(mapElement.value)
  }
})

watch(() => props.layer, () => nextTick(renderLayer), { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.remove()
  map = null
  featureLayer = null
})
</script>

<template>
  <section class="spatial-panel glass-panel">
    <header class="spatial-header">
      <div><span>真实地图图层</span><h3>{{ title }}</h3></div>
      <strong>{{ layer?.coordinateSystem || 'WGS84' }}</strong>
    </header>

    <div class="spatial-stage spatial-stage--leaflet">
      <div ref="mapElement" class="spatial-leaflet-map" :aria-label="`${title}地图`"></div>
      <p v-if="tileError" class="map-provider-error">地图底图加载失败，空间分析数据仍已保留。</p>
      <div v-if="!positions.length" class="spatial-empty spatial-empty--overlay">
        <strong>暂无可绘制空间数据</strong>
        <span>完成查询后，这里会在真实地图上显示后端返回的空间图层。</span>
      </div>
    </div>

    <footer v-if="bounds" class="spatial-bounds">
      <span>经度 {{ bounds.minimumLongitude.toFixed(6) }} ~ {{ bounds.maximumLongitude.toFixed(6) }}</span>
      <span>纬度 {{ bounds.minimumLatitude.toFixed(6) }} ~ {{ bounds.maximumLatitude.toFixed(6) }}</span>
    </footer>
  </section>
</template>
