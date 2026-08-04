<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Eye, RefreshCw, Search } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import { useRequestGate } from '@/composables/useRequestGate'
import AlertDetailDrawer from '@/components/security/AlertDetailDrawer.vue'
import { getAlerts } from '@/api/security'
import { getApiErrorMessage } from '@/utils/apiError'
import { ALERT_LEVELS, ALERT_STATUSES, resolveAlertLevel, resolveAlertStatus } from '@/config/securityStatus'
import './security.css'

const loading = ref(false), loaded = ref(false), error = ref(''), rows = ref([]), pendingAlerts = ref(0)
const drawerOpen = ref(false), selectedId = ref('')
const filters = reactive({ level: '', status: '', mac: '', startTime: '', endTime: '' })
const applied = reactive({ ...filters })
const pager = reactive({ current: 1, size: 10, total: 0 })
const requestGate = useRequestGate()
const formatTime = (value) => value ? String(value).replace('T', ' ') : '-'
function params(page) { const value = { current: page, size: pager.size }; Object.entries(applied).forEach(([key, item]) => { const text = String(item ?? '').trim(); if (text) value[key] = key === 'mac' ? text.toUpperCase() : text }); return value }
async function load(page = pager.current) {
  const version = requestGate.begin(); loading.value = true; error.value = ''
  try { const response = await getAlerts(params(page)); if (!requestGate.isCurrent(version)) return; if (response.data?.code !== 200) throw new Error(response.data?.message || '告警加载失败'); const data = response.data.data || {}; pager.current = Number(data.current) || page; pager.size = Number(data.size) || pager.size; pager.total = Number(data.total) || 0; rows.value = Array.isArray(data.records) ? data.records : []; loaded.value = true; pendingAlerts.value = 0 }
  catch (cause) { if (requestGate.isCurrent(version)) { error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '告警加载失败'); loaded.value = true } }
  finally { if (requestGate.isCurrent(version)) loading.value = false }
}
function search() { if (filters.startTime && filters.endTime && filters.startTime > filters.endTime) { requestGate.invalidate(); loading.value = false; error.value = '开始时间不能晚于结束时间'; return } Object.assign(applied, filters); load(1) }
function reset() { Object.assign(filters, { level: '', status: '', mac: '', startTime: '', endTime: '' }); search() }
function open(id) { selectedId.value = id; drawerOpen.value = true }
function close() { drawerOpen.value = false; selectedId.value = '' }
function handled(detail) { rows.value = rows.value.map((row) => row.id === detail?.id ? { ...row, ...detail } : row) }
function onAlert() { pendingAlerts.value += 1 }
onMounted(() => { load(1); window.addEventListener('wifi:alert-received', onAlert) })
onBeforeUnmount(() => { window.removeEventListener('wifi:alert-received', onAlert) })
</script>
<template><section class="workspace-view security-page"><header class="dashboard-header"><div><p class="page-kicker">安全工作区</p><h2>告警</h2></div><button class="secondary-button" type="button" :disabled="loading" @click="load()"><RefreshCw :size="16" />刷新</button></header><button v-if="pendingAlerts" class="security-inline-message" type="button" @click="load(1)">有 {{ pendingAlerts }} 条新告警，点击刷新</button><p v-if="error" class="alert error security-inline-message">{{ error }}</p><form class="glass-toolbar security-toolbar" @submit.prevent="search"><label><span>级别</span><select v-model="filters.level"><option value="">全部级别</option><option v-for="(item, value) in ALERT_LEVELS" :key="value" :value="value">{{ item.label }}</option></select></label><label><span>状态</span><select v-model="filters.status"><option value="">全部状态</option><option v-for="(item, value) in ALERT_STATUSES" :key="value" :value="value">{{ item.label }}</option></select></label><label><span>MAC</span><input v-model="filters.mac" maxlength="17" /></label><label><span>开始时间</span><input v-model="filters.startTime" type="datetime-local" /></label><label><span>结束时间</span><input v-model="filters.endTime" type="datetime-local" /></label><div class="security-actions"><button type="submit" :disabled="loading"><Search :size="16" />查询</button><button class="secondary-button" type="button" :disabled="loading" @click="reset">重置</button></div></form><StateBlock v-if="loading && !loaded" type="loading" title="正在加载告警" /><StateBlock v-else-if="loaded && !error && !rows.length" title="暂无告警" /><section v-if="loaded && rows.length" class="glass-panel security-table-wrap"><table class="security-table"><thead><tr><th>ID</th><th>级别</th><th>状态</th><th>规则</th><th>标题</th><th>MAC</th><th>创建时间</th><th>操作</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td>{{ row.id }}</td><td><span :class="['status-pill', `status-pill--${resolveAlertLevel(row.level).tone}`]">{{ resolveAlertLevel(row.level).label }}</span></td><td><span :class="['status-pill', `status-pill--${resolveAlertStatus(row.status).tone}`]">{{ resolveAlertStatus(row.status).label }}</span></td><td>{{ row.ruleCode || '-' }}</td><td class="wrap-cell">{{ row.title || '-' }}</td><td>{{ row.mac || '-' }}</td><td>{{ formatTime(row.createTime) }}</td><td><button class="icon-button" type="button" title="查看告警详情" @click="open(row.id)"><Eye :size="16" /></button></td></tr></tbody></table></section><AppPagination v-if="loaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="loading" @change="load"/><AlertDetailDrawer :open="drawerOpen" :alert-id="selectedId" @close="close" @handled="handled" /></section></template>
