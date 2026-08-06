<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Eye, RefreshCw, Search } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import { useRequestGate } from '@/composables/useRequestGate'
import AuditDetailDrawer from '@/components/security/AuditDetailDrawer.vue'
import { getAudits } from '@/api/security'
import { getApiErrorMessage } from '@/utils/apiError'
import './security.css'
const loading = ref(false), loaded = ref(false), error = ref(''), rows = ref([]), drawerOpen = ref(false), selectedId = ref('')
const filters = reactive({ action: '', operatorName: '', target: '', startTime: '', endTime: '' }), applied = reactive({ ...filters })
const pager = reactive({ current: 1, size: 10, total: 0 }); const requestGate = useRequestGate()
const formatTime = (value) => value ? String(value).replace('T', ' ') : '-'
function params(page) { const value = { current: page, size: pager.size }; Object.entries(applied).forEach(([key, item]) => { const text = String(item ?? '').trim(); if (text) value[key] = text }); return value }
async function load(page = pager.current) { const version = requestGate.begin(); loading.value = true; error.value = ''; try { const response = await getAudits(params(page)); if (!requestGate.isCurrent(version)) return; if (response.data?.code !== 200) throw new Error(response.data?.message || '操作记录加载失败'); const data = response.data.data || {}; pager.current = Number(data.current) || page; pager.size = Number(data.size) || pager.size; pager.total = Number(data.total) || 0; rows.value = Array.isArray(data.records) ? data.records : []; loaded.value = true } catch (cause) { if (requestGate.isCurrent(version)) { error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '操作记录加载失败'); loaded.value = true } } finally { if (requestGate.isCurrent(version)) loading.value = false } }
function search() { if (filters.startTime && filters.endTime && filters.startTime > filters.endTime) { requestGate.invalidate(); loading.value = false; error.value = '开始时间不能晚于结束时间'; return } Object.assign(applied, filters); load(1) }
function reset() { Object.assign(filters, { action: '', operatorName: '', target: '', startTime: '', endTime: '' }); search() }
function open(id) { selectedId.value = id; drawerOpen.value = true }
function close() { drawerOpen.value = false; selectedId.value = '' }
onMounted(() => load(1))
</script>
<template><section class="workspace-view security-page"><header class="dashboard-header"><div><p class="page-kicker">安全工作区</p><h2>操作记录</h2></div><button class="secondary-button" :disabled="loading" @click="load()"><RefreshCw :size="16" />刷新</button></header><p v-if="error" class="alert error security-inline-message">{{ error }}</p><form class="glass-toolbar security-toolbar" @submit.prevent="search"><label><span>操作类型</span><input v-model="filters.action" placeholder="例如：处理告警" /></label><label><span>操作人</span><input v-model="filters.operatorName" /></label><label><span>操作对象</span><input v-model="filters.target" /></label><label><span>开始时间</span><input v-model="filters.startTime" type="datetime-local" /></label><label><span>结束时间</span><input v-model="filters.endTime" type="datetime-local" /></label><div class="security-actions"><button type="submit" :disabled="loading"><Search :size="16" />查询</button><button class="secondary-button" type="button" :disabled="loading" @click="reset">重置</button></div></form><StateBlock v-if="loading && !loaded" type="loading" title="正在加载操作记录" /><StateBlock v-else-if="loaded && !error && !rows.length" title="暂无操作记录" /><section v-if="loaded && rows.length" class="glass-panel security-table-wrap"><table class="security-table"><thead><tr><th>记录编号</th><th>操作类型</th><th>操作人</th><th>操作对象</th><th>来源 IP</th><th>操作时间</th><th>操作</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td>{{ row.id }}</td><td>{{ row.action || '-' }}</td><td>{{ row.operatorName || '-' }}</td><td class="wrap-cell">{{ row.target || '-' }}</td><td>{{ row.ip || '-' }}</td><td>{{ formatTime(row.createTime) }}</td><td><button class="icon-button" type="button" title="查看操作详情" @click="open(row.id)"><Eye :size="16" /></button></td></tr></tbody></table></section><AppPagination v-if="loaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="loading" @change="load"/><AuditDetailDrawer :open="drawerOpen" :audit-id="selectedId" @close="close" /></section></template>
