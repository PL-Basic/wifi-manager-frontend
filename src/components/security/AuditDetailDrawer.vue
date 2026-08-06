<script setup>
import { ref, watch } from 'vue'
import StateBlock from '@/components/StateBlock.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import { getAudit } from '@/api/security'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'
import '@/views/security/security.css'
const props = defineProps({ open: Boolean, auditId: { type: [Number, String], default: '' } })
const emit = defineEmits(['close'])
const loading = ref(false), error = ref(''), detail = ref(null)
const requestGate = useRequestGate()
const formatTime = (value) => value ? String(value).replace('T', ' ') : '-'
async function load() {
  if (!props.open || !props.auditId) return
  const current = requestGate.begin(); loading.value = true; error.value = ''
  try { const response = await getAudit(props.auditId); if (!requestGate.isCurrent(current)) return; if (response.data?.code !== 200) throw new Error(response.data?.message || '操作详情加载失败'); detail.value = response.data.data }
  catch (cause) { if (requestGate.isCurrent(current)) error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '操作详情加载失败') }
  finally { if (requestGate.isCurrent(current)) loading.value = false }
}
watch([() => props.open, () => props.auditId], ([open]) => { requestGate.invalidate(); detail.value = null; error.value = ''; if (open) load() }, { immediate: true })
</script>
<template><AppDrawer :open="open" :title="`操作记录 ${auditId}`" kicker="操作详情" width="560px" @close="emit('close')"><p v-if="error" class="alert error">{{ error }}</p><StateBlock v-if="loading && !detail" type="loading" title="正在加载操作详情" /><dl v-if="detail" class="security-detail-list"><dt>操作人编号</dt><dd>{{ detail.operatorId ?? '-' }}</dd><dt>操作人</dt><dd>{{ detail.operatorName || '-' }}</dd><dt>操作类型</dt><dd>{{ detail.action || '-' }}</dd><dt>操作对象</dt><dd>{{ detail.target || '-' }}</dd><dt>详细信息</dt><dd>{{ detail.detail || '-' }}</dd><dt>来源 IP</dt><dd>{{ detail.ip || '-' }}</dd><dt>操作时间</dt><dd>{{ formatTime(detail.createTime) }}</dd></dl></AppDrawer></template>
