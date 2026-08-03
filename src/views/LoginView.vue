<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { login, loginByVerifyCode, sendVerifyCode, startOAuthLogin } from '@/api/auth'
import { OAUTH_PROVIDERS } from '@/config/oauth'
import { getStoredRole, getToken, onSessionChange, setSession } from '@/utils/session'
import { getHomePath } from '@/utils/access'
import { getApiErrorMessage } from '@/utils/apiError'
import { getSafeInternalRedirect } from '@/utils/navigation'

const router = useRouter()
const route = useRoute()
const initialLoginMode = localStorage.getItem('lastLoginMode') === 'contact' ? 'contact' : 'username'
const form = reactive({
  account: localStorage.getItem(initialLoginMode === 'contact' ? 'lastContactAccount' : 'lastUsernameAccount')
    || localStorage.getItem('lastAccount')
    || '',
  password: '',
  code: '',
  remember: true
})

const loginMode = ref(initialLoginMode)
const contactLoginType = ref('password')
const loading = ref(false)
// 记录当前正在发起授权的 Provider，同时阻止重复点击。
const oauthLoadingProvider = ref('')
const message = ref('')
const messageType = ref('success')
const sendingCode = ref(false)
const codeCooldown = ref(0)
const showPassword = ref(false)
const codeCooldownMap = reactive({})


let codeTimer = null
let stopSessionSync = null

const modeCopy = {
  username: {
    title: '用户名登录',
    label: '用户名',
    placeholder: '请输入用户名'
  },
  contact: {
    title: '手机号或邮箱登录',
    label: '手机号 / 邮箱',
    placeholder: '请输入手机号或邮箱'
  }
}

function resetCodeState() {
  form.code = ''
  codeCooldown.value = 0
  sendingCode.value = false

  if (codeTimer) {
    clearInterval(codeTimer)
    codeTimer = null
  }
}

function syncCodeCooldownForAccount() {
  const account = form.account.trim()

  form.code = ''

  if (codeTimer) {
    clearInterval(codeTimer)
    codeTimer = null
  }

  const expireAt = codeCooldownMap[account]

  if(!expireAt || expireAt <= Date.now()) {
    codeCooldown.value = 0
    return
  }

  const remaining = Math.ceil((expireAt - Date.now()) / 1000)
  startCodeCooldown(remaining)
}

function showError(text) {
  message.value = text
  messageType.value = 'error'
}

function showSuccess(text) {
  message.value = text
  messageType.value = 'success'
}

function resolveLoginErrorMessage(data) {
  // 后端将具体登录结果放在 data.status 中。
  const status = data?.data?.status

  if (status === 'ACCOUNT_LOCKED') {
    return data.message || '密码错误次数过多，请稍后再试'
  }

  if (status === 'ACCOUNT_DISABLED') {
    return data.message || '账号已被禁用，请联系管理员'
  }

  if (status === 'ACCOUNT_NOT_FOUND') {
    return data.message || '账号不存在'
  }

  if (status === 'PASSWORD_ERROR') {
    // 只有联系方式登录下的验证码模式，才允许使用验证码错误提示。
    const isCodeLogin = loginMode.value === 'contact'
      && contactLoginType.value === 'code'

    return data.message
      || (isCodeLogin ? '验证码错误或已过期' : '账号或密码错误')
  }

  return data?.message || '登录失败'
}

function switchLoginMode(mode) {
  if (loginMode.value === mode) return
  loginMode.value = mode
  message.value = ''
  form.password = ''
  resetCodeState()
  showPassword.value = false

  const accountKey = mode === 'username' ? 'lastUsernameAccount' : 'lastContactAccount'
  form.account = localStorage.getItem(accountKey) || ''
  if(mode === 'contact') {
    syncCodeCooldownForAccount()
  }
}

function switchContactLoginType(type) {
  if (contactLoginType.value === type) return
  contactLoginType.value = type
  message.value = ''
  form.password = ''
  resetCodeState()
  showPassword.value = false
}

function isPhone(value) {
  return /^1[3-9]\d{9}$/.test(value)
}

function isEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

function redirectIfLoggedIn() {
  if (!getToken()) return false
  router.replace(getSafeInternalRedirect(route.query.redirect, getHomePath(getStoredRole())))
  return true
}

function finishLogin(auth,account) {
  const role = auth.role ?? 2
  setSession(auth.token,{
    username: auth.username, 
    nickname: auth.nickname || '', 
    role 
  })

  if (form.remember) {
    localStorage.setItem('lastAccount', account)
    localStorage.setItem('lastLoginMode', loginMode.value)

    const accountKey = loginMode.value === 'username' ? 'lastUsernameAccount' : 'lastContactAccount'
    localStorage.setItem(accountKey, account)
  } else {
    localStorage.removeItem('lastAccount')
    localStorage.removeItem('lastLoginMode')
    localStorage.removeItem('lastContactAccount')
    localStorage.removeItem('lastUsernameAccount')
  }

  router.push(getSafeInternalRedirect(route.query.redirect, getHomePath(role)))
}

