<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import { addBlacklist, getBlacklist, removeBlacklist } from '@/api/security'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import { useRequestGate } from '@/composables/useRequestGate'
import './security.css'

const loading = ref(false), loaded = ref(false), error = ref(''), message = ref(''), rows = ref([])
const keyword = ref(''), appliedKeyword = ref('')
const busyMac = ref('')
const form = reactive({ mac: '', reason: '' })
const pager = reactive({ current: 1, size: 10, total: 0 })
const requestGate = useRequestGate()
const macPattern = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/

function readPage(response) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || '黑名单加载失败')
  return response.data.data || {}
}
async function load(page = pager.current) {
  const version = requestGate.begin()
  loading.value = true; error.value = ''
  try {
    const data = readPage(await getBlacklist({ current: page, size: pager.size, keyword: appliedKeyword.value || undefined }))
    if (!requestGate.isCurrent(version)) return
    pager.current = Number(data.current) || page; pager.size = Number(data.size) || pager.size; pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records) ? data.records : []; loaded.value = true
  } catch (cause) {
    if (!requestGate.isCurrent(version)) return
    error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '黑名单加载失败'); loaded.value = true
  } finally { if (requestGate.isCurrent(version)) loading.value = false }
}
function search() { appliedKeyword.value = keyword.value.trim(); load(1) }
function reset() { keyword.value = ''; appliedKeyword.value = ''; load(1) }
async function add() {
  const mac = form.mac.trim().toUpperCase()
  if (!macPattern.test(mac)) { error.value = '请输入完整 MAC 地址，例如 AA:BB:CC:DD:EE:FF'; return }
  loading.value = true; error.value = ''; message.value = ''
  try {
    const response = await addBlacklist({ mac, reason: form.reason.trim() || null })
    if (response.data?.code !== 200) throw new Error(response.data?.message || '加入黑名单失败')
    form.mac = ''; form.reason = ''; message.value = 'MAC 已加入黑名单'; await load(1)
  } catch (cause) { error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '加入黑名单失败') }
  finally { loading.value = false }
}
async function remove(row) {
  if (busyMac.value) return
  if (!await confirmAction({
    title: '确认移出黑名单',
    message: `${row.mac} 移出后将不再受到黑名单限制。`,
    confirmLabel: '确认移出'
  })) return
  busyMac.value = row.mac; error.value = ''; message.value = ''
  try {
    const response = await removeBlacklist(row.mac)
    if (response.data?.code !== 200) throw new Error(response.data?.message || '移出黑名单失败')
    message.value = 'MAC 已移出黑名单'; await load(rows.value.length === 1 && pager.current > 1 ? pager.current - 1 : pager.current)
  }
  catch (cause) { error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, '移出黑名单失败') }
  finally { busyMac.value = '' }
}
onMounted(() => load(1))
</script>

<template>
  <section class="workspace-view security-page">
    <header class="dashboard-header"><div><p class="page-kicker">安全工作区</p><h2>黑名单</h2></div><button class="secondary-button" type="button" :disabled="loading" @click="load()"><RefreshCw :size="16" />刷新</button></header>
    <p v-if="error" class="alert error security-inline-message">{{ error }}</p><p v-if="message" class="alert success security-inline-message">{{ message }}</p>
    <form class="glass-toolbar security-toolbar security-toolbar--compact" @submit.prevent="search"><label><span>关键字</span><input v-model="keyword" placeholder="MAC 或原因" /></label><div class="security-actions"><button type="submit" :disabled="loading"><Search :size="16" />查询</button><button class="secondary-button" type="button" :disabled="loading" @click="reset">重置</button></div></form>
    <form class="glass-toolbar security-toolbar" @submit.prevent="add"><label><span>新增 MAC</span><input v-model="form.mac" maxlength="17" placeholder="AA:BB:CC:DD:EE:FF" /></label><label><span>原因</span><input v-model="form.reason" maxlength="255" placeholder="可选" /></label><button type="submit" :disabled="loading"><Plus :size="16" />加入黑名单</button></form>
    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载黑名单" /><StateBlock v-else-if="loaded && !error && !rows.length" title="暂无黑名单记录" />
    <section v-if="loaded && rows.length" class="glass-panel security-table-wrap"><table class="security-table"><thead><tr><th>MAC</th><th>原因</th><th>创建时间</th><th>操作</th></tr></thead><tbody><tr v-for="row in rows" :key="row.mac"><td>{{ row.mac }}</td><td class="wrap-cell">{{ row.reason || '-' }}</td><td>{{ row.createTime ? String(row.createTime).replace('T', ' ') : '-' }}</td><td><button class="icon-button" type="button" :disabled="!!busyMac" title="移出黑名单" @click="remove(row)"><Trash2 :size="16" /></button></td></tr></tbody></table></section>
    <AppPagination v-if="loaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="loading" @change="load" />
  </section>
</template>
