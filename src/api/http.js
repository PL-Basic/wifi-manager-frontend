import axios, { AxiosError } from 'axios'
import { API_BASE_URL } from '@/config/runtime'
import {
  clearSession,
  getToken,
  isTokenExpired
} from '@/utils/session'
import { reportApiConnectivity } from '@/utils/connectivity'

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
})

function isPublicAuthRequest(config) {
  const url = config?.url || ''
  const path = url.split('?')[0]

  const publicAuthPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/codes',
    '/auth/code-login',
    '/auth/reset-password',
    '/auth/oauth/providers'
  ]

  if (publicAuthPaths.includes(path)) return true

  // OAuth 发起和回调允许未登录访问，身份绑定仍必须携带 JWT。
  return /^\/auth\/oauth\/(github|qq|wechat)\/(authorize|callback)$/.test(path)
}

function redirectToLogin() {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const target = currentPath.startsWith('/login')
    ? '/login'
    : `/login?redirect=${encodeURIComponent(currentPath)}`

  window.location.assign(target)
}

function rejectFailedEnvelope(response) {
  const body = response?.data
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response
  if (!Object.prototype.hasOwnProperty.call(body, 'code')) return response
  if (Number(body.code) === 200) return response

  throw new AxiosError(
    body.message || '业务请求失败',
    'ERR_BAD_RESPONSE',
    response.config,
    response.request,
    response
  )
}

function isRequestTimeout(error) {
  return error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT'
}

function processResponseFailure(error) {
  // 主动取消和本地 Token 过期都不是服务离线，不能污染全局连接状态。
  if (error?.code === 'ERR_CANCELED' || error?.message === 'token expired') {
    return error
  }

  const httpStatus = Number(error.response?.status) || 0
  const businessStatus = Number(error.response?.data?.code) || 0
  const status = httpStatus >= 200 && httpStatus < 300 && businessStatus !== 200
    ? businessStatus
    : httpStatus || businessStatus

  if (isRequestTimeout(error)) {
    // Axios 超时无法证明 Gateway 已离线，也可能只是某个下游服务响应过慢。
    reportApiConnectivity({
      status: 'degraded',
      message: '请求超时，Gateway 或下游服务响应过慢'
    })
  } else if (!error.response) {
    reportApiConnectivity({
      status: 'unreachable',
      message: '当前设备无法访问服务，请检查网络连接或服务地址'
    })
  } else if (status >= 500) {
    // 已收到 HTTP 响应说明请求链路仍然可达。即使响应体为空，
    // 也只能判断 Gateway 或下游处理失败，不能误报 Gateway 离线。
    reportApiConnectivity({
      status: 'degraded',
      message: error.response?.data?.message || '服务暂时不可用'
    })
  } else {
    // 4xx 和普通业务错误说明 Gateway 可达，不能误报成服务离线。
    reportApiConnectivity({ status: 'online', message: '' })
  }

  if (status === 401 && !isPublicAuthRequest(error.config)) {
    clearSession('登录状态已过期，请重新登录')
    redirectToLogin()
  }

  if (status === 403) {
    sessionStorage.setItem('authMessage', '当前账号没有权限执行该操作')
  }

  return error
}

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    if (isTokenExpired()) {
      clearSession('登录状态已过期，请重新登录')
      redirectToLogin()
      return Promise.reject(new Error('token expired'))
    }
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    try {
      const accepted = rejectFailedEnvelope(response)
      reportApiConnectivity({ status: 'online', message: '' })
      return accepted
    } catch (error) {
      return Promise.reject(processResponseFailure(error))
    }
  },
  (error) => {
    return Promise.reject(processResponseFailure(error))
  }
)

export default http

// 独立探测 Gateway，避免下游服务故障污染入口可达性判断。
export async function probeApiConnectivity() {
  try {
    await http.get('/health/gateway', {
      timeout: 7000,
      wifiConnectivityProbe: true
    })
    return true
  } catch {
    return false
  }
}
