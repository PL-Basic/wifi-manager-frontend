const AUTH_KEYS = ['token', 'username', 'nickname', 'role']
const AUTH_EVENT_KEY = 'authEvent'
const LOCAL_SESSION_SYNC_EVENT = 'wifi:session-sync'

function emitAuthEvent(type) {
  const detail = { type, time: Date.now() }

  // 写入 localStorage，让其他标签页收到 storage 事件。
  localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify(detail))

  // storage 事件不会通知当前标签页，因此资料更新时额外发送本地事件。
  // 登录和退出已有明确跳转逻辑，不在当前标签页重复通知。
  if (type === 'sync') {
    window.dispatchEvent(new CustomEvent(LOCAL_SESSION_SYNC_EVENT, {
      detail
    }))
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

export function isTokenExpired() {
  const payload = parseTokenPayload()
  if (!payload?.exp) return false
  return payload.exp * 1000 <= Date.now()
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

export function setSession(token, user = {}) {
  localStorage.setItem('token', token || '')
  syncSessionUser(user, false)
  emitAuthEvent('login')
}

export function syncSessionUser(user = {}, emit = true) {
  if (user.username !== undefined) {
    localStorage.setItem('username', user.username || '')
  }

  if (user.nickname !== undefined) {
    localStorage.setItem('nickname', user.nickname || '')
  }

  if (user.role !== undefined && user.role !== null) {
    localStorage.setItem('role', String(user.role))
  }

  if (emit) emitAuthEvent('sync')
}

export function clearSession(reason = '登录状态已过期，请重新登录', emit = true) {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key))
  sessionStorage.setItem('authMessage', reason)

  if (emit) emitAuthEvent('logout')
}

export function onSessionChange(callback) {
  // 处理其他标签页的登录、退出和资料更新。
  const storageHandler = (event) => {
    if (event.key === AUTH_EVENT_KEY) callback()
  }

  // 处理当前标签页自己的资料更新。
  const localHandler = () => {
    callback()
  }

  window.addEventListener('storage', storageHandler)
  window.addEventListener(LOCAL_SESSION_SYNC_EVENT, localHandler)

  return () => {
    window.removeEventListener('storage', storageHandler)
    window.removeEventListener(LOCAL_SESSION_SYNC_EVENT, localHandler)
  }
}
