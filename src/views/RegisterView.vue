<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { register } from '@/api/auth'

const router = useRouter()
const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  email: '',
  phone: ''
})
const loading = ref(false)
const message = ref('')
const messageType = ref('success')
const confirmPasswordError = ref('')

function showError(text) {
  message.value = text
  messageType.value = 'error'
}

function showSuccess(text) {
  message.value = text
  messageType.value = 'success'
}

function validateConfirmPassword() {
  if (!form.confirmPassword) {
    confirmPasswordError.value = ''
    return true
  }
  if (form.password !== form.confirmPassword) {
    confirmPasswordError.value = '两次输入的密码不一致'
    return false
  }
  confirmPasswordError.value = ''
  return true
}

async function handleRegister() {
  validateConfirmPassword()
  if (!form.username.trim() || !form.password || !form.nickname.trim()) {
    showError('请输入用户名、密码和昵称')
    return
  }
  if (form.password.length < 6) {
    showError('密码至少 6 位')
    return
  }
  if (form.password !== form.confirmPassword) {
    showError('两次输入的密码不一致')
    return
  }

  loading.value = true
  message.value = ''

  try {
    const { data } = await register({
      username: form.username.trim(),
      password: form.password,
      nickname: form.nickname.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null
    })

    if (data.code === 200) {
      showSuccess(data.message || '注册成功')
      localStorage.setItem('lastAccount', form.username.trim())
      setTimeout(() => router.push('/login'), 800)
    } else {
      showError(data.message || '注册失败')
    }
  } catch (error) {
    showError(error.response?.data?.message || '网络请求失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="starry-auth-scene">
    <StarrySky />

    <main class="auth-layout">
      <section class="auth-intro">
        <p class="eyebrow">Wifi Manager</p>
        <h1>创建接入账号</h1>
        <p>普通账号默认进入个人中心，管理员账号由后台分配。</p>
      </section>

      <section class="auth-panel auth-panel--login">
        <div class="auth-copy">
          <p class="eyebrow">账号注册</p>
          <h2>填写资料</h2>
        </div>

        <form class="auth-form" @submit.prevent="handleRegister">
          <label>
            <span>用户名</span>
            <input v-model="form.username" type="text" autocomplete="username" placeholder="3 到 20 个字符" />
          </label>

          <div class="form-row">
            <label>
              <span>密码</span>
              <input v-model="form.password" type="password" autocomplete="new-password" placeholder="至少 6 位" />
            </label>

            <label>
              <span>确认密码</span>
              <input
                v-model="form.confirmPassword"
                type="password"
                autocomplete="new-password"
                placeholder="再次输入"
                @blur="validateConfirmPassword"
                @input="validateConfirmPassword"
              />
              <small v-if="confirmPasswordError" class="field-error">{{ confirmPasswordError }}</small>
            </label>
          </div>

          <label>
            <span>昵称</span>
            <input v-model="form.nickname" type="text" placeholder="显示名称" />
          </label>

          <div class="form-row">
            <label>
              <span>邮箱</span>
              <input v-model="form.email" type="email" autocomplete="email" placeholder="可选" />
            </label>

            <label>
              <span>手机号</span>
              <input v-model="form.phone" type="tel" autocomplete="tel" placeholder="可选" />
            </label>
          </div>

          <button type="submit" :disabled="loading">{{ loading ? '注册中...' : '注册' }}</button>
        </form>

        <p v-if="message" :class="['alert', messageType]">{{ message }}</p>
        <p class="auth-switch">已有账号？<router-link to="/login">返回登录</router-link></p>
      </section>
    </main>
  </div>
</template>
