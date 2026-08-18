import axios, { AxiosError } from 'axios'
import { API_BASE_URL } from '@/config/runtime'
import {
  clearSession,
  getClientInstanceId,
  getContextRequestSnapshot,
  getToken,
  isContextEpochCurrent,
  isTokenExpired
} from '@/utils/session'
import {
  RefreshStepUpRequiredError,
  ensureAccessSession
} from '@/utils/sessionRefresh'
import { reportApiConnectivity } from '@/utils/connectivity'
import { getApiErrorInfo } from '@/utils/apiError'

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true
})

function combineAbortSignals(signals) {
  const activeSignals = signals.filter(Boolean)
  if (activeSignals.length <= 1) {
    return {
      signal: activeSignals[0],
      cleanup: () => {}
    }
  }

  const controller = new AbortController()
  const listeners = []
  const abort = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason)
  }

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal)
      break
    }
    const listener = () => abort(signal)
    signal.addEventListener('abort', listener, { once: true })
    listeners.push([signal, listener])
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      listeners.forEach(([signal, listener]) => {
        signal.removeEventListener('abort', listener)
      })
    }
  }
}

function bindRequestContext(config) {
  if (!Object.prototype.hasOwnProperty.call(config, 'wifiCallerSignal')) {
    config.wifiCallerSignal = config.signal || null
  }

  const context = getContextRequestSnapshot()
  const combined = combineAbortSignals([
    config.wifiCallerSignal,
    context.signal
  ])

  config.signal = combined.signal
  config.wifiContextEpoch = context.epoch
  config.wifiAbortCleanup = combined.cleanup
  return config
}

function cleanupRequestContext(config) {
  config?.wifiAbortCleanup?.()
  if (config) config.wifiAbortCleanup = null
}

function staleContextError(config) {
  return new axios.CanceledError(
    'Request context changed',
    config,
    null
  )
}

function isStaleRequestContext(config) {
  return Number.isInteger(config?.wifiContextEpoch)
    && !isContextEpochCurrent(config.wifiContextEpoch)
}

function requestPath(config) {
  return String(config?.url || '').split('?')[0]
}

function isPublicAuthRequest(config) {
  const path = requestPath(config)
  const publicAuthPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/codes',
    '/auth/code-login',
    '/auth/reset-password',
    '/auth/oauth/providers',
    '/auth/refresh',
    '/auth/refresh/step-up'
  ]

  if (publicAuthPaths.includes(path)) return true

  // OAuth 发起和回调允许未登录访问，身份绑定仍必须携带 Access JWT。
  return /^\/auth\/oauth\/(github|qq|wechat)\/(authorize|callback)$/.test(path)
}

function redirectToLogin() {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (currentPath.startsWith('/login')) return

  window.location.assign(`/login?redirect=${encodeURIComponent(currentPath)}`)
}

function rejectFailedEnvelope(response) {
  const body = response?.data
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response
  if (!Object.prototype.hasOwnProperty.call(body, 'code')) return response
  if (Number(body.code) === 200) return response

  throw new AxiosError(
    'API response reported failure',
    'ERR_BAD_RESPONSE',
    response.config,
    response.request,
    response
  )
}

function isRequestTimeout(error) {
  return error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT'
}

function reportFailure(error) {
  if (
    error?.code === 'ERR_CANCELED'
    || error?.message === 'token expired'
    || error instanceof RefreshStepUpRequiredError
  ) {
    return
  }

  const info = getApiErrorInfo(error)
  if (isRequestTimeout(error)) {
    reportApiConnectivity({
      status: 'degraded',
      message: '请求超时，服务响应较慢'
    })
  } else if (info.type === 'offline') {
    reportApiConnectivity({
      status: 'unreachable',
      message: '当前设备无法访问服务，请检查网络连接或服务地址'
    })
  } else if (info.status >= 500) {
    reportApiConnectivity({
      status: 'degraded',
      message: info.message || '服务暂时不可用'
    })
  } else {
    reportApiConnectivity({ status: 'online', message: '' })
  }

  if (info.type === 'permission') {
    sessionStorage.setItem('authMessage', '当前账号没有权限执行该操作')
  }
}

function expireBrowserSession(error) {
  const info = getApiErrorInfo(error, '登录状态已过期，请重新登录')
  clearSession(info.message || '登录状态已过期，请重新登录')
  redirectToLogin()
}

async function processResponseFailure(error) {
  cleanupRequestContext(error.config)
  if (isStaleRequestContext(error.config)) {
    return Promise.reject(staleContextError(error.config))
  }

  const info = getApiErrorInfo(error)
  const authenticationFailure = info.type === 'authentication'
  const config = error.config || {}
  const protectedRequest = !isPublicAuthRequest(config)

  if (authenticationFailure && protectedRequest && !config.wifiRetriedAfterRefresh) {
    const failedToken = String(config.headers?.Authorization || '')
      .replace(/^Bearer\s+/i, '')
      || getToken()

    try {
      const session = await ensureAccessSession({
        force: true,
        failedToken
      })
      const nextConfig = {
        ...config,
        wifiRetriedAfterRefresh: true,
        wifiContextEpoch: undefined,
        wifiAbortCleanup: null,
        signal: config.wifiCallerSignal || undefined,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${session.token}`,
          'X-Client-Instance-Id': getClientInstanceId()
        }
      }
      return http.request(nextConfig)
    } catch (refreshError) {
      reportFailure(refreshError)
      if (getApiErrorInfo(refreshError).type === 'authentication') {
        expireBrowserSession(refreshError)
      }
      return Promise.reject(refreshError)
    }
  }

  reportFailure(error)
  if (authenticationFailure && protectedRequest) {
    expireBrowserSession(error)
  }
  return Promise.reject(error)
}

http.interceptors.request.use(async (config) => {
  config.headers = config.headers || {}
  config.headers['X-Client-Instance-Id'] = getClientInstanceId()

  if (isPublicAuthRequest(config)) {
    delete config.headers.Authorization
    return config
  }

  let token = getToken()
  if (token && isTokenExpired(token)) {
    const session = await ensureAccessSession({
      force: true,
      failedToken: token
    })
    token = session.token
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return bindRequestContext(config)
})

http.interceptors.response.use(
  (response) => {
    cleanupRequestContext(response.config)
    if (isStaleRequestContext(response.config)) {
      return Promise.reject(staleContextError(response.config))
    }

    try {
      const accepted = rejectFailedEnvelope(response)
      reportApiConnectivity({ status: 'online', message: '' })
      return accepted
    } catch (error) {
      return processResponseFailure(error)
    }
  },
  processResponseFailure
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
