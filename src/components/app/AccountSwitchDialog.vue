<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { KeyRound, Send, X } from 'lucide-vue-next'
import { sendAccountSwitchCode } from '@/api/auth'
import { getApiErrorMessage } from '@/utils/apiError'

const props = defineProps({
  open: Boolean,
  account: { type: Object, default: null },
  submitting: Boolean,
  submitError: { type: String, default: '' }
})

const emit = defineEmits(['close', 'submit'])
const channel = ref('')
const code = ref('')
const maskedTarget = ref('')
const sending = ref(false)
const cooldown = ref(0)
const localError = ref('')
const codeInput = ref(null)
let timer = null

const channels = computed(() => Array.isArray(props.account?.channels) ? props.account.channels : [])
const busy = computed(() => props.submitting || sending.value)

function stopTimer() {
  if (timer) window.clearInterval(timer)
  timer = null
}

function reset() {
  stopTimer()
  channel.value = channels.value[0] || ''
  code.value = ''
  maskedTarget.value = ''
  cooldown.value = 0
  localError.value = ''
}

function close() {
  if (!busy.value) emit('close')
}

async function sendCode() {
  if (!channel.value || sending.value || cooldown.value || !props.account?.userId) return
  sending.value = true
  localError.value = ''
  try {
    const response = await sendAccountSwitchCode({
      expectedUserId: String(props.account.userId),
      channel: channel.value
    })
    maskedTarget.value = response.data?.data?.maskedTarget || ''
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
  if (!channel.value || !code.value.trim()) {
    localError.value = '请选择验证渠道并输入验证码'
    return
  }
  emit('submit', {
    expectedUserId: String(props.account.userId),
    channel: channel.value,
    code: code.value.trim()
  })
}

function handleKeydown(event) {
  if (props.open && event.key === 'Escape') close()
}

watch(() => props.open, (value) => {
  if (value) reset()
  else stopTimer()
})
watch(channel, () => {
  code.value = ''
  maskedTarget.value = ''
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
        <header><div><p>身份验证</p><h3 id="account-switch-title">切换到 {{ account?.nickname || account?.username }}</h3></div><button class="icon-button" type="button" :disabled="busy" title="关闭" aria-label="关闭" @click="close"><X :size="18" /></button></header>
        <div class="account-switch-notice"><KeyRound :size="19" /><p>为了保护账号安全，本机不会保存密码或完整联系方式。验证成功后，当前账号会安全退出并切换到所选账号。</p></div>
        <p v-if="localError || submitError" class="alert error">{{ localError || submitError }}</p>
        <form @submit.prevent="submit">
          <label><span>验证方式</span><select v-model="channel" :disabled="busy"><option v-for="item in channels" :key="item" :value="item">{{ item === 'phone' ? '手机号' : '邮箱' }}</option></select></label>
          <p v-if="maskedTarget" class="account-switch-target">验证码已发送至 {{ maskedTarget }}</p>
          <label><span>验证码</span><div class="code-row"><input ref="codeInput" v-model="code" type="text" maxlength="16" autocomplete="one-time-code" :disabled="busy" /><button class="secondary-button" type="button" :disabled="busy || cooldown > 0 || !channel" @click="sendCode"><Send :size="16" />{{ cooldown ? `${cooldown}s` : sending ? '发送中' : '发送验证码' }}</button></div></label>
          <div class="account-switch-actions"><button class="secondary-button" type="button" :disabled="busy" @click="close">取消</button><button type="submit" :disabled="busy || !channel">{{ submitting ? '正在切换...' : '验证并切换' }}</button></div>
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
.account-switch-notice p, .account-switch-target { margin: 0; line-height: 1.55; }
.account-switch-target { color: #70c7bb; }
.account-switch-dialog form, .account-switch-dialog label { display: grid; gap: 16px; }
.account-switch-dialog label { gap: 7px; }
.account-switch-dialog .code-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.account-switch-actions { display: flex; justify-content: flex-end; gap: 10px; }
@media (max-width: 520px) { .account-switch-dialog { padding: 16px; } .account-switch-dialog .code-row { grid-template-columns: 1fr; } .account-switch-dialog .code-row button { width: 100%; } .account-switch-actions { flex-direction: column-reverse; } .account-switch-actions button { width: 100%; } }
</style>
