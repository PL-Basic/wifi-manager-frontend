<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { KeyRound, Send, X } from 'lucide-vue-next'
import { sendVerifyCode } from '@/api/auth'
import { getApiErrorMessage } from '@/utils/apiError'
import { maskContact } from '@/utils/accountHistory'

const props = defineProps({
  open: Boolean,
  account: { type: Object, default: null },
  submitting: Boolean,
  submitError: { type: String, default: '' }
})

const emit = defineEmits(['close', 'submit'])
const target = ref('')
const code = ref('')
const sending = ref(false)
const cooldown = ref(0)
const localError = ref('')
const codeInput = ref(null)
const contactSelect = ref(null)
let timer = null

const contacts = computed(() => Array.isArray(props.account?.contacts) ? props.account.contacts : [])
const busy = computed(() => props.submitting || sending.value)

function stopTimer() {
  if (timer) window.clearInterval(timer)
  timer = null
}

function reset() {
  stopTimer()
  target.value = contacts.value[0]?.target || ''
  code.value = ''
  cooldown.value = 0
  localError.value = ''
}

function close() {
  if (!busy.value) emit('close')
}

async function sendCode() {
  if (!target.value || sending.value || cooldown.value) return
  sending.value = true
  localError.value = ''
  try {
    const response = await sendVerifyCode({ target: target.value, scene: 'login' })
    if (response.data?.code !== 200) throw new Error(response.data?.message || '验证码发送失败')
    cooldown.value = 60
    stopTimer()
    timer = window.setInterval(() => {
      cooldown.value = Math.max(0, cooldown.value - 1)
      if (!cooldown.value) stopTimer()
    }, 1000)
    await nextTick()
    codeInput.value?.focus()
  } catch (error) {
    localError.value = error instanceof Error && !error.response
      ? error.message
      : getApiErrorMessage(error, '验证码发送失败')
  } finally {
    sending.value = false
  }
}

function submit() {
  localError.value = ''
  if (!target.value || !/^[A-Za-z0-9]{6}$/.test(code.value.trim())) {
    localError.value = '请输入 6 位验证码'
    return
  }
  emit('submit', { target: target.value, code: code.value.trim() })
}

function handleKeydown(event) {
  if (props.open && event.key === 'Escape') close()
}

watch(() => props.open, (value) => {
  if (value) {
    reset()
    nextTick(() => contactSelect.value?.focus())
  }
  else stopTimer()
})

watch(() => props.account?.userId, () => {
  if (props.open) reset()
})

window.addEventListener('keydown', handleKeydown)
onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="account-switch-backdrop" @click.self="close">
      <section class="account-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="account-switch-title">
        <header>
          <div><p>身份验证</p><h3 id="account-switch-title">切换到 {{ account?.nickname || account?.username }}</h3></div>
          <button class="icon-button" type="button" :disabled="busy" title="关闭" aria-label="关闭" @click="close"><X :size="18" /></button>
        </header>

        <div class="account-switch-notice"><KeyRound :size="19" /><p>新账号必须重新验证。验证成功后会先结束当前设备的网络认证，再替换登录会话。</p></div>
        <p v-if="localError || submitError" class="alert error" role="alert">{{ localError || submitError }}</p>

        <form @submit.prevent="submit">
          <label><span>验证方式</span><select ref="contactSelect" v-model="target" :disabled="busy"><option v-for="contact in contacts" :key="contact.target" :value="contact.target">{{ contact.type === 'phone' ? '手机号' : '邮箱' }} {{ maskContact(contact.target) }}</option></select></label>
          <label><span>验证码</span><div class="code-row"><input ref="codeInput" v-model="code" type="text" maxlength="6" autocomplete="one-time-code" placeholder="请输入 6 位验证码" :disabled="busy" /><button class="secondary-button" type="button" :disabled="busy || cooldown > 0 || !target" @click="sendCode"><Send :size="16" />{{ cooldown ? `${cooldown}s` : sending ? '发送中' : '发送验证码' }}</button></div></label>
          <div class="account-switch-actions"><button class="secondary-button" type="button" :disabled="busy" @click="close">取消</button><button type="submit" :disabled="busy || !target">{{ submitting ? '正在切换...' : '验证并切换' }}</button></div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.account-switch-backdrop { position: fixed; z-index: 120; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(4, 10, 12, .7); }
.account-switch-dialog { width: min(500px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 20px; border: 1px solid var(--wm-border); border-radius: 8px; color: var(--wm-text); background: var(--wm-surface); box-shadow: 0 24px 72px rgba(0, 0, 0, .35); }
.account-switch-dialog > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.account-switch-dialog header p, .account-switch-dialog header h3 { margin: 0; }
.account-switch-dialog header p { color: #70c7bb; font-size: 12px; font-weight: 800; }
.account-switch-dialog header h3 { margin-top: 4px; font-size: 19px; overflow-wrap: anywhere; }
.account-switch-notice { display: flex; align-items: flex-start; gap: 10px; margin: 16px 0; padding: 12px; border-left: 3px solid #70c7bb; color: var(--wm-text-soft); background: var(--wm-bg-soft); }
.account-switch-notice svg { flex: 0 0 auto; color: #70c7bb; }
.account-switch-notice p { margin: 0; line-height: 1.55; }
.account-switch-dialog form { display: grid; gap: 16px; }
.account-switch-dialog label { display: grid; gap: 7px; }
.account-switch-dialog label > span { color: var(--wm-text-soft); font-size: 13px; font-weight: 700; }
.account-switch-dialog select, .account-switch-dialog input { min-width: 0; }
.account-switch-dialog .code-row { grid-template-columns: minmax(0, 1fr) auto; }
.account-switch-dialog .code-row button { min-width: 122px; }
.account-switch-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 2px; }
@media (max-width: 520px) { .account-switch-dialog { padding: 16px; } .account-switch-dialog .code-row { grid-template-columns: 1fr; } .account-switch-dialog .code-row button { width: 100%; } .account-switch-actions { flex-direction: column-reverse; } .account-switch-actions button { width: 100%; } }
</style>
