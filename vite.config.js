// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

function parsePort(value, fallback) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback
}

function parseAllowedHosts(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      // 以下配置只服务本地开发，不会进入 npm run build 生成的 dist。
      host: env.WIFI_DEV_HOST || '127.0.0.1',
      port: parsePort(env.WIFI_DEV_PORT, 5173),
      strictPort: true,
      allowedHosts: parseAllowedHosts(env.WIFI_DEV_ALLOWED_HOSTS),
      proxy: {
        '/api': {
          target: env.WIFI_DEV_GATEWAY_HTTP_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/ws': {
          target: env.WIFI_DEV_GATEWAY_WS_TARGET || 'ws://localhost:8080',
          ws: true,
          // 保留浏览器的真实 Origin，由后端白名单决定是否允许连接。
          changeOrigin: false
        }
      }
    }
  }
})
