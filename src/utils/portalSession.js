import { logoutMySession } from '@/api/sessions'
import { parseTokenPayload } from '@/utils/session'

const ACTIVE_PORTAL_SESSION_KEY = 'activePortalSession'

function normalizeSessionId(value) {
  const normalized = String(value ?? '').trim()
  return /^\d+$/.test(normalized) && normalized !== '0' ? normalized : ''
}

function currentUserId() {
  return String(parseTokenPayload()?.sub ?? '').trim()
}

export function rememberActivePortalSession(sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  const userId = currentUserId()
  if (!normalizedSessionId || !userId) return

  localStorage.setItem(ACTIVE_PORTAL_SESSION_KEY, JSON.stringify({
    sessionId: normalizedSessionId,
    userId
  }))
}

export function getActivePortalSessionId() {
  try {
    const stored = JSON.parse(localStorage.getItem(ACTIVE_PORTAL_SESSION_KEY) || '{}')
    const sessionId = normalizeSessionId(stored.sessionId)
    return sessionId && String(stored.userId ?? '') === currentUserId()
      ? sessionId
      : ''
  } catch {
    return ''
  }
}

export function forgetActivePortalSession(sessionId = '') {
  const expectedSessionId = normalizeSessionId(sessionId)
  if (expectedSessionId && getActivePortalSessionId() !== expectedSessionId) return
  localStorage.removeItem(ACTIVE_PORTAL_SESSION_KEY)
}

export async function revokeActivePortalSession(fallbackSessionId = '') {
  const sessionId = normalizeSessionId(fallbackSessionId) || getActivePortalSessionId()
  if (!sessionId) return false

  const response = await logoutMySession(sessionId)
  if (response.data?.code !== 200) {
    throw new Error(response.data?.message || '网络认证结束失败')
  }

  forgetActivePortalSession(sessionId)
  return true
}
