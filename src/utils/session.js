export function getToken() {
  return sessionStorage.getItem('token') || ''
}

export function parseTokenPayload() {
  const token = getToken()
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
  return Number(sessionStorage.getItem('role') ?? 2)
}

export function setSession(token, user = {}) {
  sessionStorage.setItem('token', token || '')
  syncSessionUser(user)
}

export function syncSessionUser(user = {}) {
  if (user.username !== undefined) sessionStorage.setItem('username', user.username || '')
  if (user.nickname !== undefined) sessionStorage.setItem('nickname', user.nickname || '')
  if (user.role !== undefined && user.role !== null) sessionStorage.setItem('role', String(user.role))
}

export function clearSession(reason = '登录状态已过期，请重新登录') {
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('username')
  sessionStorage.removeItem('nickname')
  sessionStorage.removeItem('role')
  sessionStorage.setItem('authMessage', reason)
}
