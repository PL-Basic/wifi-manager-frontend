<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowRight, Pencil, RefreshCw, Search, Trash2 } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import UserFormModal from '@/components/operations/UserFormModal.vue'
import {
  deleteUser,
  getUsers,
  purgeUser,
  requestPurgeUser,
  updateUserStatus
} from '@/api/operations'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction, requestActionDialog } from '@/composables/useActionDialog'
import { useRequestGate } from '@/composables/useRequestGate'
import {
  ROLE_SUPER_ADMIN,
  canChangeManagedUserRole,
  canManageUserTarget,
  canOpenUserEditor,
  isSameUser
} from '@/utils/access'
import { getStoredRole, parseTokenPayload } from '@/utils/session'
import './operations.css'

const router = useRouter()
const role = getStoredRole()
const currentUserId = String(parseTokenPayload()?.sub || '')
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const message = ref('')
const rows = ref([])
const editorOpen = ref(false)
const selected = ref(null)
const keyword = ref('')
const appliedKeyword = ref('')
const busyUserId = ref('')
const pager = reactive({ current: 1, size: 10, total: 0 })
const requestGate = useRequestGate()

const isSuper = computed(() => role === ROLE_SUPER_ADMIN)

function roleLabel(value) {
  if (Number(value) === 0) return '超级管理员'
  if (Number(value) === 1) return '管理员'
  return '普通用户'
}

function isSelf(row) {
  return isSameUser(currentUserId, row)
}

function canEdit(row) {
  return canOpenUserEditor(role, currentUserId, row)
}

function canEditRole(row) {
  return canChangeManagedUserRole(role, currentUserId, row)
}

function ensureSuccess(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
}

async function load(page = pager.current) {
  const version = requestGate.begin()
  loading.value = true
  error.value = ''
  try {
    const response = await getUsers({
      current: page,
      size: pager.size,
      keyword: appliedKeyword.value || undefined
    })
    if (!requestGate.isCurrent(version)) return
    ensureSuccess(response, '用户加载失败')

    const data = response.data.data || {}
    pager.current = Number(data.current) || page
    pager.size = Number(data.size) || pager.size
    pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records) ? data.records : []
    loaded.value = true
  } catch (cause) {
    if (requestGate.isCurrent(version)) {
      error.value = cause instanceof Error && !cause.response
        ? cause.message
        : getApiErrorMessage(cause, '用户加载失败')
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

function edit(row) {
  // 本人资料走个人中心接口，避免把管理员管理接口当作个人资料入口。
  if (isSelf(row)) {
    router.push('/app/account/profile')
    return
  }
  selected.value = row
  editorOpen.value = true
}

function saved(user) {
  editorOpen.value = false
  rows.value = rows.value.map((row) => String(row.userId) === String(user.userId) ? { ...row, ...user } : row)
  message.value = '用户已保存'
}

async function toggle(row) {
  if (!canManageUserTarget(role, currentUserId, row) || busyUserId.value) return
  busyUserId.value = String(row.userId)
  error.value = ''
  message.value = ''
  try {
    const response = await updateUserStatus(row.userId, { status: Number(row.status) === 1 ? 0 : 1 })
    ensureSuccess(response, '用户状态修改失败')
    message.value = '用户状态已更新'
    await load()
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '用户状态修改失败')
  } finally {
    busyUserId.value = ''
  }
}

async function remove(row) {
  if (!canManageUserTarget(role, currentUserId, row) || busyUserId.value) return
  if (!await confirmAction({
    title: '确认逻辑删除用户',
    message: `用户 ${row.username} 将被标记删除，不能继续正常使用系统。`,
    confirmLabel: '逻辑删除',
    tone: 'danger'
  })) return

  busyUserId.value = String(row.userId)
  error.value = ''
  message.value = ''
  try {
    const response = await deleteUser(row.userId)
    ensureSuccess(response, '用户删除失败')
    message.value = '用户已逻辑删除'
    await load()
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '用户删除失败')
  } finally {
    busyUserId.value = ''
  }
}

