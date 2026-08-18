import { CanceledError } from 'axios'
import {
  clearSession,
  getClientInstanceId,
  getContextRequestSnapshot,
  getSessionSnapshot,
  getToken,
  isContextEpochCurrent,
  isTokenExpired,
  setSession
} from '@/utils/session'
import {
  requestRefreshStepUp,
  requestSessionLogout,
  requestSessionRefresh
} from '@/api/sessionTransport'
import { toUserFacingMessage } from '@/utils/apiError'

const REFRESH_LOCK_NAME = 'wifi:auth-refresh:v1'
const REFRESH_LEASE_KEY = 'wifi:auth-refresh-lease:v1'
const REFRESH_STEP_UP_KEY = 'wifi:refresh-step-up:v1'
const REFRESH_LEASE_MILLIS = 25000
const REFRESH_WAIT_MILLIS = 30000
export const REFRESH_STEP_UP_EVENT = 'wifi:refresh-step-up-required'

let currentRefresh = null

export class RefreshStepUpRequiredError extends Error {
  constructor(response) {
    super(toUserFacingMessage(
      response?.data?.message || '为了保护账号安全，请完成验证码验证'
    ))
    this.name = 'RefreshStepUpRequiredError'
    this.code = 'REFRESH_STEP_UP_REQUIRED'
    this.response = response
  }
}

function delay(millis) {
  return new Promise((resolve) => window.setTimeout(resolve, millis))
}

function markStepUpRequired() {
  const state = { required: true, expiresAt: Date.now() + 5 * 60 * 1000 }
  localStorage.setItem(REFRESH_STEP_UP_KEY, JSON.stringify(state))
  window.dispatchEvent(new CustomEvent(REFRESH_STEP_UP_EVENT))
}

export function isRefreshStepUpRequired() {
  try {
    const state = JSON.parse(localStorage.getItem(REFRESH_STEP_UP_KEY) || 'null')
    if (state?.required && Number(state.expiresAt) > Date.now()) return true
  } catch {
    // 损坏的临时状态按无复核要求处理。
  }
  localStorage.removeItem(REFRESH_STEP_UP_KEY)
  return false
}

export function clearRefreshStepUpRequired() {
  localStorage.removeItem(REFRESH_STEP_UP_KEY)
}

export function onRefreshStepUpRequired(callback) {
  const eventHandler = () => callback()
  const storageHandler = (event) => {
    if (event.key === REFRESH_STEP_UP_KEY && isRefreshStepUpRequired()) callback()
  }
  window.addEventListener(REFRESH_STEP_UP_EVENT, eventHandler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(REFRESH_STEP_UP_EVENT, eventHandler)
    window.removeEventListener('storage', storageHandler)
  }
}

function readLease() {
  try {
    return JSON.parse(localStorage.getItem(REFRESH_LEASE_KEY) || 'null')
  } catch {
    return null
  }
}

async function withStorageLease(task) {
  const owner = `${getClientInstanceId()}:${globalThis.crypto?.randomUUID?.() || Math.random()}`
  const deadline = Date.now() + REFRESH_WAIT_MILLIS

  while (Date.now() < deadline) {
    const current = readLease()
    if (!current?.owner || Number(current.expiresAt) <= Date.now()) {
      const lease = { owner, expiresAt: Date.now() + REFRESH_LEASE_MILLIS }
      localStorage.setItem(REFRESH_LEASE_KEY, JSON.stringify(lease))

      if (readLease()?.owner === owner) {
        try {
          return await task()
        } finally {
          if (readLease()?.owner === owner) {
            localStorage.removeItem(REFRESH_LEASE_KEY)
          }
        }
      }
    }

    await delay(80 + Math.floor(Math.random() * 80))
  }

  throw new Error('等待其他标签页刷新登录会话超时')
}

function withCrossTabLock(task) {
  if (navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK_NAME, { mode: 'exclusive' }, task)
  }
  return withStorageLease(task)
}

function refreshErrorCode(error) {
  return String(error?.response?.data?.data || '')
}

