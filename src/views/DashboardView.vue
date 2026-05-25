<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import LocationMap from '@/components/LocationMap.vue'
import StateBlock from '@/components/StateBlock.vue'
import { clearSession, parseTokenPayload, syncSessionUser } from '@/utils/session'
import { readAvatarFile } from '@/utils/avatar'
import {
  addBlacklist,
  allowDevice,
  createRule,
  deleteRule,
  deleteUser,
  getMyProfile,
  getAlerts,
  getAudits,
  getBlacklist,
  getDashboard,
  getDevices,
  getLocations,
  getRules,
  getSessions,
  getTraffic,
  getUsers,
  handleAlert,
  getOperationRequests,
  kickDevice,
  purgeUser,
  requestPurgeUser,
  removeBlacklist,
  reviewOperationRequest,
  toggleRule,
  updateMyProfile,
  updateRule,
  updateUser,
  updateUserStatus
} from '@/api/admin'

const router = useRouter()
const username = localStorage.getItem('nickname') || localStorage.getItem('username') || 'Admin'
const role = Number(localStorage.getItem('role') || 2)
const isSuperAdmin = computed(() => role === 0)
const activeTab = ref('overview')
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const dashboard = ref(null)
const rows = ref([])
const alertToasts = ref([])
let alertSocket = null
let toastSeed = 0
const pager = reactive({ current: 1, size: 10, total: 0 })
const filters = reactive({ keyword: '', mac: '' })
const blacklistForm = reactive({ mac: '', reason: '' })
const profile = reactive({ userId: '', username: '', nickname: '', email: '', phone: '', avatar: '' })
const editingUser = ref(false)
const userForm = reactive({
  userId: '',
  username: '',
  nickname: '',
  email: '',
  phone: '',
  avatar: '',
  role: 2,
  maxConnections: '',
  dailyQuotaMinutes: '',
  expireTime: ''
})
const editingRule = ref(false)
const detailDrawer = reactive({ open: false, title: '', row: null, fields: [] })
const ruleForm = reactive({
  id: '',
  ruleCode: '',
  ruleType: 1,
  pattern: '',
  actionType: 1,
  level: 1,
  enabled: 1,
  description: ''
})

const allTabs = [
  { key: 'overview', label: '总览' },
  { key: 'profile', label: '我的资料' },
  { key: 'locations', label: 'GPS 定位' },
  { key: 'users', label: '用户管理' },
  { key: 'approvals', label: '审批', superOnly: true },
  { key: 'devices', label: '设备节点' },
  { key: 'blacklist', label: '黑名单' },
  { key: 'sessions', label: '会话' },
  { key: 'traffic', label: '流量' },
  { key: 'rules', label: '规则' },
  { key: 'alerts', label: '告警' },
  { key: 'audits', label: '审计' }
]

const columns = {
  locations: [
    ['mac', 'MAC'], ['userId', '用户'], ['latitude', '纬度'], ['longitude', '经度'],
    ['accuracy', '精度'], ['source', '来源'], ['reportTime', '上报时间'], ['remark', '备注']
  ],
  users: [
    ['userId', 'ID'], ['username', '用户名'], ['nickname', '昵称'], ['email', '邮箱'],
    ['phone', '手机号'], ['role', '角色'], ['status', '状态'], ['createTime', '创建时间']
  ],
  devices: [
    ['nodeId', 'ID'], ['deviceCode', '设备编码'], ['name', '名称'], ['location', '位置'], ['ip', 'IP'],
    ['status', '状态'], ['currentClients', '在线数'], ['maxClients', '容量'], ['lastHeartbeat', '心跳时间']
  ],
  blacklist: [
    ['mac', 'MAC'], ['reason', '原因'], ['createTime', '创建时间']
  ],
  sessions: [
    ['sessionId', '会话'], ['mac', 'MAC'], ['nodeId', '节点'], ['userId', '用户'],
    ['status', '状态'], ['bytesUp', '上行'], ['bytesDown', '下行'], ['startTime', '开始时间']
  ],
  traffic: [
    ['id', 'ID'], ['mac', 'MAC'], ['dstIp', '目标 IP'], ['dstPort', '端口'],
    ['sni', 'SNI'], ['protocol', '协议'], ['bytesUp', '上行'], ['bytesDown', '下行'], ['createTime', '时间']
  ],
  rules: [
    ['id', 'ID'], ['ruleCode', '编码'], ['ruleType', '类型'], ['pattern', '匹配值'],
    ['actionType', '动作'], ['level', '级别'], ['enabled', '启用'], ['description', '描述']
  ],
  alerts: [
    ['id', 'ID'], ['level', '级别'], ['status', '状态'], ['ruleCode', '规则'],
    ['title', '标题'], ['mac', 'MAC'], ['createTime', '时间'], ['handleTime', '处理时间']
  ],
  audits: [
    ['id', 'ID'], ['action', '动作'], ['operatorName', '操作人'], ['target', '目标'],
    ['success', '结果'], ['createTime', '时间']
  ],
  approvals: [
    ['id', 'ID'], ['requestType', '类型'], ['targetUsername', '目标用户'], ['requesterName', '申请人'],
    ['status', '状态'], ['reason', '原因'], ['rejectReason', '驳回原因'], ['createTime', '申请时间']
  ]
}

