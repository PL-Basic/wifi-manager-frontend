const ACCOUNT_HISTORY_KEY = 'wifi:account-history:v1'
const MAX_HISTORY_SIZE = 6

function clean(value, maxLength = 255) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function normalizeContact(value) {
  const target = clean(value, 255)
  if (/^1[3-9]\d{9}$/.test(target)) return { type: 'phone', target }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return { type: 'email', target }
  return null
}

function normalizeAccount(value = {}) {
  const userId = clean(value.userId, 32)
  const username = clean(value.username, 64)
  if (!userId || !username) return null

  const contacts = [value.phone, value.email, ...(Array.isArray(value.contacts) ? value.contacts.map((item) => item?.target) : [])]
    .map(normalizeContact)
    .filter(Boolean)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.target === item.target) === index)

  return {
    userId,
    username,
    nickname: clean(value.nickname, 64),
    avatar: clean(value.avatar, 1024),
    contacts,
    lastUsedAt: Number(value.lastUsedAt) || Date.now()
  }
}

export function getAccountHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNT_HISTORY_KEY) || '[]')
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeAccount)
      .filter(Boolean)
      .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
      .slice(0, MAX_HISTORY_SIZE)
  } catch {
    return []
  }
}

export function rememberAccount(profile = {}) {
  const account = normalizeAccount({ ...profile, lastUsedAt: Date.now() })
  if (!account) return getAccountHistory()

  const history = getAccountHistory().filter((item) => item.userId !== account.userId)
  const next = [account, ...history].slice(0, MAX_HISTORY_SIZE)
  localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(next))
  return next
}

export function forgetAccount(userId) {
  const cleanUserId = clean(userId, 32)
  const next = getAccountHistory().filter((item) => item.userId !== cleanUserId)
  localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(next))
  return next
}

export function maskContact(target) {
  const value = clean(target, 255)
  if (/^1[3-9]\d{9}$/.test(value)) return `${value.slice(0, 3)}****${value.slice(-4)}`

  const at = value.indexOf('@')
  if (at > 0) {
    const name = value.slice(0, at)
    const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2)
    return `${visible}***${value.slice(at)}`
  }

  return value
}
