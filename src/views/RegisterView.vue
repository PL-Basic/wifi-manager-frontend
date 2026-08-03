<script setup>
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { register, sendVerifyCode } from '@/api/auth'
import { getApiErrorMessage } from '@/utils/apiError'

const router = useRouter()
const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  email: '',
  phone: '',
  emailCode: '',
  phoneCode: ''
})
const loading = ref(false)
const message = ref('')
const messageType = ref('success')
const confirmPasswordError = ref('')
const sendingEmailCode = ref(false)
const sendingPhoneCode = ref(false)
const emailCodeCooldown = ref(0)
const phoneCodeCooldown = ref(0)
const showPassword = ref(false)

let emailCodeTimer = null
let phoneCodeTimer = null

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

function startCooldown(type, seconds = 60){
  const cooldown = type === 'email' ? emailCodeCooldown : phoneCodeCooldown
  const timer = type === 'email' ? emailCodeTimer : phoneCodeTimer

  cooldown.value = seconds

  if(timer) clearInterval(timer)

  const nextTimer = setInterval(() =>{
    cooldown.value -= 1

    if(cooldown.value <= 0) {
      clearInterval(nextTimer)
      
      if(type === 'email'){
        emailCodeTimer = null
      }else{
        phoneCodeTimer = null
      }
    }
  },1000)
  
  if (type === 'email') {
    emailCodeTimer = nextTimer
  } else {
    phoneCodeTimer = nextTimer
  }
}

function resetEmailCodeState() {
  form.emailCode = ''
  emailCodeCooldown.value = 0
  sendingEmailCode.value = false

  if (emailCodeTimer) {
    clearInterval(emailCodeTimer)
    emailCodeTimer = null
  }
}

function resetPhoneCodeState() {
  form.phoneCode = ''
  phoneCodeCooldown.value = 0
  sendingPhoneCode.value = false

  if(phoneCodeTimer) {
    clearInterval(phoneCodeTimer)
    phoneCodeTimer = null
  }
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

  
  if(form.email.trim() && !form.emailCode.trim()) {
    showError('请输入邮箱验证码')
    return
  }

  if(form.phone.trim() && !form.phoneCode.trim()) {
    showError('请输入手机验证码')
    return
  }

  //页面进入提交中状态
  loading.value = true
  message.value = ''

  try {
    const { data } = await register({
      username: form.username.trim(),
      password: form.password,
      nickname: form.nickname.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      emailCode: form.emailCode.trim() || null,
      phoneCode: form.phoneCode.trim() || null
    })

    if (data.code === 200) {
      showSuccess(data.message || '注册成功')
      localStorage.setItem('lastAccount', form.username.trim())
      setTimeout(() => router.push('/login'), 800)
    } else {
      showError(data.message || '注册失败')
    }
  } catch (error) {
    showError(getApiErrorMessage(error, '注册失败'))
  } finally {
    loading.value = false
  }
}

async function handleSendEmailCode() {
  if(sendingEmailCode.value || emailCodeCooldown.value >0) return

  const email = form.email.trim()
  if(!email) {
    showError('请输入邮箱')
    return
  }
  if(!isEmail(email)) {
    showError('请输入正确的邮箱')
    return
  }

  sendingEmailCode.value = true
  message.value = ''

  try {
    const { data } = await sendVerifyCode({
      target: email,
      scene: 'register'
    })
    if (data.code === 200){
      showSuccess(data.message || '邮箱验证码已发送')
      startCooldown('email',60)
    } else {
      showError(data.message || '邮箱验证码发送失败')
    }
  } catch (error) {
    showError(getApiErrorMessage(error, '邮箱验证码发送失败'))
  } finally {
    sendingEmailCode.value = false
  }



}

async function handleSendPhoneCode() {
  if(sendingPhoneCode.value || phoneCodeCooldown.value > 0) return

  const phone = form.phone.trim()
  if(!phone){
    showError('请输入手机号')
    return
  }
  if(!isPhone(phone)){
    showError('请输入正确的手机号')
    return
  }

  sendingPhoneCode.value = true
  message.value = ''

  try{
    const { data } = await sendVerifyCode({
      target: phone,
      scene: 'register'
    })
    if (data.code === 200){
      showSuccess(data.message || '手机验证码已发送')
      startCooldown('phone',60)
    } else {
      showError(data.message || '手机验证码发送失败')
    }
  } catch (error) {
    showError(getApiErrorMessage(error, '手机验证码发送失败'))
  } finally {
    sendingPhoneCode.value = false
  }

}

onBeforeUnmount(() => {
  if (emailCodeTimer) clearInterval(emailCodeTimer)
  if (phoneCodeTimer) clearInterval(phoneCodeTimer)
})

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
              <div class="password-field">
                <input 
                  v-model="form.password" 
                  :type="showPassword ? 'text' : 'password'" 
                  autocomplete="new-password" 
                  placeholder="至少 6 位" 
                />
                <button 
                  type="button"
                  @click="showPassword = !showPassword">
                  {{ showPassword ? '隐藏' : '查看' }}
                </button>
              </div>
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

          <label>
            <span>邮箱</span>
            <input 
              v-model="form.email" 
              type="email" 
              autocomplete="email" 
              placeholder="可选"
              @input="resetEmailCodeState"
            />
          </label>
            
          <label v-if="form.email.trim()">
            <span>邮箱验证码</span>
            <div class="code-row">
              <input
                v-model="form.emailCode"
                type="text"
                maxlength="6"
                autocomplete="one-time-code"
                placeholder="填写邮箱验证码"
              />
              <button 
              type="button" 
              :disabled="sendingEmailCode || emailCodeCooldown > 0" 
              @click="handleSendEmailCode"
              >
                {{ emailCodeCooldown > 0 ? `${emailCodeCooldown}s 后重发` : sendingEmailCode ? '发送中...' : '发送'}}
              </button>
            </div>
          </label>

        
          <label>
            <span>手机号</span>
            <input 
              v-model="form.phone" 
              type="tel" 
              autocomplete="tel" 
              placeholder="可选"
              @input="resetPhoneCodeState"
              />
          </label>

          <label v-if="form.phone.trim()">
            <span>手机验证码</span>
            <div class="code-row">
              <input 
                v-model="form.phoneCode"
                type="text"
                maxlength="6"
                autocomplete="one-time-code"
                placeholder="填写手机验证码"
              />
              <button 
                type="button" 
                :disabled="sendingPhoneCode || phoneCodeCooldown > 0"
                @click="handleSendPhoneCode"
              >
                {{ phoneCodeCooldown > 0 ? `${phoneCodeCooldown}s 后重发` : sendingPhoneCode ? '发送中...' : '发送'}}
              </button>
            </div>
          </label>


          <button type="submit" :disabled="loading">{{ loading ? '注册中...' : '注册' }}</button>
        </form>

        <p v-if="message" :class="['alert', messageType]">{{ message }}</p>
        <p class="auth-switch">已有账号？<router-link to="/login">返回登录</router-link></p>
      </section>
    </main>
  </div>
</template>
