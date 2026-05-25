<script setup>
import { computed } from 'vue'

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

const validLocations = computed(() => props.locations
  .map((item) => ({
    ...item,
    lat: Number(item.latitude),
    lng: Number(item.longitude),
    accuracyValue: Number(item.accuracy || 0)
  }))
  .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)))

const bounds = computed(() => {
  if (validLocations.value.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }
  }
  const latitudes = validLocations.value.map((item) => item.lat)
  const longitudes = validLocations.value.map((item) => item.lng)
  return {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLng: Math.min(...longitudes),
    maxLng: Math.max(...longitudes)
  }
})

const points = computed(() => {
  const latSpan = bounds.value.maxLat - bounds.value.minLat || 0.0001
  const lngSpan = bounds.value.maxLng - bounds.value.minLng || 0.0001
  return validLocations.value.map((item, index) => {
    const x = 10 + ((item.lng - bounds.value.minLng) / lngSpan) * 80
    const y = 90 - ((item.lat - bounds.value.minLat) / latSpan) * 80
    return {
      ...item,
      index,
      x,
      y,
      radius: Math.max(5, Math.min(18, item.accuracyValue ? item.accuracyValue / 8 : 7))
    }
  })
})

const latest = computed(() => points.value[0] || null)
const path = computed(() => points.value.map((item) => `${item.x},${item.y}`).join(' '))
const centerText = computed(() => {
  if (!latest.value) return '暂无定位'
  return `${latest.value.lat.toFixed(6)}, ${latest.value.lng.toFixed(6)}`
})
const osmFrameUrl = computed(() => {
  if (!latest.value) return ''
  const delta = 0.01
  const left = latest.value.lng - delta
  const right = latest.value.lng + delta
  const bottom = latest.value.lat - delta
  const top = latest.value.lat + delta
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${latest.value.lat}%2C${latest.value.lng}`
})
const osmLink = computed(() => {
  if (!latest.value) return ''
  return `https://www.openstreetmap.org/?mlat=${latest.value.lat}&mlon=${latest.value.lng}#map=16/${latest.value.lat}/${latest.value.lng}`
})

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}
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
      <div class="map-canvas">
        <svg viewBox="0 0 100 100" role="img" aria-label="GPS 定位地图">
          <defs>
            <linearGradient id="trackGlow" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="#67e8f9" />
              <stop offset="100%" stop-color="#f59e0b" />
            </linearGradient>
          </defs>
          <g class="map-grid">
            <path d="M10 20 H90 M10 40 H90 M10 60 H90 M10 80 H90" />
            <path d="M20 10 V90 M40 10 V90 M60 10 V90 M80 10 V90" />
          </g>
          <polyline v-if="points.length > 1" class="map-track" :points="path" />
          <g v-for="point in points" :key="point.id || `${point.mac}-${point.index}`">
            <circle class="accuracy-ring" :cx="point.x" :cy="point.y" :r="point.radius" />
            <circle :class="['map-point', { latest: point.index === 0 }]" :cx="point.x" :cy="point.y" r="2.8" />
          </g>
        </svg>
        <div v-if="!points.length" class="map-empty">暂无可绘制坐标</div>
      </div>

      <aside class="map-details">
        <article v-if="latest" class="latest-location">
          <span>最新定位</span>
          <strong>{{ latest.mac || '-' }}</strong>
          <p>{{ formatTime(latest.reportTime) }}</p>
          <p>精度 {{ latest.accuracy || '-' }} 米 · {{ latest.source || '-' }}</p>
        </article>
        <article class="bounds-card">
          <span>范围</span>
          <p>纬度 {{ bounds.minLat.toFixed(6) }} ~ {{ bounds.maxLat.toFixed(6) }}</p>
          <p>经度 {{ bounds.minLng.toFixed(6) }} ~ {{ bounds.maxLng.toFixed(6) }}</p>
        </article>
      </aside>
    </div>

    <section v-if="latest" class="real-map-panel">
      <header>
        <div>
          <span>真实地图底图</span>
          <strong>OpenStreetMap</strong>
        </div>
        <a :href="osmLink" target="_blank" rel="noreferrer">打开地图</a>
      </header>
      <iframe :src="osmFrameUrl" title="真实地图定位" loading="lazy"></iframe>
    </section>
  </section>
</template>
