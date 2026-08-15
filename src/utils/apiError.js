function readHeader(headers, name) {
  if (!headers) return ''

  if (typeof headers.get === 'function') {
    return headers.get(name) || ''
  }

  const matchingName = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase()
  )
  return matchingName ? headers[matchingName] : ''
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
const ERROR_KEY_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/
const MAX_MESSAGE_LENGTH = 300

const ERROR_TYPE_BY_KEY = Object.freeze({
  VALIDATION_FAILED: 'validation',
  MALFORMED_REQUEST: 'validation',
  AUTHENTICATION_REQUIRED: 'authentication',
  SESSION_EXPIRED: 'authentication',
  PERMISSION_DENIED: 'permission',
  RESOURCE_NOT_FOUND: 'not-found',
  RESOURCE_VERSION_CONFLICT: 'conflict',
  IDEMPOTENCY_KEY_CONFLICT: 'conflict',
  RATE_LIMITED: 'rate-limit',
  DEPENDENCY_UNAVAILABLE: 'service-unavailable',
  DEPENDENCY_PROTOCOL_INVALID: 'protocol-invalid',
  PAYMENT_CHANNEL_UNAVAILABLE: 'service-unavailable',
  AI_PROVIDER_UNAVAILABLE: 'service-unavailable',
  AI_RESPONSE_INVALID: 'protocol-invalid',
  INTERNAL_ERROR: 'server'
})

const UNSAFE_MESSAGE_PATTERNS = [
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/,
  /\bbearer\s+\S+/i,
  /(?:authorization|cookie|set-cookie|password|secret|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token)\s*[:=]\s*\S+/i,
  /\b(?:java|org|com)\.[A-Za-z0-9_.$]+(?:Exception|Error)\b/,
  /(?:^|\s)at\s+[A-Za-z0-9_.$<>]+\([^)]*:\d+(?::\d+)?\)/,
  /\b(?:select|insert|update|delete)\b[\s\S]*\b(?:from|into|set)\b/i
]

function normalizeStatus(value) {
  const status = Number(value)
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0
}

function responseStatus(response) {
  const httpStatus = normalizeStatus(response?.status)
  const businessStatus = normalizeStatus(response?.data?.code)
  return httpStatus >= 200 && httpStatus < 300 && businessStatus !== 200
    ? businessStatus
    : httpStatus || businessStatus
}

function readErrorKey(response) {
  const errorKey = response?.data?.errorKey
  if (typeof errorKey !== 'string') return ''

  const normalized = errorKey.trim()
  return ERROR_KEY_PATTERN.test(normalized) ? normalized : ''
}

function isSafeDisplayMessage(message) {
  return Boolean(
    message
    && message.length <= MAX_MESSAGE_LENGTH
    && !UNSAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  )
}

function readBackendMessage(response) {
  const message = response?.data?.message
  if (typeof message !== 'string') return ''

  const normalized = message.trim()
  return isSafeDisplayMessage(normalized) ? normalized : ''
}

function normalizeRetryAfter(headers) {
  const rawValue = readHeader(headers, 'retry-after')
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') return ''

  const value = String(rawValue).trim()
  if (!/^\d+$/.test(value)) return ''

  const seconds = Number(value)
  return Number.isSafeInteger(seconds) ? String(seconds) : ''
}

function readRequestId(response) {
  const bodyRequestId = response?.data?.requestId
  if (typeof bodyRequestId === 'string' && REQUEST_ID_PATTERN.test(bodyRequestId)) {
    return bodyRequestId
  }

  const headerRequestId = readHeader(response?.headers, 'x-request-id')
  return typeof headerRequestId === 'string' && REQUEST_ID_PATTERN.test(headerRequestId)
    ? headerRequestId
    : ''
}

function fallbackType(status) {
  if (status === 400) return 'validation'
  if (status === 401) return 'authentication'
  if (status === 403) return 'permission'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate-limit'
  if (status === 502) return 'protocol-invalid'
  if ([503, 504].includes(status)) return 'service-unavailable'
  if (status >= 500) return 'server'
  return 'unknown'
}