const detailFields = {
  alerts: [
    ['id', 'ID'], ['level', '级别'], ['status', '状态'], ['ruleCode', '规则编码'], ['title', '标题'],
    ['mac', 'MAC'], ['deviceCode', '设备编码'], ['dstIp', '目标 IP'], ['sni', 'SNI'], ['createTime', '创建时间'], ['handleTime', '处理时间']
  ],
  audits: [
    ['id', 'ID'], ['action', '动作'], ['operatorName', '操作人'], ['target', '目标'], ['success', '结果'],
    ['message', '消息'], ['createTime', '创建时间']
  ],
  devices: [
    ['nodeId', '节点 ID'], ['deviceCode', '设备编码'], ['name', '设备名称'], ['location', '位置'], ['ip', 'IP'],
    ['status', '状态'], ['currentClients', '在线数'], ['maxClients', '最大容量'], ['firmwareVersion', '固件版本'], ['lastHeartbeat', '最近心跳']
  ]
}

const totalPages = computed(() => Math.max(1, Math.ceil(pager.total / pager.size)))
const tabs = computed(() => allTabs.filter((item) => !item.superOnly || isSuperAdmin.value))
const currentColumns = computed(() => columns[activeTab.value] || [])
const tableTitle = computed(() => tabs.value.find((item) => item.key === activeTab.value)?.label || '')
const roleName = computed(() => (isSuperAdmin.value ? '超级管理员控制台' : '管理员控制台'))

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return '-'
  if (key === 'role') {
    if (Number(value) === 0) return '超级管理员'
    if (Number(value) === 1) return '管理员'
    return '普通用户'
  }
  if (key === 'ruleType') return Number(value) === 1 ? '域名' : Number(value) === 2 ? 'IP' : Number(value) === 3 ? '端口' : value
  if (key === 'actionType') return Number(value) === 1 ? '告警' : Number(value) === 2 ? '阻断' : Number(value) === 3 ? '限速' : value
  if (key === 'requestType' && value === 'user.purge') return '物理删除用户'
  if (activeTab.value === 'approvals' && key === 'status') {
    if (value === 0 || value === '0') return '待审批'
    if (value === 1 || value === '1') return '已通过'
    if (value === 2 || value === '2') return '已驳回'
  }
  if (key === 'status') {
    if (value === 1 || value === '1') return '启用'
    if (value === 0 || value === '0') return '禁用'
    if (value === 2 || value === '2') return '已处理'
  }
  if (key === 'enabled') return value ? '启用' : '停用'
  if (String(key).toLowerCase().includes('time')) return String(value).replace('T', ' ')
  return value
}

function canOperateUser(row) {
  if (!row) return false
  if (isSuperAdmin.value) return Number(row.role) !== 0 || String(row.userId) === String(getCurrentUserId())
  return Number(row.role) === 2
}

function canEditRole(row) {
  return isSuperAdmin.value && Number(row?.role) !== 0
}

function getCurrentUserId() {
  return parseTokenPayload()?.sub || ''
}

function initials() {
  return (profile.nickname || profile.username || username || 'A').slice(0, 1).toUpperCase()
}

function normalizePage(data) {
  const page = data?.data || data || {}
  pager.current = page.current || 1
  pager.size = page.size || 10
  pager.total = page.total || 0
  rows.value = page.records || []
}

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  localStorage.removeItem('nickname')
  localStorage.removeItem('role')
  router.push('/login')
}