async function purge(row) {
  if (!canManageUserTarget(role, currentUserId, row) || busyUserId.value) return

  let reason = ''
  if (isSuper.value) {
    if (!await confirmAction({
      title: '确认物理删除用户',
      message: `用户 ${row.username} 将被永久删除，此操作不可恢复。`,
      confirmLabel: '永久删除',
      tone: 'danger'
    })) return
  } else {
    const result = await requestActionDialog({
      title: '申请物理删除用户',
      message: `该申请将交由超级管理员审核，目标用户为 ${row.username}。`,
      confirmLabel: '提交申请',
      inputLabel: '申请原因',
      inputPlaceholder: '说明必须物理删除的原因',
      inputRequired: true,
      tone: 'danger'
    })
    if (!result.confirmed) return
    reason = result.value
  }

  busyUserId.value = String(row.userId)
  error.value = ''
  message.value = ''
  try {
    const response = isSuper.value
      ? await purgeUser(row.userId)
      : await requestPurgeUser(row.userId, { reason })
    ensureSuccess(response, '敏感操作失败')
    message.value = isSuper.value ? '用户已物理删除' : '物理删除申请已提交'
    await load()
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '敏感操作失败')
  } finally {
    busyUserId.value = ''
  }
}

onMounted(() => load(1))
</script>

<template>
  <section class="workspace-view operations-page">
    <header class="dashboard-header">
      <div><p class="page-kicker">业务管理</p><h2>用户管理</h2></div>
      <button class="secondary-button" type="button" :disabled="loading" @click="load()"><RefreshCw :size="16" />刷新</button>
    </header>
    <p v-if="error" class="alert error">{{ error }}</p>
    <p v-if="message" class="alert success">{{ message }}</p>

    <form class="glass-toolbar operations-toolbar" @submit.prevent="search">
      <label><span>关键字</span><input v-model="keyword" placeholder="用户名、昵称、邮箱或手机号" /></label>
      <div class="operations-actions">
        <button type="submit" :disabled="loading"><Search :size="16" />查询</button>
        <button class="secondary-button" type="button" :disabled="loading" @click="reset">重置</button>
      </div>
    </form>

    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载用户" />
    <StateBlock v-else-if="loaded && !error && !rows.length" title="暂无用户" />
    <section v-if="loaded && rows.length" class="glass-panel operations-table-wrap">
      <table class="operations-table">
        <thead><tr><th>ID</th><th>用户名</th><th>昵称</th><th>联系方式</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.userId">
            <td>{{ row.userId }}</td><td>{{ row.username }}</td><td>{{ row.nickname || '-' }}</td><td>{{ row.email || row.phone || '-' }}</td>
            <td>{{ roleLabel(row.role) }}</td>
            <td><span :class="['status-pill', Number(row.status) === 1 ? 'status-pill--success' : 'status-pill--neutral']">{{ Number(row.status) === 1 ? '启用' : '禁用' }}</span></td>
            <td>{{ row.createTime ? String(row.createTime).replace('T', ' ') : '-' }}</td>
            <td class="operations-actions">
              <button class="icon-button" type="button" title="查看详情" @click="router.push(`/app/operations/users/${row.userId}`)"><ArrowRight :size="16" /></button>
              <button class="icon-button" type="button" :disabled="!canEdit(row) || !!busyUserId" title="编辑用户" @click="edit(row)"><Pencil :size="16" /></button>
              <button class="secondary-button compact-button" type="button" :disabled="!canManageUserTarget(role, currentUserId, row) || !!busyUserId" @click="toggle(row)">{{ Number(row.status) === 1 ? '禁用' : '启用' }}</button>
              <button class="icon-button" type="button" :disabled="!canManageUserTarget(role, currentUserId, row) || !!busyUserId" title="逻辑删除" @click="remove(row)"><Trash2 :size="16" /></button>
              <button v-if="Number(row.role) !== 0" class="danger-button compact-button" type="button" :disabled="!canManageUserTarget(role, currentUserId, row) || !!busyUserId" @click="purge(row)">{{ isSuper ? '物理删除' : '申请物理删除' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <AppPagination v-if="loaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="loading" @change="load" />

    <UserFormModal
      :open="editorOpen"
      :user="selected"
      :allow-role="canEditRole(selected || {})"
      @close="editorOpen = false"
      @saved="saved"
    />
  </section>
</template>
