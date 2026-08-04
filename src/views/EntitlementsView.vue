<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import { useRequestGate } from '@/composables/useRequestGate'
import { getMyEntitlement, getMyPurchases, getMyUsageLogs } from '@/api/entitlements'
import { getApiErrorMessage } from '@/utils/apiError'
import './operations/operations.css'

const router = useRouter()
const snapshot = ref(null)
const purchases = ref([])
const usage = ref([])
const loading = reactive({ snapshot: false, purchases: false, usage: false })
const errors = reactive({ snapshot: '', purchases: '', usage: '' })
const requestGate = useRequestGate()
const purchasePager = reactive({ current: 1, size: 10, total: 0 })
const usagePager = reactive({ current: 1, size: 10, total: 0 })

const anyLoading = computed(() => Object.values(loading).some(Boolean))

function unwrap(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
  return response.data.data
}

function time(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

function duration(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) ? `${(seconds / 3600).toFixed(1)} 小时` : '-'
}

function money(value) {
  return `¥${(Number(value || 0) / 100).toFixed(2)}`
}

async function loadSnapshot() {
  const version = requestGate.begin('snapshot')
  loading.snapshot = true
  errors.snapshot = ''
  try {
    const data = unwrap(await getMyEntitlement(), '权益加载失败')
    if (requestGate.isCurrent(version, 'snapshot')) snapshot.value = data
  } catch (cause) {
    if (requestGate.isCurrent(version, 'snapshot')) {
      errors.snapshot = cause instanceof Error && !cause.response
        ? cause.message
        : getApiErrorMessage(cause, '权益加载失败')
    }
  } finally {
    if (requestGate.isCurrent(version, 'snapshot')) loading.snapshot = false
  }
}

async function loadPurchases(page = purchasePager.current) {
  const version = requestGate.begin('purchases')
  loading.purchases = true
  errors.purchases = ''
  try {
    const data = unwrap(await getMyPurchases({ current: page, size: purchasePager.size }), '购买记录加载失败') || {}
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
    const data = unwrap(await getMyUsageLogs({ current: page, size: usagePager.size }), '使用流水加载失败') || {}
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
  return Promise.all([loadSnapshot(), loadPurchases(), loadUsage()])
}

function requestRefund(purchaseId) {
  router.push({ path: '/app/refunds', query: { purchaseId: String(purchaseId || '') } })
}

onMounted(loadAll)
</script>

<template>
  <section class="workspace-view operations-page">
    <header class="dashboard-header">
      <div><p class="page-kicker">个人权益</p><h2>我的权益</h2></div>
      <button class="secondary-button" type="button" :disabled="anyLoading" @click="loadAll">
        <RefreshCw :size="16" />刷新
      </button>
    </header>

    <p v-if="errors.snapshot" class="alert error">{{ errors.snapshot }}</p>
    <StateBlock v-if="loading.snapshot && !snapshot" type="loading" title="正在加载权益" />
    <section v-if="snapshot" class="operations-grid">
      <article class="glass-panel operations-panel">
        <h3>当前权益</h3>
        <dl class="operations-detail">
          <dt>模式</dt><dd>{{ snapshot.mode || '-' }}</dd>
          <dt>剩余时长</dt><dd>{{ duration(snapshot.remainingSeconds) }}</dd>
          <dt>状态</dt><dd>{{ Number(snapshot.status) === 1 ? '启用' : '停用' }}</dd>
        </dl>
      </article>
      <article class="glass-panel operations-panel">
        <h3>订阅周期</h3>
        <dl class="operations-detail">
          <dt>开始</dt><dd>{{ time(snapshot.subscriptionStartTime) }}</dd>
          <dt>结束</dt><dd>{{ time(snapshot.subscriptionEndTime) }}</dd>
        </dl>
      </article>
    </section>

    <section class="glass-panel operations-panel operations-table-wrap">
      <h3>购买记录</h3>
      <p v-if="errors.purchases" class="alert error">{{ errors.purchases }}</p>
      <StateBlock v-if="loading.purchases && !purchases.length" type="loading" title="正在加载购买记录" />
      <StateBlock v-else-if="!purchases.length" title="暂无购买记录" />
      <table v-else class="operations-table">
        <thead><tr><th>购买 ID</th><th>购买时长</th><th>剩余时长</th><th>实付</th><th>退款状态</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in purchases" :key="row.purchaseId">
            <td>{{ row.purchaseId || row.orderNo }}</td><td>{{ duration(row.purchasedSeconds) }}</td>
            <td>{{ duration(row.remainingSeconds) }}</td><td>{{ money(row.paidAmountCents) }}</td>
            <td>{{ row.refundable === 1 ? '可申请退款' : '不可退款' }}</td><td>{{ time(row.createTime) }}</td>
            <td><button v-if="row.refundable === 1" class="secondary-button compact-button" type="button" @click="requestRefund(row.purchaseId)">申请退款</button></td>
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
            <td>{{ row.beforeSeconds }}</td><td>{{ row.afterSeconds }}</td><td>{{ row.reason }}</td><td>{{ time(row.createTime) }}</td>
          </tr>
        </tbody>
      </table>
      <AppPagination :current="usagePager.current" :size="usagePager.size" :total="usagePager.total" :busy="loading.usage" @change="loadUsage" />
    </section>
  </section>
</template>
