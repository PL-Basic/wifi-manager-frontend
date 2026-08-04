function readHeader(headers, name) {
  if (!headers) return ''

  if (typeof headers.get === 'function') {
    return headers.get(name) || ''
  }

  return headers[name] || headers[name.toLowerCase()] || ''
}

function readBackendMessage(response) {
  const message = response?.data?.message
  return typeof message === 'string' ? message.trim() : ''
}

function normalizeRetryAfter(headers) {
  const value = readHeader(headers, 'retry-after')
  return value ? String(value).trim() : ''
}

function hasStructuredResponseBody(response) {
  const body = response?.data
  return Boolean(body && typeof body === 'object')
}

// 页面不仅需要一段文字，还需要知道错误属于权限、冲突、限流还是服务故障。
export function getApiErrorInfo(error, fallback = '请求失败') {
  const response = error?.response
  const httpStatus = Number(response?.status) || 0
  const businessStatus = Number(response?.data?.code) || 0
  const status = httpStatus >= 200 && httpStatus < 300 && businessStatus !== 200
    ? businessStatus
    : httpStatus || businessStatus
  const backendMessage = readBackendMessage(response)
  const retryAfter = normalizeRetryAfter(response?.headers)

  if (error?.code === 'ERR_CANCELED') {
    return {
      status: 0,
      type: 'canceled',
      message: '请求已取消',
      retryable: false,
      retryAfter: ''
    }
  }

  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return {
      status: 0,
      type: 'timeout',
      message: '请求超时，Gateway 或下游服务响应过慢，请稍后重试',
      retryable: true,
      retryAfter: ''
    }
  }

  if (!response) {
    // 业务代码主动抛出的 Error 应保留原始说明；Axios 网络错误才显示离线文案。
    if (error instanceof Error && !error?.isAxiosError && error.message) {
      return {
        status: 0,
        type: 'business',
        message: error.message,
        retryable: false,
        retryAfter: ''
      }
    }

    return {
      status: 0,
      type: 'offline',
      message: '无法连接服务，请检查 Gateway 和相关服务是否正在运行',
      retryable: true,
      retryAfter: ''
    }
  }

  if (status === 400) {
    return { status, type: 'validation', message: backendMessage || '请求参数不正确', retryable: false, retryAfter }
  }

  if (status === 401) {
    return { status, type: 'authentication', message: backendMessage || '登录状态无效，请重新登录', retryable: false, retryAfter }
  }

  if (status === 403) {
    return { status, type: 'permission', message: backendMessage || '当前账号没有权限执行该操作', retryable: false, retryAfter }
  }

  if (status === 409) {
    return { status, type: 'conflict', message: backendMessage || '当前状态发生冲突，请刷新后重试', retryable: true, retryAfter }
  }

  if (status === 429) {
    const message = backendMessage || '请求过于频繁'
    return {
      status,
      type: 'rate-limit',
      message: retryAfter ? `${message}，请在 ${retryAfter} 秒后重试` : message,
      retryable: true,
      retryAfter
    }
  }

  if (status === 500 && !hasStructuredResponseBody(response)) {
    return {
      status,
      type: 'server',
      message: `${fallback}：服务器返回 500，但未提供错误详情`,
      retryable: true,
      retryAfter
    }
  }

  if ([502, 503, 504].includes(status)) {
    return {
      status,
      type: 'service-unavailable',
      message: backendMessage || `${fallback}：Gateway 已连接，但下游服务暂时不可用`,
      retryable: true,
      retryAfter
    }
  }

  if (status >= 500) {
    return {
      status,
      type: 'server',
      message: backendMessage || `${fallback}：服务器处理失败，请稍后重试`,
      retryable: true,
      retryAfter
    }
  }

  return {
    status,
    type: 'unknown',
    message: backendMessage || error?.message || fallback,
    retryable: false,
    retryAfter
  }
}

export function getApiErrorMessage(error, fallback = '请求失败') {
  return getApiErrorInfo(error, fallback).message
}
