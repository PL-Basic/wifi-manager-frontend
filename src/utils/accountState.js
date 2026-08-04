const PENDING_ACCOUNT_KEY = 'pendingAccountState'
export const TENANT_MEMBERSHIP_PENDING = 'TENANT_MEMBERSHIP_PENDING'

export function savePendingAccount(auth = {}, message = '') {
  const state = {
    accountState: TENANT_MEMBERSHIP_PENDING,
    username: String(auth.username || ''),
    nickname: String(auth.nickname || ''),
    message: String(message || '默认租户成员关系正在恢复'),
    createdAt: Date.now()
  }
  sessionStorage.setItem(PENDING_ACCOUNT_KEY, JSON.stringify(state))
  return state
}

export function getPendingAccount() {
  try {
    const state = JSON.parse(sessionStorage.getItem(PENDING_ACCOUNT_KEY) || 'null')
    return state?.accountState === TENANT_MEMBERSHIP_PENDING ? state : null
  } catch {
    return null
  }
}

export function hasPendingAccount() {
  return Boolean(getPendingAccount())
}

export function clearPendingAccount() {
  sessionStorage.removeItem(PENDING_ACCOUNT_KEY)
}
