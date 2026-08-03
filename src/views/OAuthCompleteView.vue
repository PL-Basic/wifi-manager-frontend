<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { completeOAuthCallback } from '@/api/auth'
import { getOAuthProvider } from '@/config/oauth'
import { getApiErrorMessage } from '@/utils/apiError'
import { getHomePath } from '@/utils/access'
import { getSafeInternalRedirect } from '@/utils/navigation'
import {
  getStoredRole,
  getToken,
  parseTokenPayload,
  setSession
} from '@/utils/session'

const route = useRoute()
const router = useRouter()

const viewState = ref('loading')
const title = ref('正在完成授权')
const message = ref('正在验证 Provider 返回的信息...')
const actionPath = ref('/login')
const actionLabel = ref('返回登录')

let callbackStarted = false

function destinationForRole(role) {
  return getSafeInternalRedirect(route.query.redirect, getHomePath(role))
}

function readQueryValue(value) {
  if (Array.isArray(value)) return value[0] || ''
  return String(value || '')
}

function showState(state, nextTitle, nextMessage, path = '/login', label = '返回登录') {
  viewState.value = state
  title.value = nextTitle
  message.value = nextMessage
  actionPath.value = path
  actionLabel.value = label
}

async function handleCallback() {
  if (callbackStarted) return
  callbackStarted = true

  const provider = getOAuthProvider(route.params.provider)

  if (!provider) {
    showState('error', '不支持的授权来源', '当前 OAuth Provider 不在允许列表中。')
    return
  }

  const state = readQueryValue(route.query.state)
  const code = readQueryValue(route.query.code)
  const providerError = readQueryValue(route.query.error)

  if (!state) {
    showState('error', '授权信息不完整', 'OAuth 回调缺少 state，请重新发起登录。')
    return
  }

  if (!code && !providerError) {
    showState('error', '授权信息不完整', 'OAuth 回调缺少授权码，请重新发起登录。')
    return
  }

  try {
    const { data } = await completeOAuthCallback(provider.code, {
      state,
      code,
      error: providerError
    })

    if (data?.code !== 200 || !data.data) {
      showState('error', '授权处理失败', data?.message || '后端没有返回有效的 OAuth 结果。')
      return
    }

    const result = data.data

    if (result.replayed) {
      const hasSession = Boolean(getToken())

      showState(
        'replayed',
        '授权已经处理',
        result.status === 'LOGIN_READY'
          ? '该回调已使用，安全策略不会再次签发登录凭证。'
          : result.message || '该 OAuth 回调已经处理，无需重复提交。',
        hasSession ? destinationForRole(getStoredRole()) : '/login',
        hasSession ? '进入当前账号' : '重新登录'
      )
      return
    }

    if (result.status === 'LOGIN_READY') {
      if (!result.token) {
        showState('error', '登录凭证缺失', 'OAuth 登录成功，但后端没有返回登录凭证。')
        return
      }

      // 其他标签页已经登录时，不能覆盖当前浏览器共享账号。
      if (getToken()) {
        showState(
          'existing-session',
          '当前浏览器已有登录账号',
          'OAuth 回调已完成，但不会覆盖其他标签页已经建立的登录状态。',
          destinationForRole(getStoredRole()),
          '进入当前账号'
        )
        return
      }

      const role = result.role ?? 2

      sessionStorage.removeItem('authMessage')
      setSession(result.token, {
        username: result.username || '',
        nickname: result.nickname || '',
        role
      })

      await router.replace(destinationForRole(role))
      return
    }

    if (result.status === 'BIND_READY') {
        const hasSession = Boolean(getToken())
        const currentUserId = String(parseTokenPayload()?.sub || '')
        const resultUserId = String(result.userId || '')
        const sameAccount = (
          hasSession
          && currentUserId
          && resultUserId
          && currentUserId === resultUserId
        )

        showState('success','社交身份绑定成功',
            sameAccount ? result.message || `${provider.label} 身份已经绑定。` : '绑定已经完成，但当前浏览器登录账号发生了变化，请确认当前账号。',
            sameAccount ? '/app/account-security' : hasSession ? destinationForRole(getStoredRole()) : '/login',
            sameAccount ? '返回账户安全' : hasSession ? '进入当前账号' : '返回登录'
        )
        return
      }

    if (result.status === 'BIND_REQUIRED') {
      showState(
        'bind-required',
        '需要绑定已有账号',
        result.message || '该社交身份尚未绑定，请先登录已有账号，再到账户安全页完成绑定。'
      )
      return
    }

    showState('error', '未知授权结果', '后端返回了前端无法识别的 OAuth 状态。')
  } catch (error) {
    showState(
      'error',
      'OAuth 处理失败',
      getApiErrorMessage(error, 'OAuth 回调处理失败')
    )
  }
}

onMounted(handleCallback)
</script>

<template>
  <div class="starry-auth-scene">
    <StarrySky />

    <main class="auth-layout">
      <section class="auth-intro">
        <p class="eyebrow">Wifi Manager</p>
        <h1>账号授权</h1>
        <p>验证社交身份并完成登录或绑定流程。</p>
      </section>

      <section class="auth-panel auth-panel--login" aria-live="polite">
        <div class="auth-copy">
          <p class="eyebrow">OAuth</p>
          <h2>{{ title }}</h2>
        </div>

        <p v-if="viewState === 'loading'" class="auth-switch">
          {{ message }}
        </p>

        <template v-else>
          <p :class="['alert', viewState === 'success' ? 'success' : 'error']">
            {{ message }}
          </p>

          <p class="auth-switch">
            <router-link :to="actionPath">
              {{ actionLabel }}
            </router-link>
          </p>
        </template>
      </section>
    </main>
  </div>
</template>
