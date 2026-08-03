// 前端只允许调用后端明确支持的三个 OAuth Provider。
import githubLogo from '@/assets/oauth/github.svg'
import qqLogo from '@/assets/oauth/qq.svg'
import wechatLogo from '@/assets/oauth/wechat.svg'

export const OAUTH_PROVIDERS = Object.freeze([
    Object.freeze({ code: 'github', label: 'GitHub', logo: githubLogo }),
    Object.freeze({ code: 'qq', label: 'QQ', logo: qqLogo }),
    Object.freeze({ code: 'wechat', label: '微信', logo: wechatLogo })
])

export function mergeOAuthAvailability(items) {
    const availability = new Map(
        (Array.isArray(items) ? items : []).map((item) => [
            normalizeOAuthProvider(item?.provider),
            item
        ])
    )

    return OAUTH_PROVIDERS.map((provider) => {
        const remote = availability.get(provider.code)
        return {
            ...provider,
            label: remote?.displayName || provider.label,
            configured: remote?.configured === true
        }
    })
}

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
