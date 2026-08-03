function normalizeBaseUrl(value, fallback) {
  const normalized = String(value || fallback).trim()
  // 根路径使用空 baseURL，避免后续与 /users 等业务路径拼成 //users。
  if (normalized === '/') return ''
  if (!normalized) return fallback
  return normalized.replace(/\/+$/, '')
}

function normalizePath(value, fallback) {
  const normalized = String(value || fallback).trim()
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

// Vite 会在构建时写入 VITE_* 变量，正式部署推荐继续使用同源 /api。
export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  '/api'
)

// 后端头像返回的是业务路径，需要与 Axios 使用同一个 API 入口。
export function resolveApiAssetUrl(path) {
  const value = String(path || '').trim()
  if (!value || /^(https?:|data:|blob:)/i.test(value)) return value

  if (API_BASE_URL === '/api' && value.startsWith('/api/')) return value

  const businessPath = value.startsWith('/api/')
    ? value.slice('/api'.length)
    : normalizePath(value, '/')

  return `${API_BASE_URL}${businessPath}`
}

// 未显式配置完整地址时使用当前页面同源地址，HTTPS 会自动升级为 wss。
export function getAlertWebSocketUrl() {
  const configuredUrl = String(import.meta.env.VITE_ALERT_WS_URL || '').trim()
  if (configuredUrl) return configuredUrl

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const path = normalizePath(import.meta.env.VITE_ALERT_WS_PATH, '/ws/alerts')
  return `${protocol}//${window.location.host}${path}`
}

// 地图底图保持可配置，正式部署可替换为已获得授权的地图服务。
export const MAP_TILE_URL = String(
  import.meta.env.VITE_MAP_TILE_URL
  || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
).trim()

export const MAP_ATTRIBUTION = String(
  import.meta.env.VITE_MAP_ATTRIBUTION
  || '&copy; OpenStreetMap contributors'
).trim()
