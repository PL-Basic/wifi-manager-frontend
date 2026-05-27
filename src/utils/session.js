const AUTH_KEYS = ['token', 'username', 'nickname', 'role']
const AUTH_EVENT_KEY = 'authEvent'

function emitAuthEvent(type) {
  localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify({ type, time: Date.now() }))
}

export function getToken() {
  return localStorage.getItem('token') || ''
}

export function parseTokenPayload(token = getToken()) {
  try {
    return JSON.parse(atob(token.split('.')[1] || ''))
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
  if (user.username !== undefined) localStorage.setItem('username', user.username || '')
  if (user.nickname !== undefined) localStorage.setItem('nickname', user.nickname || '')
  if (user.role !== undefined && user.role !== null) localStorage.setItem('role', String(user.role))
  if (emit) emitAuthEvent('sync')
}

export function clearSession(reason = '登录状态已过期，请重新登录', emit = true) {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key))
  sessionStorage.setItem('authMessage', reason)
  if (emit) emitAuthEvent('logout')
}

export function onSessionChange(callback) {
  const handler = (event) => {
    if (event.key === AUTH_EVENT_KEY) callback()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
