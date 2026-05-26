const MAX_AVATAR_SIZE = 2 * 1024 * 1024

export function validateAvatarFile(file) {
  if (!file) return false
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file')
  }
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error('Avatar image cannot exceed 2MB')
  }
  return true
}

export function resolveAvatarUrl(url) {
  if (!url) return ''
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  if (url.startsWith('/api/')) return url
  if (url.startsWith('/')) return `/api${url}`
  return url
}
