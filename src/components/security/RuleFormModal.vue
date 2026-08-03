<script setup>
import { reactive, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { createRule, updateRule } from '@/api/security'
import { getApiErrorMessage } from '@/utils/apiError'
import { RULE_ACTIONS, RULE_TYPES } from '@/config/securityStatus'
import '@/views/security/security.css'

const props = defineProps({ open: Boolean, rule: { type: Object, default: null } })
const emit = defineEmits(['close', 'saved'])
const saving = ref(false)
const error = ref('')
const form = reactive({ ruleCode: '', ruleType: 1, pattern: '', actionType: 3, level: 1, enabled: 1, description: '' })
const ruleTypeOptions = Object.entries(RULE_TYPES)
const actionOptions = Object.entries(RULE_ACTIONS)

function reset() {
  Object.assign(form, {
    ruleCode: props.rule?.ruleCode || '',
    ruleType: Number(props.rule?.ruleType ?? 1),
    pattern: props.rule?.pattern || '',
    actionType: Number(props.rule?.actionType ?? 3),
    level: Number(props.rule?.level ?? 1),
    enabled: Number(props.rule?.enabled ?? 1),
    description: props.rule?.description || ''
  })
  error.value = ''
}

function close() {
  if (!saving.value) emit('close')
}

async function submit() {
  const ruleCode = form.ruleCode.trim()
  const pattern = form.pattern.trim()
  if (!ruleCode || !pattern) {
    error.value = '规则编码和匹配值不能为空'
    return
  }

  saving.value = true
  error.value = ''
  const payload = {
    ruleType: Number(form.ruleType),
    pattern,
    actionType: Number(form.actionType),
    level: Number(form.level),
    enabled: Number(form.enabled),
    description: form.description.trim() || null
  }

  try {
    const response = props.rule?.id
      ? await updateRule(props.rule.id, payload)
      : await createRule({ ...payload, ruleCode })
    if (response.data?.code !== 200) throw new Error(response.data?.message || '规则保存失败')
    emit('saved', response.data.data)
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '规则保存失败')
  } finally {
    saving.value = false
  }
}

watch([() => props.open, () => props.rule?.id], ([open]) => { if (open) reset() }, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="security-modal-backdrop" @click.self="close">
      <form class="security-modal glass-panel security-form" role="dialog" aria-modal="true" @submit.prevent="submit">
        <header class="security-panel-header">
          <div><p class="page-kicker">访问规则</p><h3>{{ rule?.id ? '编辑规则' : '新增规则' }}</h3></div>
          <button class="icon-button" type="button" :disabled="saving" title="关闭" @click="close"><X :size="18" /></button>
        </header>
        <p v-if="error" class="alert error">{{ error }}</p>
        <label><span>规则编码</span><input v-model="form.ruleCode" maxlength="64" :disabled="!!rule?.id || saving" required /></label>
        <div class="security-form-row">
          <label><span>规则类型</span><select v-model="form.ruleType" :disabled="saving"><option v-for="([value, item]) in ruleTypeOptions" :key="value" :value="Number(value)">{{ item.label }}</option></select></label>
          <label><span>执行动作</span><select v-model="form.actionType" :disabled="saving"><option v-for="([value, item]) in actionOptions" :key="value" :value="Number(value)">{{ item.label }}</option></select></label>
        </div>
        <label><span>匹配值</span><input v-model="form.pattern" maxlength="255" :disabled="saving" required placeholder="域名、SNI、IPv4、IPv6 或 CIDR" /></label>
        <div class="security-form-row">
          <label><span>告警级别</span><select v-model="form.level" :disabled="saving"><option :value="1">低</option><option :value="2">中</option><option :value="3">高</option></select></label>
          <label><span>启用状态</span><select v-model="form.enabled" :disabled="saving"><option :value="1">启用</option><option :value="0">停用</option></select></label>
        </div>
        <label><span>描述</span><textarea v-model="form.description" maxlength="255" :disabled="saving"></textarea></label>
        <button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存规则' }}</button>
      </form>
    </div>
  </Teleport>
</template>
