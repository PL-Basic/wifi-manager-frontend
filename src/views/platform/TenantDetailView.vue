<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { ArrowLeft, Pencil, RefreshCw, ShieldAlert } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import AppPagination from '@/components/app/AppPagination.vue'
import StateBlock from '@/components/StateBlock.vue'
import TenantFormModal from '@/components/platform/TenantFormModal.vue'
import { getPlatformTenant, getPlatformTenantMembers, updatePlatformTenant, updatePlatformTenantStatus } from '@/api/tenants'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import './platform.css'

const route = useRoute()
const router = useRouter()
const tenant = ref(null)
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const message = ref('')
const members = ref([])
const membersLoading = ref(false)
const membersLoaded = ref(false)
const membersError = ref('')
const pager = reactive({ current: 1, size: 20, total: 0 })
const editorOpen = ref(false)
const savePending = ref(false)
const saveError = ref('')
const statusPending = ref(false)
let tenantRequestVersion = 0
let memberRequestVersion = 0

function ensureSuccess(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

function globalRoleLabel(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (Number(value) === 0) return '超级管理员'
  if (Number(value) === 1) return '管理员'
  if (Number(value) === 2) return '普通用户'
  return '-'
}

function tenantRoleLabel(value) {
  if (value === 'TENANT_OWNER') return '组织负责人'
  if (value === 'TENANT_ADMIN') return '组织管理员'
  if (value === 'MEMBER') return '成员'
  return value || '-'
}

function subscriptionLabel(value) {
  if (value === 'NO_ACTIVE_SUBSCRIPTION') return '无有效订阅'
  if (value === 'TRIAL') return '试用中'
  if (value === 'ACTIVE') return '订阅有效'
  return value || '-'
}

async function loadTenant() {
  const version = ++tenantRequestVersion
  loading.value = true
  error.value = ''
  try {
    const response = await getPlatformTenant(route.params.tenantId)
    if (version !== tenantRequestVersion) return
    ensureSuccess(response, '组织详情加载失败')
    tenant.value = response.data.data
    loaded.value = true
  } catch (cause) {
    if (version === tenantRequestVersion) {
      error.value = getApiErrorMessage(cause, '组织详情加载失败')
      loaded.value = true
    }
  } finally {
    if (version === tenantRequestVersion) loading.value = false
  }
}

async function loadMembers(page = pager.current) {
  const version = ++memberRequestVersion
  membersLoading.value = true
  membersError.value = ''
  try {
    const response = await getPlatformTenantMembers(route.params.tenantId, { current: page, size: pager.size })
    if (version !== memberRequestVersion) return
    ensureSuccess(response, '组织成员加载失败')
    const data = response.data.data || {}
    pager.current = Number(data.current) || page
    pager.size = Number(data.size) || pager.size
    pager.total = Number(data.total) || 0
    members.value = Array.isArray(data.records) ? data.records : []
    membersLoaded.value = true
  } catch (cause) {
    if (version === memberRequestVersion) {
      membersError.value = getApiErrorMessage(cause, '组织成员加载失败')
      membersLoaded.value = true
    }
  } finally {
    if (version === memberRequestVersion) membersLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadTenant(), loadMembers()])
}

async function saveTenant(payload) {
  if (savePending.value) return
  savePending.value = true
  saveError.value = ''
  error.value = ''
  message.value = ''
  try {
    const response = await updatePlatformTenant(route.params.tenantId, payload)
    ensureSuccess(response, '组织信息保存失败')
    tenant.value = response.data.data
    editorOpen.value = false
    message.value = '组织信息已保存'
  } catch (cause) {
    saveError.value = getApiErrorMessage(cause, '组织信息保存失败')
  } finally {
    savePending.value = false
  }
}

async function changeStatus() {
  if (!tenant.value || statusPending.value || tenant.value.tenantCode === 'default-tenant') return
  const targetStatus = tenant.value.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  const action = targetStatus === 'ACTIVE' ? '恢复' : '停用'
  if (!await confirmAction({ title: `${action}组织`, message: `确定要${action}组织“${tenant.value.name}”吗？`, confirmLabel: action, tone: targetStatus === 'ACTIVE' ? 'default' : 'danger' })) return

  statusPending.value = true
  error.value = ''
  message.value = ''
  try {
    const response = await updatePlatformTenantStatus(tenant.value.tenantId, { status: targetStatus })
    ensureSuccess(response, `组织${action}失败`)
    tenant.value = response.data.data
    message.value = `组织已${action}`
  } catch (cause) {
    error.value = getApiErrorMessage(cause, `组织${action}失败`)
  } finally {
    statusPending.value = false
  }
}

watch(() => route.params.tenantId, () => {
  loaded.value = false
  membersLoaded.value = false
  pager.current = 1
  refreshAll()
})

