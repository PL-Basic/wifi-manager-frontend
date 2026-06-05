<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { login, loginByVerifyCode, sendVerifyCode, resetPassword } from '@/api/auth'
import { getStoredRole, getToken, onSessionChange, setSession } from '@/utils/session'

const router = useRouter()
const initialLoginMode = localStorage.getItem('lastLoginMode') === 'contact' ? 'contact' : 'username'
const form = reactive({
  account: localStorage.getItem(initialLoginMode === 'contact' ? 'lastContactAccount' : 'lastUsernameAccount')
    || localStorage.getItem('lastAccount')
    || '',
  password: '',
  newPassword: '',
  confirmPassword: '',
  code: '',
  remember: true
})

const authMode = ref('login')
const loginMode = ref(initialLoginMode)
const contactLoginType = ref('password')
const loading = ref(false)
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

function enterResetPasswordMode(){
  authMode.value = 'resetPassword'
  loginMode.value = 'contact'
  contactLoginType.value = 'code'
  form.confirmPassword = ''
  message.value = ''
  form.password = ''
  form.newPassword = ''
  resetCodeState()
  showPassword.value = false
  syncCodeCooldownForAccount()
}

function backToLoginMode(){
  authMode.value = 'login'
  message.value = ''
  form.newPassword = ''
  form.confirmPassword = ''
  resetCodeState()
  showPassword.value = false
  syncCodeCooldownForAccount()
}


function currentCodeScene(){
  return authMode.value === 'resetPassword' ? 'reset_password' : 'login'
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

function resolveSendCodeError(error) {
  if (error.code === 'ECONNABORTED') {
    return '请求超时，请稍后查看邮箱或重新发送验证码'
  }

  if (!error.response) {
    return '网络连接异常，请检查网络后重试'
  }

  if (error.response.status === 429) {
    return error.response.data?.message || '请求过于频繁，请稍后再试'
  }

  if (error.response.status >= 500) {
    return '服务器处理异常，请稍后重试'
  }

  return error.response.data?.message || '验证码发送失败'
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
  const role = getStoredRole()
  router.replace(Number(role) <= 1 ? '/dashboard' : '/profile')
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

  router.push(Number(role) <= 1 ? '/dashboard' : '/profile')
}

async function handleLogin() {
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
      showError(data.message || '登录失败')
    }
  } catch (error) {
    showError(error.response?.data?.message || '网络请求失败')
  } finally {
    loading.value = false
  }
}

async function handleSendCode() {
  if (sendingCode.value || codeCooldown.value > 0) return

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
      scene: currentCodeScene()
    })
  

    if(data.code === 200){
      showSuccess(data.message || '验证码已发送')
      startCodeCooldown(60)
      codeCooldownMap[account] = Date.now() + 60 * 1000
    } else {
      showError(data.message || '验证码发送失败')
    }
  } catch (error) {
    showError(resolveSendCodeError(error))
  } finally {
    sendingCode.value = false
  }
}

async function handleResetPassword() {
  if (redirectIfLoggedIn()) return
  
  const account = form.account.trim()
  const code = form.code.trim()

  if(!account) {
    showError('请输入手机号或邮箱')
    return
  }

  if(!isPhone(account) && !isEmail(account)) {
    showError('请输入正确的手机号或邮箱')
    return
  }

  if(!code) {
    showError('请输入验证码')
    return
  }

  if(!form.newPassword) {
    showError('请输入新密码')
    return
  }

  if(form.newPassword.length < 6 || form.newPassword.length > 20) {
    showError('新密码长度需要在6-20之间')
    return
  }

  if (!form.confirmPassword) {
    showError('请再次输入新密码')
    return
  }

  if (form.newPassword !== form.confirmPassword) {
    showError('两次输入的新密码不一致')
    return
  }

  loading.value = true
  message.value = ''

  try{
    const { data } = await resetPassword({
      target: account,
      code,
      newPassword: form.newPassword
    })

    if(data.code === 200) {
      showSuccess(data.message || '密码重置成功，请使用新密码登录哦')
      authMode.value = 'login'
      contactLoginType.value = 'password'
      form.password = ''
      form.newPassword = ''
      form.confirmPassword = ''
      form.code = ''
      resetCodeState()
    }else{
      showError(data.message || '密码重置失败')
    } 
  } catch (error) {
    showError(error.response?.data?.message || '密码重置失败')
  } finally {
    loading.value = false
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
          <p class="eyebrow">{{ authMode === 'resetPassword' ? '账号找回' : '账号登录'}}</p>
          <h2>{{ authMode === 'resetPassword' ? '重置密码' : modeCopy[loginMode].title }}</h2>
        </div>

        <div v-if="authMode === 'login'" class="auth-mode-switch" role="tablist" aria-label="登录账号类型">
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

        <form v-if="authMode === 'login'" class="auth-form" @submit.prevent="handleLogin">
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

          <button type="submit" :disabled="loading">{{ loading ? '登录中...' : '登录' }}</button>
        
          <div class="password-recovery">
            <a
              href=""
              class="auth-inline-link"
              @click.prevent="enterResetPasswordMode">
              忘记密码？
            </a>
          </div>
        </form>
        
        <form v-else class="auth-form" @submit.prevent="handleResetPassword">
          <label>
            <span>手机号 / 邮箱</span>
            <input 
              v-model="form.account"
              type="text"
              inputmode="email"
              autocomplete="username"
              placeholder="请输入手机号或邮箱"
              @input="syncCodeCooldownForAccount"
            />
          </label>
          
          <label>
            <span>新密码</span>
            <div class="password-field">
              <input
                v-model="form.newPassword"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="请输入新密码"
              />
              <button
                type="button" 
                @click="showPassword = !showPassword">
                {{ showPassword ? '隐藏' : '查看' }}
              </button>
            </div>
          </label>

          <label>
            <span>确认新密码</span>
            <input
              v-model="form.confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="请再次输入新密码"
            />
          </label>

          <label>
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
                :disabled="sendingCode || codeCooldown >0"
                @click="handleSendCode"
              >
                {{ codeCooldown > 0 ? `${codeCooldown}s 后重发` : sendingCode ? '发送中...' : '发送验证码'}}
              </button>
            </div>
          </label>

          <button 
            type="submit"
            :disabled="loading">
            {{ loading ? '重置中...' : '重置密码' }}
          </button> 

        </form>

        <p v-if="message" :class="['alert', messageType]">{{ message }}</p>
        
        <div v-if="authMode === 'login'" class="auth-switch">
          <span>
            没有账号？
            <router-link to="/register">
              创建账号
            </router-link>
          </span>
        </div>
       
        <p v-else class="auth-switch">
          想起密码了？
          <a
            href=""
            class="auth-inline-link"
            @click.prevent="backToLoginMode">
            返回登录
          </a>
        </p>
      </section>  
    </main>
  </div>
</template>
