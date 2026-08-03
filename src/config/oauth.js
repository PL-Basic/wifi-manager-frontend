// 前端只允许调用后端明确支持的三个 OAuth Provider。
export const OAUTH_PROVIDERS = Object.freeze([
    Object.freeze({ code: 'github', label: 'GitHub' }),
    Object.freeze({ code: 'qq', label: 'QQ' }),
    Object.freeze({ code: 'wechat', label: '微信' })
])

const PROVIDER_CODES = new Set(
    OAUTH_PROVIDERS.map((provider) => provider.code)
)

// 路由参数和按钮传值都必须经过白名单校验。
export function normalizeOAuthProvider(value) {
    const provider = String(value || '').trim().toLowerCase()
    return PROVIDER_CODES.has(provider) ? provider : ''
}

export function getOAuthProvider(value) {
    const provider = normalizeOAuthProvider(value)
    return OAUTH_PROVIDERS.find((item) => item.code === provider) || null
}