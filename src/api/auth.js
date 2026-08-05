import http from './http'
import { normalizeOAuthProvider } from '@/config/oauth'
import {
  completeRefreshStepUp,
  logoutSession
} from '@/utils/sessionRefresh'

function requireOAuthProvider(provider) {
  const normalized = normalizeOAuthProvider(provider)

  if (!normalized) {
    throw new Error('不支持的 OAuth Provider')
  }

  return normalized
}

export function register(data) {
  return http.post('/auth/register', data)
}

export function login(data) {
  return http.post('/auth/login', data)
}

export function sendVerifyCode(data) {
  return http.post('/auth/codes', data)
}

export function loginByVerifyCode(data) {
  return http.post('/auth/code-login', data)
}

export function resetPassword(data) {
  return http.post('/auth/reset-password', data)
}

export function getOAuthProviders() {
  return http.get('/auth/oauth/providers')
}

export function logout() {
  return logoutSession()
}

export function refreshAfterStepUp(data) {
  return completeRefreshStepUp(data)
}

export function sendAccountSwitchCode(data) {
  return http.post('/auth/account-switch/codes', data)
}

export function switchAccount(data) {
  return http.post('/auth/account-switch', data)
}

export function issueOperationToken(data) {
  return http.post('/auth/operation-tokens', data)
}

// 获取 Provider 授权地址，页面拿到 authorizationUrl 后再跳转。
export function startOAuthLogin(provider, returnUri) {
  const normalized = requireOAuthProvider(provider)

  return http.get(`/auth/oauth/${normalized}/authorize`, {
    params: returnUri ? { returnUri } : undefined
  })
}

// 已登录用户从账户安全页发起身份绑定。
export function startOAuthBind(provider, returnUri) {
  const normalized = requireOAuthProvider(provider)

  return http.get(`/auth/oauth/${normalized}/bind`, {
    params: returnUri ? { returnUri } : undefined
  })
}

// Provider 返回前端后，由回调页面把 state 和 code 交给后端完成处理。
export function completeOAuthCallback(provider, callbackParams) {
  const normalized = requireOAuthProvider(provider)

  return http.get(`/auth/oauth/${normalized}/callback`, {
    params: {
      state: callbackParams.state,
      code: callbackParams.code || undefined,
      error: callbackParams.error || undefined
    }
  })
}