async function handleLogin() {
  if (loading.value || oauthLoadingProvider.value) return
  const isCodeLogin = loginMode.value === 'contact' && contactLoginType.value === 'code'
  const isPasswordLogin = !isCodeLogin

  if (redirectIfLoggedIn()) return
  
  const account = form.account.trim()

  if(isPasswordLogin) {
    if (!form.account.trim() || !form.password) {
      showError(loginMode.value === 'contact' ? '请输入手机号/邮箱和密码' : '请输入用户名和密码')
      return
    }

    if (loginMode.value === 'contact' && !isPhone(account) && !isEmail(account)) {
      showError('请输入正确的手机号或邮箱')
      return
    }
  } else {
    if(!account){
      showError('请输入手机号或邮箱')
      return
    }

    if(!isPhone(account) && !isEmail(account)) {
      showError("请输入正确的手机号或邮箱")
      return
    }

    if(!form.code.trim()){
      showError('请输入验证码')
      return
    }
  }

  loading.value = true
  message.value = ''

  try {
    let response
    if (isPasswordLogin) {
      response = await login({
        loginType: loginMode.value,
        account,
        password: form.password
      })
    } else {
      response = await loginByVerifyCode({
        target: account,
        code: form.code.trim()
      })
    }

    const data = response.data
    
    if (data.code === 200) {
      finishLogin(data.data, account)
      showSuccess(data.message || '登录成功')
    } else {
      showError(resolveLoginErrorMessage(data))
    }
  } catch (error) {
    const responseData = error.response?.data
    showError(responseData ? resolveLoginErrorMessage(responseData) : getApiErrorMessage(error, '登录失败'))
  } finally {
    loading.value = false
  }
}

async function handleSendCode() {
  if (sendingCode.value || codeCooldown.value > 0 || oauthLoadingProvider.value) return

  const account = form.account.trim()
  
  if(!account) {
    showError('请输入手机号或邮箱')
    return
  }
  
  if(!isPhone(account) && !isEmail(account)){
    showError('请输入正确的手机号或邮箱')
    return
  }

  sendingCode.value = true
  message.value = ''

  try{
    const{ data } = await sendVerifyCode({
      target: account,
      scene: 'login'
    })
  

    if(data.code === 200){
      showSuccess(data.message || '验证码已发送')
      startCodeCooldown(60)
      codeCooldownMap[account] = Date.now() + 60 * 1000
    } else {
      showError(data.message || '验证码发送失败')
    }
  } catch (error) {
    showError(getApiErrorMessage(error, '验证码发送失败'))
  } finally {
    sendingCode.value = false
  }
}

async function handleOAuthLogin(provider) {
  if (
    loading.value
    || sendingCode.value
    || oauthLoadingProvider.value
  ) {
    return
  }

  if (redirectIfLoggedIn()) return

  oauthLoadingProvider.value = provider.code
  message.value = ''
  let redirecting = false

  try {
    const callbackUrl = new URL(`/oauth-complete/${provider.code}`, window.location.origin)
    const redirectPath = getSafeInternalRedirect(route.query.redirect, '')
    if (redirectPath) callbackUrl.searchParams.set('redirect', redirectPath)
    const returnUri = callbackUrl.toString()

    const { data } = await startOAuthLogin(
      provider.code,
      returnUri
    )

    const authorizationUrl = data?.data?.authorizationUrl

    if (data?.code !== 200 || !authorizationUrl) {
      showError(
        data?.message
        || `${provider.label} OAuth 当前未配置`
      )
      return
    }

    // 请求期间若其他标签页已经登录，不再继续跳转到 Provider。
    if (redirectIfLoggedIn()) return

    window.location.assign(authorizationUrl)

    // 保持按钮锁定，直到浏览器真正离开当前页面。
    redirecting = true
  } catch (error) {
    showError(
      getApiErrorMessage(
        error,
        `${provider.label} OAuth 当前未配置`
      )
    )
  } finally {
    if (!redirecting) {
      oauthLoadingProvider.value = ''
    }
  }
}

function startCodeCooldown(seconds = 60){
  codeCooldown.value = seconds
  
  if (codeTimer) clearInterval(codeTimer)

  codeTimer = setInterval(() => {
    codeCooldown.value -= 1
    
    if (codeCooldown.value <= 0){
      clearInterval(codeTimer)
      codeTimer = null
    }
  },1000)
}



