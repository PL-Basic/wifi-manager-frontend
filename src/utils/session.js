export function parseTokenPayload() {
  const token = localStorage.getItem('token') || ''
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

export function syncSessionUser(user = {}) {
  if (user.username !== undefined) localStorage.setItem('username', user.username || '')
  if (user.nickname !== undefined) localStorage.setItem('nickname', user.nickname || '')
  if (user.role !== undefined && user.role !== null) localStorage.setItem('role', String(user.role))
}

export function clearSession(reason = '登录状态已过期，请重新登录') {
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  localStorage.removeItem('nickname')
  localStorage.removeItem('role')
  sessionStorage.setItem('authMessage', reason)
}
