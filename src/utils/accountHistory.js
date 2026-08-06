const ACCOUNT_HISTORY_KEY = 'wifi:account-history:v2'
const LEGACY_ACCOUNT_HISTORY_KEY = 'wifi:account-history:v1'
const MAX_HISTORY_SIZE = 6

function clean(value, maxLength = 255) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function normalizeChannels(value = {}) {
  const configured = Array.isArray(value.channels) ? value.channels : []
  const legacy = Array.isArray(value.contacts)
    ? value.contacts.map((item) => item?.type)
    : []
  const channels = [
    ...configured,
    ...legacy,
    value.phone ? 'phone' : '',
    value.email ? 'email' : ''
  ]
  return [...new Set(channels.filter((item) => ['phone', 'email'].includes(item)))]
}

function normalizeAccount(value = {}) {
  const userId = clean(value.userId, 32)
  const username = clean(value.username, 64)
  if (!userId || !username) return null

  return {
    userId,
    username,
    nickname: clean(value.nickname, 64),
    avatar: clean(value.avatar, 1024),
    channels: normalizeChannels(value),
    lastUsedAt: Number(value.lastUsedAt) || Date.now()
  }
}

function readRawHistory() {
  const current = localStorage.getItem(ACCOUNT_HISTORY_KEY)
  if (current) return current

  // 读取旧记录时只迁移账号摘要和渠道类型，主动丢弃明文联系方式。
  const legacy = localStorage.getItem(LEGACY_ACCOUNT_HISTORY_KEY) || '[]'
  localStorage.removeItem(LEGACY_ACCOUNT_HISTORY_KEY)
  return legacy
}

export function getAccountHistory() {
  try {
    const parsed = JSON.parse(readRawHistory())
    const normalized = (Array.isArray(parsed) ? parsed : [])
      .map(normalizeAccount)
      .filter(Boolean)
      .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
      .slice(0, MAX_HISTORY_SIZE)
    localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(normalized))
    return normalized
  } catch {
    return []
  }
}

export function rememberAccount(profile = {}) {
  let account = normalizeAccount({ ...profile, lastUsedAt: Date.now() })
  if (!account) return getAccountHistory()

  const currentHistory = getAccountHistory()
  const previous = currentHistory.find((item) => item.userId === account.userId)
  if (!account.channels.length && previous?.channels?.length) {
    account = { ...account, channels: previous.channels }
  }
  const history = currentHistory.filter((item) => item.userId !== account.userId)
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
