<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { KeyRound, Send, X } from 'lucide-vue-next'
import { sendVerifyCode } from '@/api/auth'
import { getApiErrorMessage } from '@/utils/apiError'
import { maskContact } from '@/utils/accountHistory'

const props = defineProps({
  open: Boolean,
  contacts: { type: Array, default: () => [] },
  submitting: Boolean,
  submitError: { type: String, default: '' }
})

const emit = defineEmits(['close', 'submit'])
const target = ref('')
const manualTarget = ref('')
const code = ref('')
const sending = ref(false)
const cooldown = ref(0)
const localError = ref('')
const codeInput = ref(null)
let timer = null

const normalizedContacts = computed(() => props.contacts.filter((item) => item?.target))
const selectedTarget = computed(() => target.value === '__manual__' ? manualTarget.value.trim() : target.value)
const busy = computed(() => props.submitting || sending.value)

function stopTimer() {
  if (timer) window.clearInterval(timer)
  timer = null
}

function reset() {
  stopTimer()
  target.value = normalizedContacts.value[0]?.target || '__manual__'
  manualTarget.value = ''
  code.value = ''
  cooldown.value = 0
  localError.value = ''
}

async function sendCode() {
  if (!selectedTarget.value || sending.value || cooldown.value) return
  sending.value = true
  localError.value = ''
  try {
    await sendVerifyCode({ target: selectedTarget.value, scene: 'step_up' })
    cooldown.value = 60
    timer = window.setInterval(() => {
      cooldown.value = Math.max(0, cooldown.value - 1)
      if (!cooldown.value) stopTimer()
    }, 1000)
    await nextTick()
    codeInput.value?.focus()
  } catch (error) {
    localError.value = getApiErrorMessage(error, '验证码发送失败')
  } finally {
    sending.value = false
  }
}

function submit() {
  localError.value = ''
  if (!selectedTarget.value) {
    localError.value = '请输入当前账号已绑定的手机号或邮箱'
    return
  }
  if (!code.value.trim()) {
    localError.value = '请输入验证码'
    return
  }
  emit('submit', { target: selectedTarget.value, code: code.value.trim() })
}

function close() {
  if (!busy.value) emit('close')
}

function handleKeydown(event) {
  if (props.open && event.key === 'Escape') close()
}

watch(() => props.open, (value) => {
  if (value) reset()
  else stopTimer()
})

window.addEventListener('keydown', handleKeydown)
onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="step-up-backdrop">
      <section class="step-up-dialog" role="dialog" aria-modal="true" aria-labelledby="step-up-title">
        <header><div><p>安全复核</p><h3 id="step-up-title">确认当前登录环境</h3></div><button class="icon-button" type="button" :disabled="busy" title="关闭" aria-label="关闭" @click="close"><X :size="18" /></button></header>
        <div class="step-up-notice"><KeyRound :size="19" /><p>检测到多个环境信号发生变化。完成验证码复核后，页面会继续使用新的 Access JWT。</p></div>
        <p v-if="localError || submitError" class="alert error">{{ localError || submitError }}</p>
        <form @submit.prevent="submit">
          <label><span>验证方式</span><select v-model="target" :disabled="busy"><option v-for="contact in normalizedContacts" :key="contact.target" :value="contact.target">{{ contact.type === 'phone' ? '手机号' : '邮箱' }} {{ maskContact(contact.target) }}</option><option value="__manual__">输入其他已绑定联系方式</option></select></label>
          <label v-if="target === '__manual__'"><span>手机号或邮箱</span><input v-model="manualTarget" type="text" autocomplete="username" :disabled="busy" /></label>
          <label><span>验证码</span><div class="step-up-code"><input ref="codeInput" v-model="code" maxlength="16" autocomplete="one-time-code" :disabled="busy" /><button class="secondary-button" type="button" :disabled="busy || cooldown > 0 || !selectedTarget" @click="sendCode"><Send :size="16" />{{ cooldown ? `${cooldown}s` : sending ? '发送中' : '发送验证码' }}</button></div></label>
          <footer><button class="secondary-button" type="button" :disabled="busy" @click="close">取消</button><button type="submit" :disabled="busy">{{ submitting ? '正在验证...' : '完成复核' }}</button></footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.step-up-backdrop { position: fixed; z-index: 140; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(4, 10, 12, .76); }
.step-up-dialog { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 20px; border: 1px solid var(--wm-border); border-radius: 8px; color: var(--wm-text); background: var(--wm-surface); box-shadow: 0 24px 72px rgba(0, 0, 0, .38); }
.step-up-dialog header, .step-up-dialog footer { display: flex; justify-content: space-between; gap: 10px; }
.step-up-dialog header p, .step-up-dialog header h3 { margin: 0; }
.step-up-dialog header p { color: #70c7bb; font-size: 12px; font-weight: 800; }
.step-up-notice { display: flex; gap: 10px; margin: 16px 0; padding: 12px; border-left: 3px solid #70c7bb; color: var(--wm-text-soft); background: var(--wm-bg-soft); }
.step-up-notice p { margin: 0; }
.step-up-dialog form, .step-up-dialog label { display: grid; gap: 14px; }
.step-up-dialog label { gap: 7px; }
.step-up-code { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.step-up-dialog footer { justify-content: flex-end; margin-top: 16px; }
@media (max-width: 520px) { .step-up-code { grid-template-columns: 1fr; } .step-up-code button { width: 100%; } }
</style>
