<script setup>
import { ref, watch } from 'vue'
import { CheckCircle2 } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import { getAlert, handleAlert } from '@/api/security'
import { getApiErrorMessage } from '@/utils/apiError'
import { resolveAlertLevel, resolveAlertStatus } from '@/config/securityStatus'
import { confirmAction } from '@/composables/useActionDialog'
import { useRequestGate } from '@/composables/useRequestGate'
import '@/views/security/security.css'

const props = defineProps({ open: Boolean, alertId: { type: [Number, String], default: '' } })
const emit = defineEmits(['close', 'handled'])
const loading = ref(false), handling = ref(false), error = ref(''), detail = ref(null)
const requestGate = useRequestGate()
const formatTime = (value) => value ? String(value).replace('T', ' ') : '-'

async function load() {
  if (!props.open || !props.alertId) return
  const current = requestGate.begin()
  loading.value = true; error.value = ''
  try {
    const response = await getAlert(props.alertId)
    if (!requestGate.isCurrent(current)) return
    if (response.data?.code !== 200) throw new Error(response.data?.message || '告警详情加载失败')
    detail.value = response.data.data
  } catch (cause) {
    if (!requestGate.isCurrent(current)) return
    error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '告警详情加载失败')
  } finally { if (requestGate.isCurrent(current)) loading.value = false }
}
async function handle() {
  if (!detail.value || Number(detail.value.status) === 1 || handling.value) return
  if (!await confirmAction({
    title: '确认处理告警',
    message: `告警 ${detail.value.id} 将标记为已处理。`,
    confirmLabel: '标记已处理'
  })) return
  handling.value = true; error.value = ''
  try {
    const response = await handleAlert(detail.value.id)
    if (response.data?.code !== 200) throw new Error(response.data?.message || '告警处理失败')
    await load(); emit('handled', detail.value)
  } catch (cause) { error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '告警处理失败') }
  finally { handling.value = false }
}
function close() { if (!handling.value) emit('close') }
watch([() => props.open, () => props.alertId], ([open]) => { requestGate.invalidate(); detail.value = null; error.value = ''; if (open) load() }, { immediate: true })
</script>

<template><AppDrawer :open="open" :title="`告警 ${alertId}`" kicker="告警详情" width="560px" :close-disabled="handling" @close="close"><p v-if="error" class="alert error">{{ error }}</p><StateBlock v-if="loading && !detail" type="loading" title="正在加载告警详情" /><template v-if="detail"><div class="security-actions"><span :class="['status-pill', `status-pill--${resolveAlertLevel(detail.level).tone}`]">{{ resolveAlertLevel(detail.level).label }}</span><span :class="['status-pill', `status-pill--${resolveAlertStatus(detail.status).tone}`]">{{ resolveAlertStatus(detail.status).label }}</span></div><dl class="security-detail-list"><dt>规则编码</dt><dd>{{ detail.ruleCode || '-' }}</dd><dt>标题</dt><dd>{{ detail.title || '-' }}</dd><dt>MAC</dt><dd>{{ detail.mac || '-' }}</dd><dt>用户 ID</dt><dd>{{ detail.userId ?? '-' }}</dd><dt>详情</dt><dd>{{ detail.detail || '-' }}</dd><dt>处理人 ID</dt><dd>{{ detail.handleUserId ?? '-' }}</dd><dt>处理时间</dt><dd>{{ formatTime(detail.handleTime) }}</dd><dt>创建时间</dt><dd>{{ formatTime(detail.createTime) }}</dd></dl><button v-if="Number(detail.status) !== 1" type="button" :disabled="handling" @click="handle"><CheckCircle2 :size="16" />{{ handling ? '处理中...' : '标记为已处理' }}</button></template></AppDrawer></template>
