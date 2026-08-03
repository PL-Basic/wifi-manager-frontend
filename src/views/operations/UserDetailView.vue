<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowLeft, RefreshCw, SlidersHorizontal } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import RewardOrderModal from '@/components/operations/RewardOrderModal.vue'
import {
  getUser,
  getUserEntitlement,
  getUserPurchases,
  getUserUsageLogs
} from '@/api/operations'
import { getApiErrorMessage } from '@/utils/apiError'
import { getStoredRole } from '@/utils/session'
import { ROLE_SUPER_ADMIN, normalizeRole } from '@/utils/access'
import { useRequestGate } from '@/composables/useRequestGate'
import './operations.css'

const route = useRoute()
const router = useRouter()
const operatorRole = getStoredRole()

const user = ref(null)
const entitlement = ref(null)
const purchases = ref([])
const usage = ref([])
const rewardOpen = ref(false)
const message = ref('')

const loading = reactive({ user: false, entitlement: false, purchases: false, usage: false })
const errors = reactive({ user: '', entitlement: '', purchases: '', usage: '' })
const purchasePager = reactive({ current: 1, size: 10, total: 0 })
const usagePager = reactive({ current: 1, size: 10, total: 0 })
const requestGate = useRequestGate()

const anyLoading = computed(() => Object.values(loading).some(Boolean))

// 奖励订单是超级管理员专属能力，唯一超级管理员也可以给本人发放奖励。
const canCreateRewardOrder = computed(() => {
  return normalizeRole(operatorRole) === ROLE_SUPER_ADMIN
    && Boolean(user.value?.userId)
})

function unwrap(response, fallback) {
  if (response.data?.code !== 200) {
    throw new Error(response.data?.message || fallback)
  }
  return response.data.data
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

function formatDuration(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) ? `${(seconds / 3600).toFixed(1)} 小时` : '-'
}

function roleLabel(value) {
  if (Number(value) === 0) return '超级管理员'
  if (Number(value) === 1) return '管理员'
  return '普通用户'
}

function statusLabel(value) {
  return Number(value) === 1 ? '启用' : '禁用'
}

async function loadUser() {
  const version = requestGate.begin('user')
  loading.user = true
  errors.user = ''

  try {
    const data = unwrap(await getUser(route.params.userId), '用户加载失败')
    if (requestGate.isCurrent(version, 'user')) user.value = data
  } catch (cause) {
    if (requestGate.isCurrent(version, 'user')) {
      errors.user = cause instanceof Error && !cause.response
        ? cause.message
        : getApiErrorMessage(cause, '用户加载失败')
    }
  } finally {
    if (requestGate.isCurrent(version, 'user')) loading.user = false
  }
}

async function loadEntitlement() {
  const version = requestGate.begin('entitlement')
  loading.entitlement = true
  errors.entitlement = ''

  try {
    const data = unwrap(await getUserEntitlement(route.params.userId), '权益加载失败')
    if (requestGate.isCurrent(version, 'entitlement')) entitlement.value = data
  } catch (cause) {
    if (requestGate.isCurrent(version, 'entitlement')) {
      errors.entitlement = cause instanceof Error && !cause.response
        ? cause.message
        : getApiErrorMessage(cause, '权益加载失败')
    }
  } finally {
    if (requestGate.isCurrent(version, 'entitlement')) loading.entitlement = false
  }
}

async function loadPurchases(page = purchasePager.current) {
  const version = requestGate.begin('purchases')
  loading.purchases = true
  errors.purchases = ''

  try {
    const data = unwrap(
      await getUserPurchases(route.params.userId, { current: page, size: purchasePager.size }),
      '购买记录加载失败'
    ) || {}

    if (!requestGate.isCurrent(version, 'purchases')) return
    purchases.value = Array.isArray(data.records) ? data.records : []
    purchasePager.current = Number(data.current) || page
    purchasePager.size = Number(data.size) || purchasePager.size
    purchasePager.total = Number(data.total) || 0
  } catch (cause) {
    if (requestGate.isCurrent(version, 'purchases')) {
      errors.purchases = cause instanceof Error && !cause.response
        ? cause.message
        : getApiErrorMessage(cause, '购买记录加载失败')
    }
  } finally {
    if (requestGate.isCurrent(version, 'purchases')) loading.purchases = false
  }
}

async function loadUsage(page = usagePager.current) {
  const version = requestGate.begin('usage')
  loading.usage = true
  errors.usage = ''

  try {
    const data = unwrap(
      await getUserUsageLogs(route.params.userId, { current: page, size: usagePager.size }),
      '使用流水加载失败'
    ) || {}

    if (!requestGate.isCurrent(version, 'usage')) return
    usage.value = Array.isArray(data.records) ? data.records : []
    usagePager.current = Number(data.current) || page
    usagePager.size = Number(data.size) || usagePager.size
    usagePager.total = Number(data.total) || 0
  } catch (cause) {
    if (requestGate.isCurrent(version, 'usage')) {
      errors.usage = cause instanceof Error && !cause.response
        ? cause.message
        : getApiErrorMessage(cause, '使用流水加载失败')
    }
  } finally {
    if (requestGate.isCurrent(version, 'usage')) loading.usage = false
  }
}

function loadAll() {
  return Promise.all([loadUser(), loadEntitlement(), loadPurchases(), loadUsage()])
}

async function rewarded(order) {
  rewardOpen.value = false
  message.value = `奖励订单 ${order.orderNo} 已创建并生效`
  await Promise.all([loadEntitlement(), loadUsage(1)])
  if (order.entitlementMode === 'DURATION') await loadPurchases(1)
}

onMounted(loadAll)
</script>

