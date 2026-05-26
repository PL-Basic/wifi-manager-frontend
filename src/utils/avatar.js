export function validateAvatarFile(file) {
  if (!file) return false
  return true
}

export function resolveAvatarUrl(url) {
  if (!url) return ''
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  if (url.startsWith('/api/')) return url
  if (url.startsWith('/')) return `/api${url}`
  return url
}
