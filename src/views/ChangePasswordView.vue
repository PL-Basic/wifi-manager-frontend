<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ArrowLeft, Eye, EyeOff, KeyRound, Send } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import { getMyProfile } from '@/api/account'
import { resetPassword, sendVerifyCode } from '@/api/auth'
import { getApiErrorMessage } from '@/utils/apiError'
import { clearSession, getToken, onSessionChange, parseTokenPayload } from '@/utils/session'
import './operations/operations.css'

const router = useRouter()
const form = reactive({ target: '', code: '', newPassword: '', confirmPassword: '' })
const contacts = ref([])
const loadingProfile = ref(false)
const loading = ref(false)
const sendingCode = ref(false)
const codeCooldown = ref(0)
const showPassword = ref(false)
const error = ref('')
const message = ref('')
let codeTimer = null
let stopSessionSync = null

function contactLabel(value) {
  return String(value || '').includes('@') ? '邮箱' : '手机号'
}

function unwrap(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
  return response.data.data
}

function stopTimer() {
  if (codeTimer) window.clearInterval(codeTimer)
  codeTimer = null
}

function startCooldown(seconds = 60) {
  stopTimer()
  codeCooldown.value = seconds
  codeTimer = window.setInterval(() => {
    codeCooldown.value = Math.max(0, codeCooldown.value - 1)
    if (!codeCooldown.value) stopTimer()
  }, 1000)
}

async function loadContacts() {
  const userId = parseTokenPayload()?.sub
  if (!userId) {
    error.value = '当前登录凭证缺少用户 ID，请重新登录'
    return
  }

  loadingProfile.value = true
  try {
    const profile = unwrap(await getMyProfile(userId), '当前资料加载失败') || {}
    contacts.value = [profile.phone, profile.email]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
    form.target = contacts.value[0] || ''
    if (!contacts.value.length) {
      error.value = '当前账号没有绑定手机号或邮箱，无法通过验证码修改密码'
    }
  } catch (cause) {
    error.value = getApiErrorMessage(cause, '当前资料加载失败')
  } finally {
    loadingProfile.value = false
  }
}

async function sendCode() {
  if (sendingCode.value || codeCooldown.value || !form.target) return
  sendingCode.value = true
  error.value = ''
  message.value = ''
  try {
    const response = await sendVerifyCode({ target: form.target, scene: 'reset_password' })
    if (response.data?.code !== 200) throw new Error(response.data?.message || '验证码发送失败')
    message.value = response.data?.message || '验证码已发送'
    startCooldown(60)
  } catch (cause) {
    error.value = getApiErrorMessage(cause, '验证码发送失败')
  } finally {
    sendingCode.value = false
  }
}

async function submit() {
  if (loading.value || !form.target) return
  const code = form.code.trim()
  if (!/^[A-Za-z0-9]{6}$/.test(code)) {
    error.value = '请输入 6 位验证码'
    return
  }
  if (form.newPassword.length < 6 || form.newPassword.length > 20) {
    error.value = '新密码长度需要在 6-20 位之间'
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    error.value = '两次输入的新密码不一致'
    return
  }

  loading.value = true
  error.value = ''
  message.value = ''
  try {
    unwrap(await resetPassword({ target: form.target, code, newPassword: form.newPassword }), '密码修改失败')
    // 密码修改后主动清理当前 JWT，并让其他标签页同步退出，避免旧 Session 继续使用。
    clearSession('密码修改成功，请重新登录', true, 'success')
    await router.replace('/login')
  } catch (cause) {
    error.value = getApiErrorMessage(cause, '密码修改失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!getToken()) {
    router.replace('/login')
    return
  }
  loadContacts()
  stopSessionSync = onSessionChange(() => {
    if (!getToken()) router.replace('/login')
  })
})

onBeforeUnmount(() => {
  stopTimer()
  if (stopSessionSync) stopSessionSync()
})
</script>

<template>
  <section class="workspace-view change-password-view">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">账户安全</p>
        <h2>修改密码</h2>
      </div>
      <RouterLink class="secondary-button" to="/app/account-security"><ArrowLeft :size="16" />返回账户安全</RouterLink>
    </header>

    <p v-if="error" class="alert error" aria-live="polite">{{ error }}</p>
    <p v-if="message" class="alert success" aria-live="polite">{{ message }}</p>
    <StateBlock v-if="loadingProfile" type="loading" title="正在读取已绑定联系方式" />

    <form v-else class="glass-panel change-password-panel" @submit.prevent="submit">
      <div class="change-password-heading">
        <KeyRound :size="22" />
        <div><h3>验证后设置新密码</h3><p>修改成功后当前登录状态会被清除，必须重新登录。</p></div>
      </div>

      <label>
        <span>验证方式</span>
        <select v-model="form.target" :disabled="loading || sendingCode || !contacts.length">
          <option v-for="contact in contacts" :key="contact" :value="contact">{{ contactLabel(contact) }}：{{ contact }}</option>
        </select>
      </label>

      <label>
        <span>验证码</span>
        <div class="code-row">
          <input v-model="form.code" type="text" maxlength="6" autocomplete="one-time-code" placeholder="请输入 6 位验证码" :disabled="loading" />
          <button class="secondary-button" type="button" :disabled="sendingCode || codeCooldown > 0 || !form.target" @click="sendCode"><Send :size="16" />{{ codeCooldown ? `${codeCooldown}s 后重发` : sendingCode ? '发送中...' : '发送验证码' }}</button>
        </div>
      </label>

      <label>
        <span>新密码</span>
        <div class="password-field">
          <input v-model="form.newPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="6-20 位" :disabled="loading" />
          <button class="icon-button" type="button" :title="showPassword ? '隐藏密码' : '显示密码'" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" :size="17" /><Eye v-else :size="17" /></button>
        </div>
      </label>

      <label><span>确认新密码</span><input v-model="form.confirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="再次输入新密码" :disabled="loading" /></label>
      <button class="danger-button change-password-submit" type="submit" :disabled="loading || !contacts.length">{{ loading ? '修改中...' : '确认修改密码' }}</button>
    </form>
  </section>
</template>

<style scoped>
.change-password-panel {
  display: grid;
  gap: 18px;
  max-width: 620px;
  padding: 22px;
}

.change-password-heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: var(--wm-danger);
}

.change-password-submit {
  min-height: 42px;
}

.change-password-heading h3,
.change-password-heading p {
  margin: 0;
}

.change-password-heading h3 {
  color: var(--wm-text);
}

.change-password-heading p {
  margin-top: 5px;
  color: var(--wm-muted);
  line-height: 1.5;
}
</style>
