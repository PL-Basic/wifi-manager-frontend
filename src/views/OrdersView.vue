<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Eye, Plus, RefreshCw } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import AppTableFrame from '@/components/app/AppTableFrame.vue'
import { getOrders, getProducts } from '@/api/entitlements'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'
import { ORDER_STATUSES, resolveOrderStatus } from '@/config/operationStatus'
import { formatDateTime, formatDuration, formatMoney } from '@/utils/billing'
import './operations/operations.css'
import './billing.css'

const router = useRouter()
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const rows = ref([])
const products = ref([])
const status = ref('')
const appliedStatus = ref('')
const pager = reactive({ current: 1, size: 10, total: 0 })
const requestGate = useRequestGate()

const productNames = computed(() => new Map(
  products.value.map((item) => [item.productCode, item.name])
))

function unwrap(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
  return response.data.data
}

function productName(row) {
  if (row.orderType === 'REWARD') return '超级管理员奖励'
  return productNames.value.get(row.productCode) || row.productCode || '-'
}

async function load(page = pager.current) {
  const version = requestGate.begin()
  loading.value = true
  error.value = ''

  const [orderResult, productResult] = await Promise.allSettled([
    getOrders({ current: page, size: pager.size, status: appliedStatus.value || undefined }),
    getProducts()
  ])

  if (!requestGate.isCurrent(version)) return

  if (productResult.status === 'fulfilled') {
    try {
      const data = unwrap(productResult.value, '商品信息加载失败')
      products.value = Array.isArray(data) ? data : []
    } catch {
      // 商品名称不是订单主数据，失败时继续显示订单中的 productCode。
    }
  }

  if (orderResult.status === 'fulfilled') {
    try {
      const data = unwrap(orderResult.value, '订单加载失败') || {}
      rows.value = Array.isArray(data.records) ? data.records : []
      pager.current = Number(data.current) || page
      pager.size = Number(data.size) || pager.size
      pager.total = Number(data.total) || 0
      loaded.value = true
    } catch (cause) {
      error.value = cause.message
      loaded.value = true
    }
  } else {
    error.value = getApiErrorMessage(orderResult.reason, '订单加载失败')
    loaded.value = true
  }

  loading.value = false
}

function search() {
  appliedStatus.value = status.value
  load(1)
}

function openOrder(row) {
  router.push(`/app/orders/${encodeURIComponent(row.orderNo)}`)
}

onMounted(() => load(1))
</script>

<template>
  <section class="workspace-view operations-page billing-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">账单中心</p>
        <h2>订单记录</h2>
      </div>
      <div class="billing-actions">
        <button class="secondary-button" type="button" :disabled="loading" @click="load()">
          <RefreshCw :size="16" />刷新
        </button>
        <button type="button" @click="router.push('/app/purchase')">
          <Plus :size="16" />购买上网时长
        </button>
      </div>
    </header>

    <p v-if="error" class="alert error">{{ error }}</p>

    <section class="billing-summary" aria-label="订单摘要">
      <article class="billing-metric"><span>订单总数</span><strong>{{ pager.total }}</strong></article>
      <article class="billing-metric"><span>当前筛选</span><strong>{{ status ? resolveOrderStatus(status).label : '全部状态' }}</strong></article>
      <article class="billing-metric"><span>待支付</span><strong>{{ rows.filter((row) => row.status === 'PENDING_PAYMENT').length }}</strong></article>
      <article class="billing-metric"><span>当前页</span><strong>{{ pager.current }}</strong></article>
    </section>

    <form class="glass-toolbar operations-toolbar" @submit.prevent="search">
      <label>
        <span>订单状态</span>
        <select v-model="status">
          <option value="">全部状态</option>
          <option v-for="(item, value) in ORDER_STATUSES" :key="value" :value="value">{{ item.label }}</option>
        </select>
      </label>
      <button type="submit" :disabled="loading">查询</button>
    </form>

    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载订单" />
    <StateBlock v-else-if="loaded && !error && !rows.length" title="暂无订单" text="可以先购买上网时长或按月服务" />

    <AppTableFrame v-if="rows.length" :busy="loading" label="订单记录">
      <table class="operations-table billing-table">
        <thead>
          <tr>
            <th>订单号</th><th>类型</th><th>商品</th><th>上网服务</th><th>状态</th><th>订单金额</th><th>实付</th><th>已退款</th><th>创建时间</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.orderNo">
            <td>{{ row.orderNo }}</td>
            <td>{{ row.orderType === 'REWARD' ? '奖励' : '购买' }}</td>
            <td>{{ productName(row) }}</td>
            <td>{{ formatDuration(row.grantSeconds) }}</td>
            <td><span :class="['status-pill', `status-pill--${resolveOrderStatus(row.status).tone}`]">{{ resolveOrderStatus(row.status).label }}</span></td>
            <td>{{ formatMoney(row.amountCents) }}</td>
            <td>{{ formatMoney(row.paidAmountCents) }}</td>
            <td>{{ formatMoney(row.refundedAmountCents) }}</td>
            <td>{{ formatDateTime(row.createTime) }}</td>
            <td>
              <button class="icon-button" type="button" title="查看订单详情" aria-label="查看订单详情" @click="openOrder(row)">
                <Eye :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </AppTableFrame>

    <AppPagination v-if="loaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="loading" @change="load" />
  </section>
</template>
