export function formatMoney(value) {
  const cents = Number(value)
  return Number.isFinite(cents) ? `¥${(cents / 100).toFixed(2)}` : '-'
}

export function formatDuration(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return '-'

  const hours = seconds / 3600
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} 小时`

  const days = hours / 24
  return `${days.toFixed(days < 10 ? 1 : 0)} 天`
}

export function formatDateTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

export function entitlementModeLabel(value) {
  if (value === 'DURATION') return '时长权益'
  if (value === 'SUBSCRIPTION') return '订阅权益'
  return value || '-'
}

export function entitlementStatusLabel(value) {
  return Number(value) === 1 ? '可用' : '停用'
}