<template>
  <section class="workspace-view operations-page">
    <header class="dashboard-header">
      <div>
        <button class="secondary-button compact-button" type="button" @click="router.push('/app/operations/users')">
          <ArrowLeft :size="16" />
          返回
        </button>
        <h2>{{ user?.username || `用户 ${route.params.userId}` }}</h2>
      </div>
      <div class="operations-actions">
        <button class="secondary-button" type="button" :disabled="anyLoading" @click="loadAll">
          <RefreshCw :size="16" />
          刷新
        </button>
        <button v-if="canCreateRewardOrder" type="button" @click="rewardOpen = true">
          <SlidersHorizontal :size="16" />
          创建奖励订单
        </button>
      </div>
    </header>

    <p v-if="errors.user" class="alert error">{{ errors.user }}</p>
    <p v-if="message" class="alert success">{{ message }}</p>
    <StateBlock v-if="loading.user && !user" type="loading" title="正在加载用户详情" />

    <template v-if="user">
      <section class="operations-grid">
        <article class="glass-panel operations-panel">
          <h3>账户</h3>
          <dl class="operations-detail">
            <dt>用户 ID</dt><dd>{{ user.userId }}</dd>
            <dt>昵称</dt><dd>{{ user.nickname || '-' }}</dd>
            <dt>角色</dt><dd>{{ roleLabel(user.role) }}</dd>
            <dt>状态</dt><dd>{{ statusLabel(user.status) }}</dd>
            <dt>最大连接</dt><dd>{{ user.maxConnections ?? '-' }}</dd>
            <dt>每日配额</dt><dd>{{ user.dailyQuotaMinutes ?? '-' }}</dd>
          </dl>
        </article>

        <article class="glass-panel operations-panel">
          <h3>权益</h3>
          <p v-if="errors.entitlement" class="alert error">{{ errors.entitlement }}</p>
          <StateBlock v-if="loading.entitlement && !entitlement" type="loading" title="正在加载权益" />
          <dl v-else class="operations-detail">
            <dt>模式</dt><dd>{{ entitlement?.mode || '-' }}</dd>
            <dt>剩余时长</dt><dd>{{ formatDuration(entitlement?.remainingSeconds) }}</dd>
            <dt>订阅开始</dt><dd>{{ formatTime(entitlement?.subscriptionStartTime) }}</dd>
            <dt>订阅结束</dt><dd>{{ formatTime(entitlement?.subscriptionEndTime) }}</dd>
            <dt>状态</dt><dd>{{ entitlement?.status ?? '-' }}</dd>
          </dl>
        </article>

        <article class="glass-panel operations-panel">
          <h3>登录</h3>
          <dl class="operations-detail">
            <dt>最近登录</dt><dd>{{ formatTime(user.lastLoginTime) }}</dd>
            <dt>最近 IP</dt><dd>{{ user.lastLoginIp || '-' }}</dd>
            <dt>创建时间</dt><dd>{{ formatTime(user.createTime) }}</dd>
            <dt>更新时间</dt><dd>{{ formatTime(user.updateTime) }}</dd>
          </dl>
        </article>
      </section>

      <section class="glass-panel operations-panel operations-table-wrap">
        <h3>购买记录</h3>
        <p v-if="errors.purchases" class="alert error">{{ errors.purchases }}</p>
        <StateBlock v-if="loading.purchases && !purchases.length" type="loading" title="正在加载购买记录" />
        <StateBlock v-else-if="!purchases.length" title="暂无购买记录" />
        <table v-else class="operations-table">
          <thead><tr><th>购买 ID</th><th>订单号</th><th>购买时长</th><th>剩余时长</th><th>实付分</th><th>可退款</th><th>创建时间</th></tr></thead>
          <tbody>
            <tr v-for="row in purchases" :key="row.purchaseId">
              <td>{{ row.purchaseId }}</td><td>{{ row.orderNo }}</td><td>{{ formatDuration(row.purchasedSeconds) }}</td>
              <td>{{ formatDuration(row.remainingSeconds) }}</td><td>{{ row.paidAmountCents }}</td>
              <td>{{ row.refundable === 1 ? '是' : '否' }}</td><td>{{ formatTime(row.createTime) }}</td>
            </tr>
          </tbody>
        </table>
        <AppPagination :current="purchasePager.current" :size="purchasePager.size" :total="purchasePager.total" :busy="loading.purchases" @change="loadPurchases" />
      </section>

      <section class="glass-panel operations-panel operations-table-wrap">
        <h3>使用流水</h3>
        <p v-if="errors.usage" class="alert error">{{ errors.usage }}</p>
        <StateBlock v-if="loading.usage && !usage.length" type="loading" title="正在加载使用流水" />
        <StateBlock v-else-if="!usage.length" title="暂无使用流水" />
        <table v-else class="operations-table">
          <thead><tr><th>ID</th><th>请求号</th><th>Session</th><th>变化秒数</th><th>变化前</th><th>变化后</th><th>原因</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="row in usage" :key="row.id">
              <td>{{ row.id }}</td><td>{{ row.requestId }}</td><td>{{ row.sessionId ?? '-' }}</td><td>{{ row.changeSeconds }}</td>
              <td>{{ row.beforeSeconds }}</td><td>{{ row.afterSeconds }}</td><td>{{ row.reason }}</td><td>{{ formatTime(row.createTime) }}</td>
            </tr>
          </tbody>
        </table>
        <AppPagination :current="usagePager.current" :size="usagePager.size" :total="usagePager.total" :busy="loading.usage" @change="loadUsage" />
      </section>
    </template>

    <RewardOrderModal
      :open="rewardOpen"
      :user-id="route.params.userId"
      @close="rewardOpen = false"
      @saved="rewarded"
    />
  </section>
</template>
