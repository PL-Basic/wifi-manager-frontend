<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { resetPassword, sendVerifyCode } from '@/api/auth'
import { getApiErrorMessage } from '@/utils/apiError'
import { getStoredRole, getToken, onSessionChange } from '@/utils/session'
import { getHomePath } from '@/utils/access'

const router = useRouter()
const form = reactive({
  target: localStorage.getItem('lastContactAccount') || '',
  code: '',
  newPassword: '',
  confirmPassword: ''
})

const loading = ref(false)
const sendingCode = ref(false)
const codeCooldown = ref(0)
const showPassword = ref(false)
const resetSucceeded = ref(false)
const message = ref('')
const messageType = ref('success')
// 分别记录每个联系方式的验证码冷却截止时间。
const codeCooldownMap = new Map()
let codeTimer = null
let stopSessionSync = null

function isPhone(value) {
  return /^1[3-9]\d{9}$/.test(value)
}

function isEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

function showError(text) {
  message.value = text
  messageType.value = 'error'
}

function showSuccess(text) {
  message.value = text
  messageType.value = 'success'
}

function validateTarget() {
  const target = form.target.trim()

  if (!target) {
    showError('请输入手机号或邮箱')
    return ''
  }

  if (!isPhone(target) && !isEmail(target)) {
    showError('请输入正确的手机号或邮箱')
    return ''
  }

  return target
}

function stopCodeTimer() {
  if (!codeTimer) return

  clearInterval(codeTimer)
  codeTimer = null
}

function startCodeTimer(target) {
  stopCodeTimer()

  const updateCooldown = () => {
    const expireAt = codeCooldownMap.get(target) || 0
    codeCooldown.value = Math.max(
      0,
      Math.ceil((expireAt - Date.now()) / 1000)
    )

    if (codeCooldown.value <= 0) {
      codeCooldownMap.delete(target)
      stopCodeTimer()
    }
  }

  updateCooldown()

  if (codeCooldown.value > 0) {
    codeTimer = setInterval(updateCooldown, 1000)
  }
}

function startCodeCooldown(target, seconds = 60) {
  codeCooldownMap.set(target, Date.now() + seconds * 1000)
  startCodeTimer(target)
}

function syncCodeCooldownForTarget() {
  // 联系方式变化后，不能继续使用上一个账号的验证码。
  form.code = ''
  startCodeTimer(form.target.trim())
}

async function handleSendCode() {
  if (sendingCode.value || codeCooldown.value > 0) return

  const target = validateTarget()
  if (!target) return

  sendingCode.value = true
  message.value = ''

  try {
    const { data } = await sendVerifyCode({
      target,
      scene: 'reset_password'
    })

    if (data.code === 200) {
      showSuccess(data.message || '验证码已发送')
      startCodeCooldown(target, 60)
    } else {
      showError(data.message || '验证码发送失败')
    }
  } catch (error) {
    showError(getApiErrorMessage(error, '验证码发送失败'))
  } finally {
    sendingCode.value = false
  }
}

async function handleResetPassword() {
  const target = validateTarget()
  if (!target) return

  const code = form.code.trim()

  if (!/^[A-Za-z0-9]{6}$/.test(code)) {
    showError('请输入 6 位验证码')
    return
  }

  if (form.newPassword.length < 6 || form.newPassword.length > 20) {
    showError('新密码长度需要在 6-20 位之间')
    return
  }

  if (form.newPassword !== form.confirmPassword) {
    showError('两次输入的新密码不一致')
    return
  }

  loading.value = true
  message.value = ''

  try {
    const { data } = await resetPassword({
      target,
      code,
      newPassword: form.newPassword
    })

    if (data.code === 200) {
      resetSucceeded.value = true
      form.code = ''
      form.newPassword = ''
      form.confirmPassword = ''
      showSuccess(data.message || '密码重置成功，请使用新密码登录')
    } else {
      showError(data.message || '密码重置失败')
    }
  } catch (error) {
    showError(getApiErrorMessage(error, '密码重置失败'))
  } finally {
    loading.value = false
  }
}

function redirectIfLoggedIn() {
  if (!getToken()) return false

  router.replace(getHomePath(getStoredRole()))
  return true
}

onMounted(() => {
  if (redirectIfLoggedIn()) return

  // 其他标签页登录后，当前重置密码页同步进入账号工作区。
  stopSessionSync = onSessionChange(() => {
    redirectIfLoggedIn()
  })
})

onBeforeUnmount(() => {
  stopCodeTimer()

  if (stopSessionSync) {
    stopSessionSync()
  }
})
</script>

<template>
  <div class="starry-auth-scene">
    <StarrySky />

    <main class="auth-layout">
      <section class="auth-intro">
        <p class="eyebrow">Wifi Manager</p>
        <h1>找回账号访问权</h1>
        <p>通过已绑定的手机号或邮箱验证身份并设置新密码。</p>
      </section>

      <section class="auth-panel auth-panel--login">
        <div class="auth-copy">
          <p class="eyebrow">账号安全</p>
          <h2>重置密码</h2>
        </div>

        <form
          v-if="!resetSucceeded"
          class="auth-form"
          @submit.prevent="handleResetPassword"
        >
          <label>
            <span>手机号 / 邮箱</span>
                <input
                    v-model="form.target"
                    type="text"
                    inputmode="email"
                    autocomplete="username"
                    placeholder="请输入已绑定的手机号或邮箱"
                    :disabled="sendingCode || loading"
                    @input="syncCodeCooldownForTarget"
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
                :disabled="sendingCode || codeCooldown > 0"
                @click="handleSendCode"
              >
                {{ codeCooldown > 0
                  ? `${codeCooldown}s 后重发`
                  : sendingCode ? '发送中...' : '发送验证码' }}
              </button>
            </div>
          </label>

          <label>
            <span>新密码</span>
            <div class="password-field">
              <input
                v-model="form.newPassword"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="6-20 位"
              />
              <button type="button" @click="showPassword = !showPassword">
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
              placeholder="再次输入新密码"
            />
          </label>

          <button type="submit" :disabled="loading">
            {{ loading ? '重置中...' : '重置密码' }}
          </button>
        </form>

        <p v-if="message" :class="['alert', messageType]">
          {{ message }}
        </p>

        <p class="auth-switch">
          <router-link to="/login">
            {{ resetSucceeded ? '返回登录' : '想起密码了？返回登录' }}
          </router-link>
        </p>
      </section>
    </main>
  </div>
</template>