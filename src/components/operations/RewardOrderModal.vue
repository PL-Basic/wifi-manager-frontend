<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Gift, X } from 'lucide-vue-next'
import { createRewardOrder } from '@/api/operations'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import { formatDuration, formatMoney } from '@/utils/billing'
import '@/views/operations/operations.css'

const props = defineProps({
  open: Boolean,
  userId: { type: [Number, String], default: '' }
})
const emit = defineEmits(['close', 'saved'])

const UNIT_SECONDS = { SECOND: 1, MINUTE: 60, HOUR: 3600, DAY: 86400 }
const saving = ref(false)
const error = ref('')
const form = reactive({ mode: 'DURATION', durationValue: '1', durationUnit: 'DAY', amountYuan: '0', reason: '' })
let pendingIntent = ''
let pendingRequestId = ''

const grantSeconds = computed(() => {
  const value = Number(form.durationValue)
  const multiplier = UNIT_SECONDS[form.durationUnit] || 0
  return Number.isSafeInteger(value) && value > 0 ? value * multiplier : 0
})

const amountCents = computed(() => {
  const value = Number(form.amountYuan)
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : -1
})

function requestIdFor(payload) {
  const intent = JSON.stringify([props.userId, payload.mode, payload.grantSeconds, payload.amountCents, payload.reason])
  if (intent !== pendingIntent) {
    pendingIntent = intent
    pendingRequestId = `REWARD-${props.userId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.slice(0, 56)
  }
  return pendingRequestId
}

async function submit() {
  const reason = form.reason.trim()
  if (!Number.isSafeInteger(grantSeconds.value) || grantSeconds.value <= 0) {
    error.value = '奖励时长必须是大于 0 的整数'
    return
  }
  if (!Number.isSafeInteger(amountCents.value) || amountCents.value < 0 || !reason) {
    error.value = '奖励价值必须是有效金额，且奖励原因不能为空'
    return
  }

  const payload = {
    mode: form.mode,
    grantSeconds: grantSeconds.value,
    amountCents: amountCents.value,
    reason
  }
  const confirmed = await confirmAction({
    title: '确认创建奖励订单',
    message: `将为用户 ${props.userId} 创建 ${formatMoney(payload.amountCents)}、${formatDuration(payload.grantSeconds)} 的${payload.mode === 'SUBSCRIPTION' ? '订阅' : '时长'}奖励订单，提交后立即生效。`,
    confirmLabel: '创建并生效'
  })
  if (!confirmed) return

  saving.value = true
  error.value = ''

  try {
    const response = await createRewardOrder(props.userId, {
      ...payload,
      requestId: requestIdFor(payload)
    })
    if (response.data?.code !== 200) throw new Error(response.data?.message || '奖励订单创建失败')
    pendingIntent = ''
    pendingRequestId = ''
    emit('saved', response.data.data)
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '奖励订单创建失败')
  } finally {
    saving.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, { mode: 'DURATION', durationValue: '1', durationUnit: 'DAY', amountYuan: '0', reason: '' })
    error.value = ''
    pendingIntent = ''
    pendingRequestId = ''
  },
  { immediate: true }
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="operations-modal-backdrop" @click.self="!saving && emit('close')">
      <form class="operations-modal glass-panel operations-form" @submit.prevent="submit">
        <header class="operations-modal-header">
          <div><p class="page-kicker">超级管理员操作</p><h3>创建奖励订单</h3></div>
          <button class="icon-button" type="button" :disabled="saving" title="关闭" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
        </header>

        <p v-if="error" class="alert error">{{ error }}</p>
        <label><span>权益模式</span><select v-model="form.mode"><option value="DURATION">时长权益</option><option value="SUBSCRIPTION">订阅权益</option></select></label>
        <div class="operations-form-row">
          <label><span>奖励时长</span><input v-model="form.durationValue" type="number" min="1" step="1" required /></label>
          <label><span>时长单位</span><select v-model="form.durationUnit"><option value="SECOND">秒</option><option value="MINUTE">分钟</option><option value="HOUR">小时</option><option value="DAY">天</option></select></label>
        </div>
        <label><span>奖励名义价值（元）</span><input v-model="form.amountYuan" type="number" min="0" step="0.01" required /></label>
        <label><span>奖励原因</span><textarea v-model="form.reason" maxlength="255" required /></label>

        <dl class="operations-detail">
          <dt>目标用户</dt><dd>{{ userId }}</dd>
          <dt>生效权益</dt><dd>{{ formatDuration(grantSeconds) }}</dd>
          <dt>订单价值</dt><dd>{{ formatMoney(amountCents) }}</dd>
          <dt>实际支付</dt><dd>¥0.00（奖励订单）</dd>
        </dl>

        <button type="submit" :disabled="saving"><Gift :size="16" />{{ saving ? '创建中...' : '创建并立即生效' }}</button>
      </form>
    </div>
  </Teleport>
</template>