function refreshHttpStatus(error) {
  return Number(error?.response?.status || error?.response?.data?.code || 0)
}

function throwIfContextChanged(epoch) {
  if (!isContextEpochCurrent(epoch)) {
    throw new CanceledError('Session context changed')
  }
}

function isReplacementAvailable(failedToken) {
  const currentToken = getToken()
  return Boolean(
    failedToken
    && currentToken
    && currentToken !== failedToken
    && !isTokenExpired(currentToken)
  )
}

async function performRefresh(failedToken) {
  if (isReplacementAvailable(failedToken)) {
    return getSessionSnapshot()
  }

  if (!failedToken && getToken() && !isTokenExpired(getToken())) {
    return getSessionSnapshot()
  }

  if (isRefreshStepUpRequired()) {
    throw new RefreshStepUpRequiredError()
  }

  const requestEpoch = getContextRequestSnapshot().epoch
  try {
    const body = await requestSessionRefresh()
    throwIfContextChanged(requestEpoch)

    if (Number(body?.code) !== 200 || !body?.data?.token) {
      throw new Error(toUserFacingMessage(body?.message || '登录状态更新失败，请重新登录'))
    }

    setSession(body.data, {}, 'refresh')
    return getSessionSnapshot()
  } catch (error) {
    throwIfContextChanged(requestEpoch)

    if (refreshHttpStatus(error) === 403 && refreshErrorCode(error) === 'REFRESH_STEP_UP_REQUIRED') {
      markStepUpRequired()
      throw new RefreshStepUpRequiredError(error.response)
    }

    if (refreshHttpStatus(error) === 401) {
      clearRefreshStepUpRequired()
      clearSession(toUserFacingMessage(
        error?.response?.data?.message || '登录状态已过期，请重新登录'
      ))
    }
    throw error
  }
}

export function ensureAccessSession({ force = false, failedToken = '' } = {}) {
  const currentToken = getToken()
  if (!force && currentToken && !isTokenExpired(currentToken)) {
    return Promise.resolve(getSessionSnapshot())
  }

  if (isReplacementAvailable(failedToken)) {
    return Promise.resolve(getSessionSnapshot())
  }

  if (!currentRefresh) {
    currentRefresh = withCrossTabLock(() => performRefresh(failedToken))
      .finally(() => {
        currentRefresh = null
      })
  }
  return currentRefresh
}

export async function restoreAccessSession() {
  if (getToken() && !isTokenExpired(getToken())) return 'active'

  try {
    await ensureAccessSession({ force: true, failedToken: getToken() })
    return getToken() ? 'active' : 'anonymous'
  } catch (error) {
    if (error instanceof RefreshStepUpRequiredError) return 'step-up'
    if (Number(error?.response?.status) === 401 || !getToken()) return 'anonymous'
    return 'unavailable'
  }
}

export async function completeRefreshStepUp(data) {
  const requestEpoch = getContextRequestSnapshot().epoch
  try {
    const body = await requestRefreshStepUp(data)
    throwIfContextChanged(requestEpoch)

    if (Number(body?.code) !== 200 || !body?.data?.token) {
      if (Number(body?.code) === 401) {
        clearRefreshStepUpRequired()
        clearSession(toUserFacingMessage(body?.message || '登录状态已过期，请重新登录'))
      }
      throw new Error(toUserFacingMessage(
        body?.message || '身份验证成功，但登录状态更新失败'
      ))
    }

    setSession(body.data, {}, 'refresh')
    clearRefreshStepUpRequired()
    return getSessionSnapshot()
  } catch (error) {
    throwIfContextChanged(requestEpoch)

    if (refreshHttpStatus(error) === 401) {
      clearRefreshStepUpRequired()
      clearSession(toUserFacingMessage(
        error?.response?.data?.message || '登录状态已过期，请重新登录'
      ))
    }
    throw error
  }
}

export async function logoutSession() {
  const body = await requestSessionLogout()
  if (Number(body?.code) !== 200) {
    throw new Error(body?.message || '退出登录失败')
  }
  clearRefreshStepUpRequired()
  clearSession('')
  return body
}
