import axios, { AxiosError } from 'axios'
import { API_BASE_URL } from '@/config/runtime'
import {
  clearSession,
  getClientInstanceId,
  getToken,
  isTokenExpired
} from '@/utils/session'
import {
  RefreshStepUpRequiredError,
  ensureAccessSession
} from '@/utils/sessionRefresh'
import { reportApiConnectivity } from '@/utils/connectivity'

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true
})

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
    body.message || '业务请求失败',
    'ERR_BAD_RESPONSE',
    response.config,
    response.request,
    response
  )
}

function failureStatus(error) {
  const httpStatus = Number(error.response?.status) || 0
  const businessStatus = Number(error.response?.data?.code) || 0
  return httpStatus >= 200 && httpStatus < 300 && businessStatus !== 200
    ? businessStatus
    : httpStatus || businessStatus
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

  const status = failureStatus(error)
  if (isRequestTimeout(error)) {
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
    reportApiConnectivity({
      status: 'degraded',
      message: error.response?.data?.message || '服务暂时不可用'
    })
  } else {
    reportApiConnectivity({ status: 'online', message: '' })
  }

  if (status === 403) {
    sessionStorage.setItem('authMessage', '当前账号没有权限执行该操作')
  }
}

function expireBrowserSession(error) {
  clearSession(error?.response?.data?.message || '登录状态已过期，请重新登录')
  redirectToLogin()
}

async function processResponseFailure(error) {
  const status = failureStatus(error)
  const config = error.config || {}
  const protectedRequest = !isPublicAuthRequest(config)

  if (status === 401 && protectedRequest && !config.wifiRetriedAfterRefresh) {
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
        headers: {
          ...config.headers,
          Authorization: `Bearer ${session.token}`,
          'X-Client-Instance-Id': getClientInstanceId()
        }
      }
      return http.request(nextConfig)
    } catch (refreshError) {
      reportFailure(refreshError)
      if (failureStatus(refreshError) === 401) {
        expireBrowserSession(refreshError)
      }
      return Promise.reject(refreshError)
    }
  }

  reportFailure(error)
  if (status === 401 && protectedRequest) {
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
  return config
})

http.interceptors.response.use(
  (response) => {
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