onMounted(() => {
  if (redirectIfLoggedIn()) return
  stopSessionSync = onSessionChange(() => {
    redirectIfLoggedIn()
  })
  const authMessage = sessionStorage.getItem('authMessage')
  if (authMessage) {
    showError(authMessage)
    sessionStorage.removeItem('authMessage')
  }
})

onBeforeUnmount(() => {
  if (stopSessionSync) stopSessionSync()
  if(codeTimer) clearInterval(codeTimer)
})

</script>

<template>
  <div class="starry-auth-scene">
    <StarrySky />

    <main class="auth-layout">
      <section class="auth-intro">
        <p class="eyebrow">Wifi Manager</p>
        <h1>家庭 WiFi 管理</h1>
        <p>设备接入、访问规则、告警和定位数据统一管理。</p>
      </section>

      <section class="auth-panel auth-panel--login">
        <div class="auth-copy">
          <p class="eyebrow">账号登录</p>
          <h2>{{ modeCopy[loginMode].title }}</h2>
        </div>

        <div class="auth-mode-switch" role="tablist" aria-label="登录账号类型">
          <button
            type="button"
            :class="{ active: loginMode === 'username' }"
            @click="switchLoginMode('username')"
          >
            用户名
          </button>

          <button
            type="button"
            :class="{ active: loginMode === 'contact' }"
            @click="switchLoginMode('contact')"
          >
            手机号/邮箱
          </button>
        </div>

        <form class="auth-form" @submit.prevent="handleLogin">
          <label>
            <span>{{ modeCopy[loginMode].label }}</span>
            <input
              v-model="form.account"
              type="text"
              :inputmode="loginMode === 'contact' ? 'email' : 'text'"
              autocomplete="username"
              :placeholder="modeCopy[loginMode].placeholder"
              @input="loginMode === 'contact' && syncCodeCooldownForAccount()"
            />
          </label>
          
          <label v-if="loginMode === 'username' || (loginMode === 'contact' && contactLoginType === 'password')">
            <span>密码</span>
            <div class="password-field">
              <input 
                v-model="form.password" 
                :type="showPassword ? 'text' : 'password'" 
                autocomplete="current-password" 
                placeholder="请输入密码" 
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? '隐藏' : '查看' }}
              </button>
            </div>
          </label>

          <label v-if="loginMode === 'contact' && contactLoginType === 'code'">
            <span>验证码</span>
            <div class="code-row">
              <input
                v-model="form.code"
                type="text"
                maxlength="6"
                autocomplete="one-time-code"
                placeholder="请输入验证码"
              />
              <button 
              type="button" 
              :disabled="sendingCode || codeCooldown > 0"
              @click="handleSendCode">
                {{ codeCooldown > 0 ? `${codeCooldown}s 后重发` : sendingCode ? '发送中...' : '发送验证码' }}
              </button>
            </div>
          </label>

           <div v-if="loginMode === 'contact'" class="auth-sub-switch">
            <button 
              type="button"
              :class="{ active: contactLoginType === 'password'}"
              @click="switchContactLoginType('password')"
            >
              密码登录
            </button>
            <button
              type="button"
              :class="{ active: contactLoginType === 'code'}"
              @click="switchContactLoginType('code')"
            >
              验证码登录
            </button>
          </div>

          <label class="check-line">
            <input v-model="form.remember" type="checkbox" />
            <span>记住账号</span>
          </label>

          <button
            type="submit"
            :disabled="loading || Boolean(oauthLoadingProvider)"
          >
            {{ loading ? '登录中...' : '登录' }}
          </button>
          <div class="password-recovery">
            <router-link
              class="auth-inline-link"
              to="/forgot-password">
              忘记密码？
            </router-link>
          </div>
        </form>

        <div class="oauth-login">
          <p class="oauth-login__label">使用社交账号登录</p>

          <div class="oauth-login__actions">
            <button
              v-for="provider in OAUTH_PROVIDERS"
              :key="provider.code"
              type="button"
              class="oauth-login__button"
              :disabled="
                loading
                || sendingCode
                || Boolean(oauthLoadingProvider)
              "
              @click="handleOAuthLogin(provider)"
            >
              {{
                oauthLoadingProvider === provider.code
                  ? '跳转中...'
                  : provider.label
              }}
            </button>
          </div>
        </div>

        <p v-if="message" :class="['alert', messageType]">{{ message }}</p>
        <div class="auth-switch">
          <span>
            没有账号？
            <router-link to="/register">
              创建账号
            </router-link>
          </span>
        </div>
      </section>  
    </main>
  </div>
</template>
