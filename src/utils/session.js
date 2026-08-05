const AUTH_KEYS = ['token', 'username', 'nickname', 'avatar', 'role', 'tenantContext']
const AUTH_EVENT_KEY = 'authEvent'
const LOCAL_SESSION_SYNC_EVENT = 'wifi:session-sync'
const CLIENT_INSTANCE_KEY = 'wifi:client-instance-id:v1'

function emitAuthEvent(type) {
  const detail = { type, time: Date.now() }

  // 登录页本身负责跳转；其他状态变化还需要通知当前应用壳。
  localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify(detail))
  if (type !== 'login') {
    window.dispatchEvent(new CustomEvent(LOCAL_SESSION_SYNC_EVENT, { detail }))
  }
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function cleanNullableId(value) {
  const normalized = cleanText(value)
  return normalized || ''
}

export function normalizeTenantContext(value) {
  if (!value?.contextType) return null

  return {
    contextType: cleanText(value.contextType),
    tenantId: cleanNullableId(value.tenantId),
    tenantCode: cleanText(value.tenantCode),
    tenantName: cleanText(value.tenantName),
    tenantRole: cleanText(value.tenantRole),
    contextVersion: value.contextVersion ?? null,
    memberContextVersion: value.memberContextVersion ?? null,
    tenantStatus: cleanText(value.tenantStatus),
    writable: value.writable === true,
    authorities: Array.isArray(value.authorities)
      ? [...new Set(value.authorities.map(cleanText).filter(Boolean))]
      : []
  }
}

export function getToken() {
  return localStorage.getItem('token') || ''
}

export function parseTokenPayload(token = getToken()) {
  try {
    const payload = String(token || '').split('.')[1]
    if (!payload) return null

    const base64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))

    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

function contextFromToken(token = getToken()) {
  const payload = parseTokenPayload(token)
  if (!payload?.contextType) return null

  return normalizeTenantContext({
    contextType: payload.contextType,
    tenantId: payload.tenantId,
    tenantCode: payload.tenantCode,
    tenantRole: payload.tenantRole,
    contextVersion: payload.contextVersion,
    memberContextVersion: payload.memberContextVersion,
    authorities: payload.authorities
  })
}

export function isTokenExpired(token = getToken(), clockSkewMillis = 0) {
  const payload = parseTokenPayload(token)
  if (!payload?.exp) return false
  return payload.exp * 1000 <= Date.now() + Math.max(0, clockSkewMillis)
}

export function getStoredRole() {
  return Number(localStorage.getItem('role') ?? 2)
}

export function getStoredUsername() {
  return localStorage.getItem('username') || ''
}

export function getStoredDisplayName() {
  return localStorage.getItem('nickname') || getStoredUsername()
}

export function getStoredAvatar() {
  return localStorage.getItem('avatar') || ''
}

export function getStoredTenantContext() {
  try {
    const stored = JSON.parse(localStorage.getItem('tenantContext') || 'null')
    return normalizeTenantContext(stored) || contextFromToken()
  } catch {
    return contextFromToken()
  }
}

export function getSessionSnapshot() {
  return {
    token: getToken(),
    username: getStoredUsername(),
    nickname: localStorage.getItem('nickname') || '',
    avatar: getStoredAvatar(),
    role: getStoredRole(),
    context: getStoredTenantContext()
  }
}

export function getClientInstanceId() {
  let value = localStorage.getItem(CLIENT_INSTANCE_KEY)
  if (value) return value

  // 该标识不是认证凭据，只用于同一浏览器会话的弱风险识别。
  value = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(CLIENT_INSTANCE_KEY, value)
  return value
}

export function setSession(tokenOrAuth, user = {}, eventType = 'login') {
  const auth = typeof tokenOrAuth === 'object' && tokenOrAuth !== null
    ? tokenOrAuth
    : { ...user, token: tokenOrAuth }
  const token = cleanText(auth.token)
  const payload = parseTokenPayload(token)
  const context = normalizeTenantContext(auth.context) || contextFromToken(token)

  localStorage.setItem('token', token)
  syncSessionUser({
    ...auth,
    role: auth.role ?? payload?.role,
    context
  }, false)
  emitAuthEvent(eventType)
}

export function syncSessionUser(user = {}, emit = true) {
  if (user.username !== undefined) {
    localStorage.setItem('username', user.username || '')
  }

  if (user.nickname !== undefined) {
    localStorage.setItem('nickname', user.nickname || '')
  }

  if (user.avatar !== undefined) {
    localStorage.setItem('avatar', user.avatar || '')
  }

  if (user.role !== undefined && user.role !== null) {
    localStorage.setItem('role', String(user.role))
  }

  if (Object.prototype.hasOwnProperty.call(user, 'context')) {
    const context = normalizeTenantContext(user.context)
    if (context) {
      localStorage.setItem('tenantContext', JSON.stringify(context))
    } else {
      localStorage.removeItem('tenantContext')
    }
  }

  if (emit) emitAuthEvent('sync')
}

export function clearSession(reason = '登录状态已过期，请重新登录', emit = true, messageType = 'error') {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key))

  if (reason) {
    sessionStorage.setItem('authMessage', reason)
    sessionStorage.setItem('authMessageType', messageType)
  } else {
    sessionStorage.removeItem('authMessage')
    sessionStorage.removeItem('authMessageType')
  }

  if (emit) emitAuthEvent('logout')
}

export function onSessionChange(callback) {
  const storageHandler = (event) => {
    if (event.key !== AUTH_EVENT_KEY) return

    try {
      callback(JSON.parse(event.newValue || '{}'))
    } catch {
      callback({ type: 'sync', time: Date.now() })
    }
  }

  const localHandler = (event) => {
    callback(event.detail || { type: 'sync', time: Date.now() })
  }

  window.addEventListener('storage', storageHandler)
  window.addEventListener(LOCAL_SESSION_SYNC_EVENT, localHandler)

  return () => {
    window.removeEventListener('storage', storageHandler)
    window.removeEventListener(LOCAL_SESSION_SYNC_EVENT, localHandler)
  }
}