function defaultMessage(type, fallback) {
  const messages = {
    validation: '请求参数不正确',
    authentication: '登录状态无效，请重新登录',
    permission: '当前账号没有权限执行该操作',
    'not-found': '请求的内容不存在',
    conflict: '当前状态发生冲突，请刷新后重试',
    'rate-limit': '请求过于频繁',
    'protocol-invalid': `${fallback}：相关功能返回了无效响应`,
    'service-unavailable': `${fallback}：部分相关功能暂时不可用`,
    server: `${fallback}：服务器处理失败，请稍后重试`
  }
  return messages[type] || fallback
}

function isRetryable(type) {
  return [
    'conflict',
    'rate-limit',
    'protocol-invalid',
    'service-unavailable',
    'server',
    'timeout',
    'offline'
  ].includes(type)
}

const TECHNICAL_MESSAGE_REPLACEMENTS = [
  [/TRUSTED_TOKEN_MISMATCH/gi, '请求来源验证失败'],
  [/Refresh Session/gi, '登录状态'],
  [/Refresh Token/gi, '登录凭据'],
  [/Refresh family/gi, '相关登录状态'],
  [/Access JWT/gi, '登录凭据'],
  [/\bJWT\b/gi, '登录凭据'],
  [/\bToken\b/gi, '登录凭据'],
  [/租户上下文/g, '当前组织信息'],
  [/平台上下文/g, '系统管理模式'],
  [/上下文/g, '工作范围'],
  [/租户/g, '组织'],
  [/Gateway/g, '服务入口'],
  [/下游服务/g, '相关功能'],
  [/tenant-service/gi, '组织服务']
]

export function toUserFacingMessage(value) {
  const source = String(value || '').trim()
  if (!isSafeDisplayMessage(source)) return ''

  const replaced = TECHNICAL_MESSAGE_REPLACEMENTS.reduce(
    (message, [pattern, replacement]) => message.replace(pattern, replacement),
    source
  )

  // 后端中英文混排时常在技术词两侧留空格，替换后移除中文之间的多余空格。
  return replaced.replace(
    /([\u3400-\u9fff，。；：！？])\s+(?=[\u3400-\u9fff，。；：！？])/g,
    '$1'
  )
}

// 页面不仅需要一段文字，还需要知道错误属于权限、冲突、限流还是服务故障。
function getRawApiErrorInfo(error, fallback = '请求失败') {
  const response = error?.response
  const status = responseStatus(response)
  const errorKey = readErrorKey(response)
  const requestId = readRequestId(response)
  const backendMessage = readBackendMessage(response)
  const retryAfter = normalizeRetryAfter(response?.headers)
  const metadata = { errorKey, requestId }

  if (error?.code === 'ERR_CANCELED') {
    return {
      status: 0,
      type: 'canceled',
      message: '请求已取消',
      retryable: false,
      retryAfter: '',
      ...metadata
    }
  }

  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return {
      status: 0,
      type: 'timeout',
      message: '请求超时，服务响应较慢，请稍后重试',
      retryable: true,
      retryAfter: '',
      ...metadata
    }
  }

  if (!response) {
    // 业务代码主动抛出的 Error 应保留原始说明；Axios 网络错误才显示离线文案。
    if (error instanceof Error && !error?.isAxiosError && error.message) {
      const safeMessage = toUserFacingMessage(error.message)
      return {
        status: 0,
        type: 'business',
        message: safeMessage || fallback,
        retryable: false,
        retryAfter: '',
        ...metadata
      }
    }

    return {
      status: 0,
      type: 'offline',
      message: '无法连接服务，请检查网络连接后重试',
      retryable: true,
      retryAfter: '',
      ...metadata
    }
  }

  const type = ERROR_TYPE_BY_KEY[errorKey] || fallbackType(status)
  const baseMessage = backendMessage || defaultMessage(type, fallback)
  const message = type === 'rate-limit' && retryAfter
    ? `${baseMessage}，请在 ${retryAfter} 秒后重试`
    : baseMessage
  return {
    status,
    type,
    message,
    retryable: isRetryable(type),
    retryAfter,
    ...metadata
  }
}

export function getApiErrorInfo(error, fallback = '请求失败') {
  const info = getRawApiErrorInfo(error, fallback)
  return {
    ...info,
    message: toUserFacingMessage(info.message)
  }
}

export function getApiErrorMessage(error, fallback = '请求失败') {
  return getApiErrorInfo(error, fallback).message
}
