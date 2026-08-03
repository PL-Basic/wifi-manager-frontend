<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import RuleFormModal from '@/components/security/RuleFormModal.vue'
import { deleteRule, getRules, toggleRule } from '@/api/security'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import { useRequestGate } from '@/composables/useRequestGate'
import { RULE_TYPES, resolveRuleAction, resolveRuleType } from '@/config/securityStatus'
import './security.css'

const loading = ref(false), loaded = ref(false), error = ref(''), message = ref(''), rows = ref([])
const editorOpen = ref(false), selectedRule = ref(null)
const busyRuleId = ref('')
const filters = reactive({ keyword: '', ruleType: '', enabled: '' })
const applied = reactive({ ...filters })
const pager = reactive({ current: 1, size: 10, total: 0 })
const requestGate = useRequestGate()

function statusClass(info) { return ['status-pill', `status-pill--${info.tone}`] }
function readPage(response) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || '规则加载失败')
  return response.data.data || {}
}
function params(page) {
  const value = { current: page, size: pager.size }
  if (applied.keyword.trim()) value.keyword = applied.keyword.trim()
  if (applied.ruleType !== '') value.ruleType = applied.ruleType
  if (applied.enabled !== '') value.enabled = applied.enabled
  return value
}
async function load(page = pager.current) {
  const version = requestGate.begin()
  loading.value = true; error.value = ''
  try {
    const data = readPage(await getRules(params(page)))
    if (!requestGate.isCurrent(version)) return
    pager.current = Number(data.current) || page; pager.size = Number(data.size) || pager.size; pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records) ? data.records : []; loaded.value = true
  } catch (cause) {
    if (!requestGate.isCurrent(version)) return
    error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '规则加载失败'); loaded.value = true
  } finally { if (requestGate.isCurrent(version)) loading.value = false }
}
function search() { Object.assign(applied, filters); load(1) }
function reset() { Object.assign(filters, { keyword: '', ruleType: '', enabled: '' }); search() }
function openEditor(rule = null) { selectedRule.value = rule; editorOpen.value = true; message.value = '' }
function closeEditor() { editorOpen.value = false; selectedRule.value = null }
async function saved() { closeEditor(); message.value = '规则已保存'; await load(pager.current) }
async function changeEnabled(rule) {
  if (busyRuleId.value) return
  const next = Number(rule.enabled) === 1 ? 0 : 1
  if (!await confirmAction({
    title: `确认${next ? '启用' : '停用'}规则`,
    message: `规则 ${rule.ruleCode} 的状态将立即影响后续访问判定。`,
    confirmLabel: next ? '启用规则' : '停用规则'
  })) return
  busyRuleId.value = String(rule.id); error.value = ''; message.value = ''
  try {
    const response = await toggleRule(rule.id, next)
    if (response.data?.code !== 200) throw new Error(response.data?.message || '规则状态修改失败')
    message.value = `规则已${next ? '启用' : '停用'}`; await load(pager.current)
  }
  catch (cause) { error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '规则状态修改失败') }
  finally { busyRuleId.value = '' }
}
async function remove(rule) {
  if (busyRuleId.value) return
  if (!await confirmAction({
    title: '确认删除规则',
    message: `规则 ${rule.ruleCode} 删除后不能恢复。`,
    confirmLabel: '删除规则',
    tone: 'danger'
  })) return
  busyRuleId.value = String(rule.id); error.value = ''; message.value = ''
  try {
    const response = await deleteRule(rule.id)
    if (response.data?.code !== 200) throw new Error(response.data?.message || '规则删除失败')
    message.value = '规则已删除'; await load(rows.value.length === 1 && pager.current > 1 ? pager.current - 1 : pager.current)
  }
  catch (cause) { error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '规则删除失败') }
  finally { busyRuleId.value = '' }
}
onMounted(() => load(1))
</script>

<template>
  <section class="workspace-view security-page">
    <header class="dashboard-header"><div><p class="page-kicker">安全工作区</p><h2>访问规则</h2></div><div class="security-actions"><button class="secondary-button" type="button" :disabled="loading" @click="load()"><RefreshCw :size="16" />刷新</button><button type="button" @click="openEditor()"><Plus :size="16" />新增规则</button></div></header>
    <p v-if="error" class="alert error security-inline-message">{{ error }}</p><p v-if="message" class="alert success security-inline-message">{{ message }}</p>
    <form class="glass-toolbar security-toolbar" @submit.prevent="search">
      <label><span>关键字</span><input v-model="filters.keyword" placeholder="编码、匹配值或描述" /></label>
      <label><span>规则类型</span><select v-model="filters.ruleType"><option value="">全部类型</option><option v-for="(item, value) in RULE_TYPES" :key="value" :value="value">{{ item.label }}</option></select></label>
      <label><span>启用状态</span><select v-model="filters.enabled"><option value="">全部状态</option><option value="1">启用</option><option value="0">停用</option></select></label>
      <div class="security-actions"><button type="submit" :disabled="loading"><Search :size="16" />查询</button><button class="secondary-button" type="button" :disabled="loading" @click="reset">重置</button></div>
    </form>
    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载规则" />
    <StateBlock v-else-if="loaded && !error && !rows.length" title="暂无访问规则" text="当前筛选条件下没有规则" />
    <section v-if="loaded && rows.length" class="glass-panel security-table-wrap"><table class="security-table"><thead><tr><th>编码</th><th>类型</th><th>匹配值</th><th>动作</th><th>级别</th><th>状态</th><th>描述</th><th>操作</th></tr></thead><tbody><tr v-for="rule in rows" :key="rule.id"><td>{{ rule.ruleCode }}</td><td>{{ resolveRuleType(rule.ruleType).label }}</td><td class="wrap-cell">{{ rule.pattern }}</td><td><span :class="statusClass(resolveRuleAction(rule.actionType))">{{ resolveRuleAction(rule.actionType).label }}</span></td><td>{{ rule.level ?? '-' }}</td><td><span :class="['status-pill', rule.enabled ? 'status-pill--success' : 'status-pill--neutral']">{{ rule.enabled ? '启用' : '停用' }}</span></td><td class="wrap-cell">{{ rule.description || '-' }}</td><td class="security-actions"><button class="icon-button" type="button" :disabled="!!busyRuleId" title="编辑规则" @click="openEditor(rule)"><Pencil :size="16" /></button><button class="secondary-button compact-button" type="button" :disabled="!!busyRuleId" @click="changeEnabled(rule)">{{ rule.enabled ? '停用' : '启用' }}</button><button class="icon-button" type="button" :disabled="!!busyRuleId" title="删除规则" @click="remove(rule)"><Trash2 :size="16" /></button></td></tr></tbody></table></section>
    <AppPagination v-if="loaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="loading" @change="load" />
    <RuleFormModal :open="editorOpen" :rule="selectedRule" @close="closeEditor" @saved="saved" />
  </section>
</template>
