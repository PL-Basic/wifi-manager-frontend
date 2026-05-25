<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { login } from '@/api/auth'
import { syncSessionUser } from '@/utils/session'

const router = useRouter()
const form = reactive({
  account: localStorage.getItem('lastAccount') || '',
  password: '',
  remember: true
})
const loading = ref(false)
const message = ref('')
const messageType = ref('success')

function showError(text) {
  message.value = text
  messageType.value = 'error'
}

function showSuccess(text) {
  message.value = text
  messageType.value = 'success'
}

async function handleLogin() {
  if (!form.account.trim() || !form.password) {
    showError('请输入账号和密码')
    return
  }

  loading.value = true
  message.value = ''

  try {
    const { data } = await login({
      account: form.account.trim(),
      password: form.password
    })

    if (data.code === 200) {
      const auth = data.data
      const role = auth.role ?? 2
      localStorage.setItem('token', auth.token)
      syncSessionUser({ username: auth.username, nickname: auth.nickname || '', role })
      if (form.remember) {
        localStorage.setItem('lastAccount', form.account.trim())
      } else {
        localStorage.removeItem('lastAccount')
      }
      showSuccess(data.message || '登录成功')
      router.push(Number(role) <= 1 ? '/dashboard' : '/profile')
    } else {
      showError(data.message || '登录失败')
    }
  } catch (error) {
    showError(error.response?.data?.message || '网络请求失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const authMessage = sessionStorage.getItem('authMessage')
  if (authMessage) {
    showError(authMessage)
    sessionStorage.removeItem('authMessage')
  }
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
          <h2>欢迎回来</h2>
        </div>

        <form class="auth-form" @submit.prevent="handleLogin">
          <label>
            <span>账号</span>
            <input v-model="form.account" type="text" autocomplete="username" placeholder="用户名 / 邮箱 / 手机号" />
          </label>

          <label>
            <span>密码</span>
            <input v-model="form.password" type="password" autocomplete="current-password" placeholder="请输入密码" />
          </label>

          <label class="check-line">
            <input v-model="form.remember" type="checkbox" />
            <span>记住账号</span>
          </label>

          <button type="submit" :disabled="loading">{{ loading ? '登录中...' : '登录' }}</button>
        </form>

        <p v-if="message" :class="['alert', messageType]">{{ message }}</p>
        <p class="auth-switch">没有账号？<router-link to="/register">创建账号</router-link></p>
      </section>
    </main>
  </div>
</template>
