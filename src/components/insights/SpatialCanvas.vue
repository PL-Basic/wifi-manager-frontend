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
const providerError = ref('')
let map = null
let featureLayer = null
let resizeObserver = null
let amapApi = null
let amapOverlays = []
let amapInfoWindow = null
let renderVersion = 0
let destroyed = false

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

function addLeafletFeature(feature) {
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

function renderLeafletLayer() {
  if (!map || !featureLayer) return
  featureLayer.clearLayers()
  ;(props.layer?.features || []).forEach(addLeafletFeature)

  if (!positions.value.length) {
    map.setView([35, 105], 4)
    return
  }

  const allPoints = positions.value.map(latLng)
  if (allPoints.length === 1) map.setView(allPoints[0], 16)
  else map.fitBounds(L.latLngBounds(allPoints), { padding: [32, 32], maxZoom: 17 })
}

function featurePositions(feature) {
  if (feature?.type === 'point') {
    return validPosition(feature.coordinates) ? [feature.coordinates] : []
  }
  return (feature?.coordinates || []).filter(validPosition)
}

function clearAmapOverlays() {
  if (map && amapOverlays.length) map.remove(amapOverlays)
  amapOverlays = []
  amapInfoWindow?.close()
}

function bindAmapLabel(overlay, label, position) {
  if (!label) return
  overlay.on('mouseover', () => {
    if (!amapInfoWindow) {
      amapInfoWindow = new amapApi.InfoWindow({
        offset: new amapApi.Pixel(0, -8)
      })
    }
    amapInfoWindow.setContent(label)
    amapInfoWindow.open(map, position)
  })
  overlay.on('mouseout', () => amapInfoWindow?.close())
}

async function renderAmapLayer() {
  if (!map || !amapApi) return

  const version = ++renderVersion
  const descriptors = (props.layer?.features || [])
    .map((feature) => ({ feature, positions: featurePositions(feature) }))
    .filter((item) => item.positions.length)
  const sourcePositions = descriptors.flatMap((item) => item.positions)

  clearAmapOverlays()
  if (!sourcePositions.length) {
    map.setZoomAndCenter(4, [105, 35])
    return
  }

  try {
    const converted = await convertWgs84Positions(amapApi, sourcePositions)
    if (destroyed || version !== renderVersion) return

    let offset = 0
    descriptors.forEach(({ feature, positions: source }) => {
      const convertedPositions = converted.slice(offset, offset + source.length)
      offset += source.length

      const color = colorFor(feature.tone)
      const label = escapeHtml(feature.label || feature.id || '空间要素')
      let overlay = null

      if (feature.type === 'line' && convertedPositions.length > 1) {
        overlay = new amapApi.Polyline({
          path: convertedPositions,
          strokeColor: color,
          strokeWeight: 4,
          strokeOpacity: 0.85
        })
      } else if (feature.type === 'polygon' && convertedPositions.length > 2) {
        const weight = Number(feature.weight)
        overlay = new amapApi.Polygon({
          path: convertedPositions,
          strokeColor: color,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: Number.isFinite(weight)
            ? Math.min(0.72, Math.max(0.18, 0.18 + weight * 0.54))
            : 0.35
        })
      } else if (feature.type === 'point' && convertedPositions.length === 1) {
        const weight = Number(feature.weight)
        const radius = Number.isFinite(weight) && weight > 0
          ? Math.min(14, 6 + Math.log10(weight + 1) * 2)
          : 7
        overlay = new amapApi.CircleMarker({
          center: convertedPositions[0],
          radius,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: 0.92
        })
      }

      if (!overlay) return
      bindAmapLabel(overlay, label, convertedPositions[0])
      amapOverlays.push(overlay)
    })

    map.add(amapOverlays)
    if (converted.length === 1) {
      map.setZoomAndCenter(16, converted[0])
    } else {
      map.setFitView(amapOverlays, false, [32, 32, 32, 32], 17)
    }
    providerError.value = ''
  } catch (error) {
    providerError.value = error?.message || '高德地图空间图层绘制失败'
  }
}

function renderLayer() {
  if (amapApi) {
    renderAmapLayer()
    return
  }
  renderLeafletLayer()
}

function initLeafletMap() {
  map = L.map(mapElement.value)
  if (MAP_PROVIDER === 'xyz' && MAP_PROVIDER_CONFIGURED) {
    L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_ATTRIBUTION,
      maxZoom: 19
    })
      .on('tileload', () => { providerError.value = '' })
      .on('tileerror', () => {
        providerError.value = '地图底图加载失败，空间分析数据仍已保留。'
      })
      .addTo(map)
  }
  featureLayer = L.layerGroup().addTo(map)
  renderLeafletLayer()
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
      await renderAmapLayer()
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

watch(() => props.layer, () => nextTick(renderLayer), { deep: true })

onBeforeUnmount(() => {
  destroyed = true
  renderVersion += 1
  resizeObserver?.disconnect()
  clearAmapOverlays()
  if (amapApi) map?.destroy?.()
  else map?.remove?.()
  map = null
  featureLayer = null
  amapApi = null
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
      <p v-if="!MAP_PROVIDER_CONFIGURED" class="map-provider-error map-provider-error--unconfigured">地图底图服务未配置，真实空间分析图层仍可查看。</p>
      <p v-else-if="providerError" class="map-provider-error">{{ providerError }}</p>
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
