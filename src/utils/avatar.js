import { resolveApiAssetUrl } from '@/config/runtime'

const MAX_AVATAR_SIZE = 16 * 1024 * 1024

const AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])

export function validateAvatarFile(file) {
  if (!file) return false

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error('头像文件不能超过 16MB')
  }

  const supportedType = AVATAR_TYPES.has(file.type.toLowerCase())
  const supportedName = /\.(jpe?g|png|gif|webp)$/i.test(file.name)

  if (!supportedType && !supportedName) {
    throw new Error('只支持 jpg、jpeg、png、gif、webp 头像')
  }

  return true
}

export function resolveAvatarUrl(url) {
  if (!url) return ''
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  return resolveApiAssetUrl(url)
}
