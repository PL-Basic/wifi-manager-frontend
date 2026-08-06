<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, CreditCard, RefreshCw, XCircle } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import {
  cancelOrder,
  getOrder
} from '@/api/entitlements'
import { confirmAction } from '@/composables/useActionDialog'
import { getApiErrorMessage } from '@/utils/apiError'
import { resolveOrderStatus } from '@/config/operationStatus'
import {
  entitlementModeLabel,
  formatDateTime,
  formatDuration,
  formatMoney
} from '@/utils/billing'
import './operations/operations.css'
import './billing.css'

const route = useRoute()
const router = useRouter()
const order = ref(null)
const loading = ref(false)
const busyKey = ref('')
const error = ref('')
const message = ref('')

const orderNo = computed(() => String(route.params.orderNo || ''))
const canPay = computed(() => order.value?.status === 'PENDING_PAYMENT')

function unwrap(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
  return response.data.data
}

async function loadOrder() {
  loading.value = true
  error.value = ''

  try {
    order.value = unwrap(await getOrder(orderNo.value), '订单详情加载失败')
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '订单详情加载失败')
  } finally {
    loading.value = false
  }
}

async function showPaymentUnavailable() {
  await confirmAction({
    title: '支付服务尚未开放',
    message: '当前版本尚未接入真实支付渠道，暂时无法完成付款。订单会保持待支付状态，您也可以主动取消。',
    confirmLabel: '知道了'
  })
}

async function cancelCurrentOrder() {
  if (!canPay.value) return

  const confirmed = await confirmAction({
    title: '确认取消订单',
    message: `订单 ${orderNo.value} 取消后不能继续支付。`,
    confirmLabel: '取消订单',
    tone: 'danger'
  })
  if (!confirmed) return

  busyKey.value = 'cancel'
  error.value = ''
  message.value = ''

  try {
    order.value = unwrap(await cancelOrder(orderNo.value), '订单取消失败')
    message.value = '订单已取消'
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '订单取消失败')
  } finally {
    busyKey.value = ''
  }
}

onMounted(loadOrder)
</script>

<template>
  <section class="workspace-view billing-page">
    <header class="dashboard-header">
      <div>
        <button class="secondary-button compact-button" type="button" @click="router.push('/app/orders')">
          <ArrowLeft :size="16" />返回订单
        </button>
        <h2>订单详情</h2>
      </div>
      <button class="secondary-button" type="button" :disabled="loading || !!busyKey" @click="loadOrder">
        <RefreshCw :size="16" />刷新
      </button>
    </header>

    <p v-if="error" class="alert error">{{ error }}</p>
    <p v-if="message" class="alert success">{{ message }}</p>
    <StateBlock v-if="loading && !order" type="loading" title="正在加载订单详情" />

    <template v-if="order">
      <section class="billing-summary" aria-label="订单状态摘要">
        <article class="billing-metric">
          <span>订单状态</span>
          <strong class="billing-detail-status">
            <span :class="['status-pill', `status-pill--${resolveOrderStatus(order.status).tone}`]">{{ resolveOrderStatus(order.status).label }}</span>
          </strong>
        </article>
        <article class="billing-metric"><span>订单金额</span><strong>{{ formatMoney(order.amountCents) }}</strong></article>
        <article class="billing-metric"><span>获得时长</span><strong>{{ formatDuration(order.grantSeconds) }}</strong></article>
        <article class="billing-metric"><span>{{ order.orderType === 'REWARD' ? '生效时间' : '支付截止' }}</span><strong>{{ formatDateTime(order.orderType === 'REWARD' ? order.fulfilledTime : order.expireTime) }}</strong></article>
      </section>

      <section class="billing-detail-grid">
        <article class="glass-panel billing-panel">
          <header class="billing-section-heading"><div><p class="page-kicker">订单信息</p><h3>{{ order.orderNo }}</h3></div></header>
          <dl class="operations-detail">
            <dt>商品编码</dt><dd>{{ order.productCode }}</dd>
            <dt>订单类型</dt><dd>{{ order.orderType === 'REWARD' ? '奖励订单' : '购买订单' }}</dd>
            <dt>服务类型</dt><dd>{{ entitlementModeLabel(order.entitlementMode) }}</dd>
            <dt>上网时长</dt><dd>{{ formatDuration(order.grantSeconds) }}</dd>
            <dt>订单金额</dt><dd>{{ formatMoney(order.amountCents) }}</dd>
            <dt>实付金额</dt><dd>{{ formatMoney(order.paidAmountCents) }}</dd>
            <dt>已退金额</dt><dd>{{ formatMoney(order.refundedAmountCents) }}</dd>
            <dt>创建时间</dt><dd>{{ formatDateTime(order.createTime) }}</dd>
            <dt>关闭原因</dt><dd>{{ order.closeReason || '-' }}</dd>
            <dt>订单备注</dt><dd>{{ order.remark || '-' }}</dd>
          </dl>
        </article>

        <article class="glass-panel billing-panel">
          <header class="billing-section-heading"><div><p class="page-kicker">{{ order.orderType === 'REWARD' ? '奖励信息' : '支付处理' }}</p><h3>{{ order.orderType === 'REWARD' ? '超级管理员奖励' : '支付渠道' }}</h3></div></header>

          <StateBlock v-if="order.orderType === 'REWARD'" title="奖励已生效" :text="order.remark || '该订单由超级管理员创建，无需支付。'" />
          <StateBlock v-else title="支付服务尚未开放" text="当前版本未接入真实支付渠道，不会创建或完成模拟支付。" />

          <div class="billing-actions">
            <button v-if="canPay" type="button" :disabled="!!busyKey" @click="showPaymentUnavailable">
              <CreditCard :size="16" />前往支付
            </button>
            <button v-if="canPay" class="danger-button" type="button" :disabled="!!busyKey" @click="cancelCurrentOrder">
              <XCircle :size="16" />{{ busyKey === 'cancel' ? '取消中...' : '取消订单' }}
            </button>
          </div>
        </article>
      </section>
    </template>
  </section>
</template>