onMounted(refreshAll)
</script>

<template>
  <section class="workspace-view platform-page">
    <header class="dashboard-header">
      <div><p class="page-kicker">系统管理</p><h2>{{ tenant?.name || '组织详情' }}</h2></div>
      <div class="platform-actions">
        <button class="secondary-button" type="button" @click="router.push('/app/platform/tenants')"><ArrowLeft :size="16" />返回列表</button>
        <button class="secondary-button" type="button" :disabled="loading || membersLoading" @click="refreshAll"><RefreshCw :size="16" />刷新</button>
      </div>
    </header>

    <div class="platform-context-notice" role="status"><ShieldAlert :size="19" aria-hidden="true" /><p><strong>设备和业务数据暂未按组织分别展示。</strong> 当前统计仍显示默认组织的数据。</p></div>
    <p v-if="error" class="alert error" role="alert">{{ error }}</p>
    <p v-if="message" class="alert success" role="status">{{ message }}</p>
    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载组织详情" />

    <div v-if="loaded && tenant" class="platform-detail-grid">
      <section class="glass-panel platform-panel">
        <header><h3>基本信息</h3><button class="icon-button" type="button" title="编辑组织" @click="saveError = ''; editorOpen = true"><Pencil :size="16" /></button></header>
        <dl class="platform-detail-list">
          <dt>系统编号</dt><dd>{{ tenant.tenantId }}</dd><dt>组织标识</dt><dd>{{ tenant.tenantCode }}</dd><dt>组织名称</dt><dd>{{ tenant.name }}</dd><dt>所在时区</dt><dd>{{ tenant.timezone }}</dd><dt>负责人用户编号</dt><dd>{{ tenant.ownerUserId }}</dd><dt>信息版本</dt><dd>{{ tenant.contextVersion }}</dd><dt>创建时间</dt><dd>{{ formatTime(tenant.createTime) }}</dd><dt>更新时间</dt><dd>{{ formatTime(tenant.updateTime) }}</dd>
        </dl>
      </section>
      <section class="glass-panel platform-panel">
        <header><h3>运行状态</h3></header>
        <dl class="platform-detail-list">
          <dt>组织状态</dt><dd><span :class="['status-pill', tenant.status === 'ACTIVE' ? 'status-pill--success' : 'status-pill--neutral']">{{ tenant.status === 'ACTIVE' ? '启用' : '停用' }}</span></dd><dt>有效成员</dt><dd>{{ tenant.memberCount ?? 0 }}</dd><dt>套餐状态</dt><dd>{{ subscriptionLabel(tenant.subscriptionStatus) }}</dd>
        </dl>
        <button class="secondary-button" type="button" :disabled="statusPending || tenant.tenantCode === 'default-tenant'" :title="tenant.tenantCode === 'default-tenant' ? '默认组织不能停用' : ''" @click="changeStatus">{{ tenant.status === 'ACTIVE' ? '停用组织' : '恢复组织' }}</button>
      </section>
    </div>

    <section class="platform-page">
      <header class="dashboard-header"><div><p class="page-kicker">成员管理</p><h2>组织成员</h2></div></header>
      <p v-if="membersError" class="alert error" role="alert">{{ membersError }}</p>
      <StateBlock v-if="membersLoading && !membersLoaded" type="loading" title="正在加载组织成员" />
      <StateBlock v-else-if="membersLoaded && !membersError && !members.length" title="暂无组织成员" />
      <section v-if="membersLoaded && members.length" class="glass-panel platform-table-wrap">
        <table class="platform-table">
          <thead><tr><th>记录编号</th><th>用户</th><th>系统角色</th><th>组织角色</th><th>状态</th><th>默认组织</th><th>加入时间</th></tr></thead>
          <tbody><tr v-for="member in members" :key="member.memberId"><td>{{ member.memberId }}</td><td><strong>{{ member.nickname || member.username || '-' }}</strong><br /><small>{{ member.username ? `@${member.username}` : `用户 ${member.userId}` }}</small></td><td>{{ globalRoleLabel(member.globalRole) }}</td><td>{{ tenantRoleLabel(member.tenantRole) }}</td><td><span :class="['status-pill', member.status === 'ACTIVE' ? 'status-pill--success' : 'status-pill--neutral']">{{ member.status === 'ACTIVE' ? '启用' : member.status }}</span></td><td>{{ member.defaultTenant ? '是' : '否' }}</td><td>{{ formatTime(member.joinTime) }}</td></tr></tbody>
        </table>
      </section>
      <AppPagination v-if="membersLoaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="membersLoading" @change="loadMembers" />
    </section>

    <TenantFormModal :open="editorOpen" :tenant="tenant" :submitting="savePending" :submit-error="saveError" @close="editorOpen = false" @submit="saveTenant" />
  </section>
</template>