function pushAlertToast(payload) {
  const toast = {
    id: ++toastSeed,
    title: payload?.title || payload?.ruleCode || '新告警',
    text: payload?.mac ? `${payload.mac} 触发访问规则` : '检测到新的告警事件'
  }
  alertToasts.value.unshift(toast)
  alertToasts.value = alertToasts.value.slice(0, 4)
  window.setTimeout(() => {
    alertToasts.value = alertToasts.value.filter((item) => item.id !== toast.id)
  }, 5000)
}

function connectAlertSocket() {
  if (alertSocket || typeof WebSocket === 'undefined') return
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  alertSocket = new WebSocket(`${protocol}//${window.location.host}/ws/alerts`)
  alertSocket.onmessage = (event) => {
    let payload = null
    try {
      payload = JSON.parse(event.data)
    } catch {
      payload = { title: event.data }
    }
    pushAlertToast(payload)
    if (activeTab.value === 'alerts') loadTable(pager.current)
  }
  alertSocket.onclose = () => {
    alertSocket = null
  }
}

function disconnectAlertSocket() {
  if (!alertSocket) return
  alertSocket.close()
  alertSocket = null
}

async function requestFor(tab, page = pager.current) {
  const common = { current: page, size: pager.size }
  if (tab === 'locations') return getLocations({ ...common, mac: filters.mac || undefined })
  if (tab === 'users') return getUsers({ ...common, keyword: filters.keyword || undefined })
  if (tab === 'devices') return getDevices({ ...common, keyword: filters.keyword || undefined })
  if (tab === 'blacklist') return getBlacklist({ ...common, keyword: filters.keyword || undefined })
  if (tab === 'sessions') return getSessions({ ...common, mac: filters.mac || undefined })
  if (tab === 'traffic') return getTraffic({ ...common, mac: filters.mac || undefined })
  if (tab === 'rules') return getRules({ ...common, keyword: filters.keyword || undefined })
  if (tab === 'alerts') return getAlerts(common)
  if (tab === 'audits') return getAudits(common)
  if (tab === 'approvals') return getOperationRequests(common)
  return getDashboard()
}

