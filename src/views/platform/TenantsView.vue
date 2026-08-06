<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ArrowRight, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import AppPagination from '@/components/app/AppPagination.vue'
import StateBlock from '@/components/StateBlock.vue'
import TenantFormModal from '@/components/platform/TenantFormModal.vue'
import { createPlatformTenant, getPlatformTenants, updatePlatformTenantStatus } from '@/api/tenants'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import { useRequestGate } from '@/composables/useRequestGate'
import './platform.css'

const router = useRouter()
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const message = ref('')
const rows = ref([])
const keyword = ref('')
const appliedKeyword = ref('')
const createOpen = ref(false)
const createPending = ref(false)
const createError = ref('')
const busyTenantId = ref('')
const pager = reactive({ current: 1, size: 20, total: 0 })
const requestGate = useRequestGate()

function ensureSuccess(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
}

function statusLabel(status) {
  return status === 'ACTIVE' ? '启用' : status === 'DISABLED' ? '停用' : status || '-'
}

function subscriptionLabel(status) {
  if (status === 'NO_ACTIVE_SUBSCRIPTION') return '无有效订阅'
  if (status === 'TRIAL') return '试用中'
  if (status === 'ACTIVE') return '订阅有效'
  return status || '-'
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

async function load(page = pager.current) {
  const version = requestGate.begin()
  loading.value = true
  error.value = ''
  try {
    const response = await getPlatformTenants({
      current: page,
      size: pager.size,
      keyword: appliedKeyword.value || undefined
    })
    if (!requestGate.isCurrent(version)) return
    ensureSuccess(response, '组织列表加载失败')
    const data = response.data.data || {}
    pager.current = Number(data.current) || page
    pager.size = Number(data.size) || pager.size
    pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records) ? data.records : []
    loaded.value = true
  } catch (cause) {
    if (requestGate.isCurrent(version)) {
      error.value = getApiErrorMessage(cause, '组织列表加载失败')
      loaded.value = true
    }
  } finally {
    if (requestGate.isCurrent(version)) loading.value = false
  }
}

function search() {
  appliedKeyword.value = keyword.value.trim()
  load(1)
}

function reset() {
  keyword.value = ''
  appliedKeyword.value = ''
  load(1)
}

async function createTenant(payload) {
  if (createPending.value) return
  createPending.value = true
  createError.value = ''
  error.value = ''
  message.value = ''
  try {
    const response = await createPlatformTenant(payload)
    ensureSuccess(response, '组织创建失败')
    createOpen.value = false
    message.value = `组织“${response.data.data?.name || payload.name}”已创建`
    await load(1)
  } catch (cause) {
    createError.value = getApiErrorMessage(cause, '组织创建失败')
  } finally {
    createPending.value = false
  }
}

async function changeStatus(row) {
  if (busyTenantId.value) return
  const targetStatus = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  const action = targetStatus === 'ACTIVE' ? '恢复' : '停用'
  if (!await confirmAction({
    title: `${action}组织`,
    message: `确定要${action}组织“${row.name}”吗？`,
    confirmLabel: action,
    tone: targetStatus === 'ACTIVE' ? 'default' : 'danger'
  })) return

  busyTenantId.value = String(row.tenantId)
  error.value = ''
  message.value = ''
  try {
    const response = await updatePlatformTenantStatus(row.tenantId, { status: targetStatus })
    ensureSuccess(response, `组织${action}失败`)
    message.value = `组织已${action}`
    await load()
  } catch (cause) {
    error.value = getApiErrorMessage(cause, `组织${action}失败`)
  } finally {
    busyTenantId.value = ''
  }
}

onMounted(() => load(1))
</script>

<template>
  <section class="workspace-view platform-page">
    <header class="dashboard-header">
      <div><p class="page-kicker">系统管理</p><h2>组织管理</h2></div>
      <div class="platform-actions">
        <button class="secondary-button" type="button" :disabled="loading" @click="load()"><RefreshCw :size="16" />刷新</button>
        <button type="button" :disabled="loading" @click="createError = ''; createOpen = true"><Plus :size="16" />创建组织</button>
      </div>
    </header>

    <div class="platform-context-notice" role="status">
      <ShieldAlert :size="19" aria-hidden="true" />
      <p><strong>当前仅开放组织和成员管理。</strong> 设备与业务数据暂时统一显示在默认组织中。</p>
    </div>
    <p v-if="error" class="alert error" role="alert">{{ error }}</p>
    <p v-if="message" class="alert success" role="status">{{ message }}</p>

    <form class="glass-toolbar platform-toolbar" @submit.prevent="search">
      <label><span>关键字</span><input v-model="keyword" placeholder="组织标识或组织名称" /></label>
      <div class="platform-actions">
        <button type="submit" :disabled="loading"><Search :size="16" />查询</button>
        <button class="secondary-button" type="button" :disabled="loading" @click="reset">重置</button>
      </div>
    </form>

    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载组织" />
    <StateBlock v-else-if="loaded && !error && !rows.length" title="暂无组织" text="当前查询条件下没有组织记录。" />
    <section v-if="loaded && rows.length" class="glass-panel platform-table-wrap">
      <table class="platform-table">
        <thead><tr><th>系统编号</th><th>组织</th><th>状态</th><th>时区</th><th>成员</th><th>套餐状态</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.tenantId">
            <td>{{ row.tenantId }}</td>
            <td class="platform-name-cell"><strong>{{ row.name }}</strong><br /><small>{{ row.tenantCode }}</small></td>
            <td><span :class="['status-pill', row.status === 'ACTIVE' ? 'status-pill--success' : 'status-pill--neutral']">{{ statusLabel(row.status) }}</span></td>
            <td>{{ row.timezone }}</td><td>{{ row.memberCount ?? 0 }}</td><td>{{ subscriptionLabel(row.subscriptionStatus) }}</td><td>{{ formatTime(row.createTime) }}</td>
            <td class="platform-actions">
              <button class="icon-button" type="button" title="查看组织详情" @click="router.push(`/app/platform/tenants/${row.tenantId}`)"><ArrowRight :size="16" /></button>
              <button class="secondary-button compact-button" type="button" :disabled="Boolean(busyTenantId) || row.tenantCode === 'default-tenant'" :title="row.tenantCode === 'default-tenant' ? '默认组织不能停用' : ''" @click="changeStatus(row)">{{ row.status === 'ACTIVE' ? '停用' : '恢复' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <AppPagination v-if="loaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="loading" @change="load" />

    <TenantFormModal :open="createOpen" :submitting="createPending" :submit-error="createError" @close="createOpen = false" @submit="createTenant" />
  </section>
</template>