async function loadProfile() {
  loading.value = true
  message.value = ''
  try {
    const { data } = await getMyProfile(getCurrentUserId())
    if (data.code === 200) {
      Object.assign(profile, data.data)
      syncSessionUser(profile)
      if (Number(profile.role ?? role) > 1) {
        clearSession('当前账号不再具备后台权限，请重新登录')
        router.push('/login')
      }
    } else {
      message.value = data.message || '加载失败'
    }
  } catch (error) {
    message.value = error.response?.data?.message || '网络请求失败'
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  saving.value = true
  message.value = ''
  try {
    const { data } = await updateMyProfile(profile.userId, {
      nickname: profile.nickname,
      email: profile.email,
      phone: profile.phone,
      avatar: profile.avatar
    })
    if (data.code === 200) {
      Object.assign(profile, data.data)
      syncSessionUser(profile)
      message.value = '保存成功'
    } else {
      message.value = data.message || '保存失败'
    }
  } catch (error) {
    message.value = error.response?.data?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function chooseProfileAvatar(event) {
  message.value = ''
  try {
    profile.avatar = await readAvatarFile(event.target.files?.[0])
  } catch (error) {
    message.value = error.message
  } finally {
    event.target.value = ''
  }
}

async function loadOverview() {
  loading.value = true
  message.value = ''
  try {
    const { data } = await getDashboard()
    if (data.code === 200) {
      dashboard.value = data.data
    } else {
      message.value = data.message || '加载失败'
    }
  } catch (error) {
    message.value = error.response?.data?.message || '网络请求失败'
  } finally {
    loading.value = false
  }
}

async function loadTable(page = pager.current) {
  loading.value = true
  message.value = ''
  try {
    const { data } = await requestFor(activeTab.value, page)
    if (data.code !== 200) {
      message.value = data.message || '加载失败'
      return
    }
    normalizePage(data)
  } catch (error) {
    message.value = error.response?.data?.message || '网络请求失败'
  } finally {
    loading.value = false
  }
}

function switchTab(tab) {
  if (!tabs.value.some((item) => item.key === tab)) return
  activeTab.value = tab
  rows.value = []
  pager.current = 1
  pager.total = 0
  message.value = ''
  if (tab === 'overview') {
    loadOverview()
  } else if (tab === 'profile') {
    loadProfile()
  } else {
    loadTable(1)
  }
}

function search() {
  loadTable(1)
}

function reset() {
  filters.keyword = ''
  filters.mac = ''
  loadTable(1)
}

function openUserEditor(row) {
  Object.assign(userForm, {
    userId: row.userId,
    username: row.username || '',
    nickname: row.nickname || '',
    email: row.email || '',
    phone: row.phone || '',
    avatar: row.avatar || '',
    role: row.role ?? 2,
    maxConnections: row.maxConnections ?? '',
    dailyQuotaMinutes: row.dailyQuotaMinutes ?? '',
    expireTime: row.expireTime ? String(row.expireTime).slice(0, 16) : ''
  })
  editingUser.value = true
}

function closeUserEditor() {
  editingUser.value = false
}

async function chooseUserAvatar(event) {
  message.value = ''
  try {
    userForm.avatar = await readAvatarFile(event.target.files?.[0])
  } catch (error) {
    message.value = error.message
  } finally {
    event.target.value = ''
  }
}

async function submitUserEditor() {
  saving.value = true
  message.value = ''
  try {
    const payload = {
      nickname: userForm.nickname,
      email: userForm.email,
      phone: userForm.phone,
      avatar: userForm.avatar,
      maxConnections: userForm.maxConnections === '' ? null : Number(userForm.maxConnections),
      dailyQuotaMinutes: userForm.dailyQuotaMinutes === '' ? null : Number(userForm.dailyQuotaMinutes),
      expireTime: userForm.expireTime ? `${userForm.expireTime}:00` : null
    }
    if (isSuperAdmin.value) payload.role = Number(userForm.role)
    const { data } = await updateUser(userForm.userId, payload)
    if (data.code !== 200) {
      message.value = data.message || '保存失败'
      return
    }
    editingUser.value = false
    message.value = '用户资料已保存'
    await loadTable(pager.current)
  } catch (error) {
    message.value = error.response?.data?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

function openRuleEditor(row = null) {
  Object.assign(ruleForm, {
    id: row?.id || '',
    ruleCode: row?.ruleCode || '',
    ruleType: row?.ruleType ?? 1,
    pattern: row?.pattern || '',
    actionType: row?.actionType ?? 1,
    level: row?.level ?? 1,
    enabled: row?.enabled ?? 1,
    description: row?.description || ''
  })
  editingRule.value = true
}

function closeRuleEditor() {
  editingRule.value = false
}

function openDetail(row, tab = activeTab.value) {
  detailDrawer.open = true
  detailDrawer.title = `${tableTitle.value}详情`
  detailDrawer.row = row
  detailDrawer.fields = detailFields[tab] || currentColumns.value
}

function closeDetail() {
  detailDrawer.open = false
  detailDrawer.row = null
  detailDrawer.fields = []
}

async function submitRuleEditor() {
  if (!ruleForm.ruleCode.trim() || !ruleForm.pattern.trim()) {
    message.value = '请填写规则编码和匹配值'
    return
  }
  saving.value = true
  message.value = ''
  try {
    const payload = {
      ruleType: Number(ruleForm.ruleType),
      pattern: ruleForm.pattern.trim(),
      actionType: Number(ruleForm.actionType),
      level: Number(ruleForm.level),
      enabled: Number(ruleForm.enabled),
      description: ruleForm.description.trim() || null
    }
    const response = ruleForm.id
      ? await updateRule(ruleForm.id, payload)
      : await createRule({ ...payload, ruleCode: ruleForm.ruleCode.trim() })
    if (response.data.code !== 200) {
      message.value = response.data.message || '保存失败'
      return
    }
    editingRule.value = false
    message.value = '规则已保存'
    await loadTable(pager.current)
  } catch (error) {
    message.value = error.response?.data?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

function prevPage() {
  if (pager.current > 1) loadTable(pager.current - 1)
}

function nextPage() {
  if (pager.current < totalPages.value) loadTable(pager.current + 1)
}

async function handleRowAction(action, row) {
  loading.value = true
  message.value = ''
  try {
    if (action === 'deleteUser') {
      if (!window.confirm(`确认逻辑删除用户 ${row.username}？`)) return
      await deleteUser(row.userId)
    }
    if (action === 'promoteAdmin') {
      await updateUser(row.userId, { role: 1 })
    }
    if (action === 'demoteUser') {
      await updateUser(row.userId, { role: 2 })
    }
    if (action === 'requestPurge') {
      const reason = window.prompt(`请输入物理删除用户 ${row.username} 的原因`)
      if (!reason) return
      await requestPurgeUser(row.userId, { reason })
    }
    if (action === 'purgeUser') {
      if (!window.confirm(`超级管理员确认物理删除用户 ${row.username}？此操作不可恢复。`)) return
      await purgeUser(row.userId)
    }
    if (action === 'toggleUser') {
      await updateUserStatus(row.userId, { status: row.status === 1 ? 0 : 1 })
    }
    if (action === 'removeBlacklist') {
      await removeBlacklist(row.mac)
    }
    if (action === 'toggleRule') {
      await toggleRule(row.id, row.enabled ? 0 : 1)
    }
    if (action === 'deleteRule') {
      if (!window.confirm(`确认删除规则 ${row.ruleCode}？`)) return
      await deleteRule(row.id)
    }
    if (action === 'allowDevice') {
      await allowDevice(row.deviceCode)
    }
    if (action === 'kickDevice') {
      const reason = window.prompt(`请输入踢出设备 ${row.deviceCode} 的原因`, '管理员手动踢出')
      if (!reason) return
      await kickDevice(row.deviceCode, { reason })
    }
    if (action === 'handleAlert') {
      await handleAlert(row.id, getCurrentUserId())
    }
    if (action === 'approveRequest') {
      await reviewOperationRequest(row.id, { approved: true })
    }
    if (action === 'rejectRequest') {
      const rejectReason = window.prompt('请输入驳回原因')
      if (!rejectReason) return
      await reviewOperationRequest(row.id, { approved: false, rejectReason })
    }
    await loadTable(pager.current)
  } catch (error) {
    message.value = error.response?.data?.message || '操作失败'
  } finally {
    loading.value = false
  }
}

async function submitBlacklist() {
  if (!blacklistForm.mac.trim()) {
    message.value = '请输入 MAC 地址'
    return
  }
  loading.value = true
  try {
    await addBlacklist({ mac: blacklistForm.mac.trim(), reason: blacklistForm.reason.trim() || null })
    blacklistForm.mac = ''
    blacklistForm.reason = ''
    await loadTable(1)
  } catch (error) {
    message.value = error.response?.data?.message || '添加失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadOverview()
  connectAlertSocket()
})

onBeforeUnmount(disconnectAlertSocket)
</script>

<template>
  <div class="admin-starry">
    <StarrySky />
    <div class="toast-stack" aria-live="polite">
      <article v-for="toast in alertToasts" :key="toast.id" class="alert-toast glass-panel">
        <span>实时告警</span>
        <strong>{{ toast.title }}</strong>
        <p>{{ toast.text }}</p>
      </article>
    </div>
    <main class="dashboard-shell glass-shell">
      <aside class="dashboard-nav glass-nav">
        <div>
          <p class="nav-kicker">Wifi Manager</p>
          <h1>{{ roleName }}</h1>
        </div>
        <nav>
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            :class="{ active: activeTab === tab.key }"
            @click="switchTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </nav>
        <button class="ghost-button" type="button" @click="logout">退出登录</button>
      </aside>

      <section class="dashboard-main glass-main">
        <header class="dashboard-header">
          <div>
            <p class="page-kicker">当前用户：{{ username }}</p>
            <h2>{{ activeTab === 'overview' ? '运行总览' : tableTitle }}</h2>
          </div>
          <button type="button" :disabled="loading" @click="activeTab === 'overview' ? loadOverview() : activeTab === 'profile' ? loadProfile() : loadTable()">刷新</button>
        </header>

        <p v-if="message" class="alert error">{{ message }}</p>

        <section v-if="activeTab === 'overview'" class="metric-grid">
          <article class="metric-card">
            <span>用户总数</span>
            <strong>{{ dashboard?.userStats?.totalUsers ?? '-' }}</strong>
          </article>
          <article class="metric-card">
            <span>启用用户</span>
            <strong>{{ dashboard?.userStats?.enabledUsers ?? '-' }}</strong>
          </article>
          <article class="metric-card">
            <span>设备总数</span>
            <strong>{{ dashboard?.deviceStats?.totalDevices ?? '-' }}</strong>
          </article>
          <article class="metric-card">
            <span>在线设备</span>
            <strong>{{ dashboard?.deviceStats?.onlineDevices ?? '-' }}</strong>
          </article>
        </section>

        <section v-if="activeTab === 'overview'" class="role-action-grid">
          <article class="glass-panel role-action-card">
            <span>{{ isSuperAdmin ? '超级管理员能力' : '管理员能力' }}</span>
            <strong>{{ isSuperAdmin ? '可审批危险操作并委任管理员' : '可管理普通用户和网络策略' }}</strong>
            <p>{{ isSuperAdmin ? '审批、物理删除、管理员委任均在当前控制台内完成。' : '审批和管理员委任只对超级管理员开放，普通管理员不会显示不可用入口。' }}</p>
          </article>
          <article class="glass-panel role-action-card">
            <span>当前边界</span>
            <strong>{{ isSuperAdmin ? '拥有管理员全部能力' : '不能修改管理员之间的信息' }}</strong>
            <p>{{ isSuperAdmin ? '仍然禁止直接物理删除超级管理员自身，避免破坏根权限。' : '用户管理页只允许操作普通用户，物理删除会提交审批申请。' }}</p>
          </article>
        </section>

        <section v-else-if="activeTab === 'profile'" class="profile-grid">
          <form class="profile-panel glass-panel" @submit.prevent="saveProfile">
            <div class="avatar-editor">
              <div class="avatar-preview">
                <img v-if="profile.avatar" :src="profile.avatar" alt="头像预览" />
                <span v-else>{{ initials() }}</span>
              </div>
              <div>
                <strong>{{ profile.nickname || profile.username }}</strong>
                <p>{{ isSuperAdmin ? '超级管理员' : '管理员' }}</p>
              </div>
            </div>
            <label>
              <span>用户名</span>
              <input v-model="profile.username" disabled />
            </label>
            <label>
              <span>昵称</span>
              <input v-model="profile.nickname" />
            </label>
            <label>
              <span>邮箱</span>
              <input v-model="profile.email" type="email" />
            </label>
            <label>
              <span>手机号</span>
              <input v-model="profile.phone" type="tel" />
            </label>
            <label>
              <span>头像地址</span>
              <input v-model="profile.avatar" placeholder="https://..." />
            </label>
            <label>
              <span>上传头像</span>
              <input type="file" accept="image/*" @change="chooseProfileAvatar" />
            </label>
            <button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存资料' }}</button>
          </form>
        </section>

        <template v-else>
          <section class="toolbar glass-toolbar">
            <label v-if="['locations', 'sessions', 'traffic'].includes(activeTab)">
              <span>MAC 地址</span>
              <input v-model="filters.mac" type="text" placeholder="AA:BB:CC" @keyup.enter="search" />
            </label>
            <label v-else>
              <span>关键字</span>
              <input v-model="filters.keyword" type="text" placeholder="输入关键字" @keyup.enter="search" />
            </label>
            <button type="button" :disabled="loading" @click="search">查询</button>
            <button class="secondary-button" type="button" :disabled="loading" @click="reset">重置</button>
          </section>

          <section v-if="activeTab === 'blacklist'" class="toolbar glass-toolbar">
            <label>
              <span>新增 MAC</span>
              <input v-model="blacklistForm.mac" type="text" placeholder="AA:BB:CC:DD:EE:FF" />
            </label>
            <label>
              <span>原因</span>
              <input v-model="blacklistForm.reason" type="text" placeholder="可选" />
            </label>
            <button type="button" :disabled="loading" @click="submitBlacklist">加入黑名单</button>
          </section>

          <section v-if="activeTab === 'rules'" class="toolbar glass-toolbar">
            <div class="toolbar-note">
              <strong>访问规则</strong>
              <span>配置域名、IP、端口匹配后的告警、阻断或限速动作。</span>
            </div>
            <button type="button" :disabled="loading" @click="openRuleEditor()">新增规则</button>
          </section>

          <LocationMap
            v-if="activeTab === 'locations'"
            class="location-panel"
            :locations="rows"
            title="GPS 空间视图"
          />

          <section class="table-panel glass-panel">
            <div class="table-summary">
              <strong>{{ pager.total }}</strong>
              <span>条记录</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th v-for="column in currentColumns" :key="column[0]">{{ column[1] }}</th>
                  <th v-if="['users', 'devices', 'blacklist', 'rules', 'alerts', 'audits', 'approvals'].includes(activeTab)">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td :colspan="currentColumns.length + 1">
                    <StateBlock type="loading" title="正在加载" text="正在同步后台数据" />
                  </td>
                </tr>
                <tr v-else-if="rows.length === 0">
                  <td :colspan="currentColumns.length + 1">
                    <StateBlock title="暂无数据" text="当前筛选条件下没有记录" />
                  </td>
                </tr>
                <tr v-for="item in rows" :key="item.id || item.userId || item.nodeId || item.mac">
                  <td v-for="column in currentColumns" :key="column[0]">{{ formatValue(column[0], item[column[0]]) }}</td>
                  <td v-if="activeTab === 'users'" class="action-cell">
                    <button class="secondary-button compact-button" type="button" :disabled="!canOperateUser(item)" @click="openUserEditor(item)">编辑</button>
                    <button class="secondary-button compact-button" type="button" :disabled="!canOperateUser(item)" @click="handleRowAction('toggleUser', item)">
                      {{ item.status === 1 ? '禁用' : '启用' }}
                    </button>
                    <button v-if="isSuperAdmin && item.role === 2" class="secondary-button compact-button" type="button" @click="handleRowAction('promoteAdmin', item)">委任管理员</button>
                    <button v-if="isSuperAdmin && item.role === 1" class="secondary-button compact-button" type="button" @click="handleRowAction('demoteUser', item)">降为用户</button>
                    <button class="danger-button compact-button" type="button" :disabled="!canOperateUser(item)" @click="handleRowAction('deleteUser', item)">逻辑删除</button>
                    <button v-if="isSuperAdmin" class="danger-button compact-button" type="button" :disabled="item.role === 0" @click="handleRowAction('purgeUser', item)">物理删除</button>
                    <button v-else class="danger-button compact-button" type="button" :disabled="!canOperateUser(item)" @click="handleRowAction('requestPurge', item)">申请物理删除</button>
                  </td>
                  <td v-else-if="activeTab === 'devices'" class="action-cell">
                    <button class="secondary-button compact-button" type="button" @click="openDetail(item, 'devices')">详情</button>
                    <button class="secondary-button compact-button" type="button" :disabled="!item.deviceCode" @click="handleRowAction('allowDevice', item)">允许接入</button>
                    <button class="danger-button compact-button" type="button" :disabled="!item.deviceCode" @click="handleRowAction('kickDevice', item)">踢出</button>
                  </td>
                  <td v-else-if="activeTab === 'blacklist'" class="action-cell">
                    <button class="danger-button compact-button" type="button" @click="handleRowAction('removeBlacklist', item)">移除</button>
                  </td>
                  <td v-else-if="activeTab === 'rules'" class="action-cell">
                    <button class="secondary-button compact-button" type="button" @click="openRuleEditor(item)">编辑</button>
                    <button class="secondary-button compact-button" type="button" @click="handleRowAction('toggleRule', item)">
                      {{ item.enabled ? '停用' : '启用' }}
                    </button>
                    <button class="danger-button compact-button" type="button" @click="handleRowAction('deleteRule', item)">删除</button>
                  </td>
                  <td v-else-if="activeTab === 'alerts'" class="action-cell">
                    <button class="secondary-button compact-button" type="button" @click="openDetail(item, 'alerts')">详情</button>
                    <button class="secondary-button compact-button" type="button" @click="handleRowAction('handleAlert', item)">处理</button>
                  </td>
                  <td v-else-if="activeTab === 'audits'" class="action-cell">
                    <button class="secondary-button compact-button" type="button" @click="openDetail(item, 'audits')">详情</button>
                  </td>
                  <td v-else-if="activeTab === 'approvals'" class="action-cell">
                    <button v-if="isSuperAdmin && item.status === 0" class="secondary-button compact-button" type="button" @click="handleRowAction('approveRequest', item)">通过</button>
                    <button v-if="isSuperAdmin && item.status === 0" class="danger-button compact-button" type="button" @click="handleRowAction('rejectRequest', item)">驳回</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <footer class="pager">
            <button class="secondary-button" type="button" :disabled="loading || pager.current <= 1" @click="prevPage">上一页</button>
            <span>第 {{ pager.current }} / {{ totalPages }} 页</span>
            <button class="secondary-button" type="button" :disabled="loading || pager.current >= totalPages" @click="nextPage">下一页</button>
          </footer>
        </template>
      </section>
    </main>

    <div v-if="editingUser" class="modal-backdrop" @click.self="closeUserEditor">
      <form class="modal-panel glass-panel" @submit.prevent="submitUserEditor">
        <header class="modal-header">
          <div>
            <p class="page-kicker">用户资料</p>
            <h3>{{ userForm.username }}</h3>
          </div>
          <button class="secondary-button compact-button" type="button" @click="closeUserEditor">关闭</button>
        </header>
        <div class="avatar-editor compact-avatar">
          <div class="avatar-preview">
            <img v-if="userForm.avatar" :src="userForm.avatar" alt="头像预览" />
            <span v-else>{{ (userForm.nickname || userForm.username || 'U').slice(0, 1).toUpperCase() }}</span>
          </div>
          <div>
            <strong>{{ userForm.nickname || userForm.username }}</strong>
            <p>{{ formatValue('role', userForm.role) }}</p>
          </div>
        </div>
        <label>
          <span>昵称</span>
          <input v-model="userForm.nickname" />
        </label>
        <label>
          <span>邮箱</span>
          <input v-model="userForm.email" type="email" />
        </label>
        <label>
          <span>手机号</span>
          <input v-model="userForm.phone" type="tel" />
        </label>
        <label>
          <span>头像地址</span>
          <input v-model="userForm.avatar" placeholder="https://..." />
        </label>
        <label>
          <span>上传头像</span>
          <input type="file" accept="image/*" @change="chooseUserAvatar" />
        </label>
        <div class="form-row">
          <label>
            <span>最大连接数</span>
            <input v-model="userForm.maxConnections" type="number" min="0" />
          </label>
          <label>
            <span>每日配额分钟</span>
            <input v-model="userForm.dailyQuotaMinutes" type="number" min="0" />
          </label>
        </div>
        <div class="form-row">
          <label>
            <span>过期时间</span>
            <input v-model="userForm.expireTime" type="datetime-local" />
          </label>
          <label>
            <span>角色</span>
            <select v-model="userForm.role" :disabled="!canEditRole(userForm)">
              <option :value="2">普通用户</option>
              <option :value="1">管理员</option>
            </select>
          </label>
        </div>
        <button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存用户资料' }}</button>
      </form>
    </div>

    <div v-if="editingRule" class="modal-backdrop" @click.self="closeRuleEditor">
      <form class="modal-panel glass-panel" @submit.prevent="submitRuleEditor">
        <header class="modal-header">
          <div>
            <p class="page-kicker">访问规则</p>
            <h3>{{ ruleForm.id ? '编辑规则' : '新增规则' }}</h3>
          </div>
          <button class="secondary-button compact-button" type="button" @click="closeRuleEditor">关闭</button>
        </header>
        <label>
          <span>规则编码</span>
          <input v-model="ruleForm.ruleCode" :disabled="!!ruleForm.id" placeholder="BLOCK_BAD_DOMAIN" />
        </label>
        <div class="form-row">
          <label>
            <span>规则类型</span>
            <select v-model="ruleForm.ruleType">
              <option :value="1">域名</option>
              <option :value="2">IP</option>
              <option :value="3">端口</option>
            </select>
          </label>
          <label>
            <span>动作</span>
            <select v-model="ruleForm.actionType">
              <option :value="1">告警</option>
              <option :value="2">阻断</option>
              <option :value="3">限速</option>
            </select>
          </label>
        </div>
        <label>
          <span>匹配值</span>
          <input v-model="ruleForm.pattern" placeholder="example.com / 192.168.1.1 / 443" />
        </label>
        <div class="form-row">
          <label>
            <span>级别</span>
            <input v-model="ruleForm.level" type="number" min="1" />
          </label>
          <label>
            <span>启用</span>
            <select v-model="ruleForm.enabled">
              <option :value="1">启用</option>
              <option :value="0">停用</option>
            </select>
          </label>
        </div>
        <label>
          <span>描述</span>
          <input v-model="ruleForm.description" placeholder="可选" />
        </label>
        <button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存规则' }}</button>
      </form>
    </div>

    <div v-if="detailDrawer.open" class="drawer-backdrop" @click.self="closeDetail">
      <aside class="drawer-panel glass-panel">
        <header class="modal-header">
          <div>
            <p class="page-kicker">详情</p>
            <h3>{{ detailDrawer.title }}</h3>
          </div>
          <button class="secondary-button compact-button" type="button" @click="closeDetail">关闭</button>
        </header>
        <dl class="detail-list">
          <template v-for="field in detailDrawer.fields" :key="field[0]">
            <dt>{{ field[1] }}</dt>
            <dd>{{ formatValue(field[0], detailDrawer.row?.[field[0]]) }}</dd>
          </template>
        </dl>
      </aside>
    </div>
  </div>
</template>
