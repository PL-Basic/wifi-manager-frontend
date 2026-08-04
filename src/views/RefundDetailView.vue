<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import { getRefund } from '@/api/entitlements'
import { resolveRefundStatus } from '@/config/operationStatus'
import { getApiErrorMessage } from '@/utils/apiError'
import {
  formatDateTime,
  formatDuration,
  formatMoney
} from '@/utils/billing'
import './operations/operations.css'
import './billing.css'

const route = useRoute()
const router = useRouter()
const refund = ref(null)
const loading = ref(false)
const error = ref('')

const refundNo = computed(() => String(route.params.refundNo || '').trim())
const refundStatus = computed(() => resolveRefundStatus(refund.value?.status))

function unwrap(response, fallback) {
  if (response.data?.code !== 200) {
    throw new Error(response.data?.message || fallback)
  }
  return response.data.data
}

async function loadRefund() {
  if (!refundNo.value || loading.value) return

  loading.value = true
  error.value = ''

  try {
    refund.value = unwrap(await getRefund(refundNo.value), '退款详情加载失败')
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '退款详情加载失败')
  } finally {
    loading.value = false
  }
}

function openOrder() {
  if (!refund.value?.orderNo) return
  router.push('/app/orders/' + encodeURIComponent(refund.value.orderNo))
}

onMounted(loadRefund)
</script>

<template>
  <section class="workspace-view billing-page">
    <header class="dashboard-header">
      <div>
        <button class="secondary-button compact-button" type="button" @click="router.push('/app/refunds')">
          <ArrowLeft :size="16" />
          返回退款
        </button>
        <h2>退款详情</h2>
      </div>

      <button class="secondary-button" type="button" :disabled="loading" @click="loadRefund">
        <RefreshCw :size="16" />
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <p v-if="error" class="alert error">{{ error }}</p>
    <StateBlock v-if="loading && !refund" type="loading" title="正在加载退款详情" />

    <template v-if="refund">
      <section class="billing-summary" aria-label="退款状态摘要">
        <article class="billing-metric">
          <span>退款状态</span>
          <strong class="billing-detail-status">
            <span :class="['status-pill', 'status-pill--' + refundStatus.tone]">
              {{ refundStatus.label }}
            </span>
          </strong>
        </article>
        <article class="billing-metric">
          <span>申请金额</span>
          <strong>{{ formatMoney(refund.requestedAmountCents) }}</strong>
        </article>
        <article class="billing-metric">
          <span>实际退款</span>
          <strong>{{ formatMoney(refund.refundAmountCents) }}</strong>
        </article>
        <article class="billing-metric">
          <span>完成时间</span>
          <strong>{{ formatDateTime(refund.completeTime) }}</strong>
        </article>
      </section>

      <section class="billing-detail-grid">
        <article class="glass-panel billing-panel">
          <header class="billing-section-heading">
            <div>
              <p class="page-kicker">退款申请</p>
              <h3>{{ refund.refundNo }}</h3>
            </div>
          </header>

          <dl class="operations-detail">
            <dt>关联订单</dt><dd>{{ refund.orderNo || '-' }}</dd>
            <dt>支付单号</dt><dd>{{ refund.paymentNo || '-' }}</dd>
            <dt>购买 ID</dt><dd>{{ refund.purchaseId || refund.orderNo || '-' }}</dd>
            <dt>请求 ID</dt><dd>{{ refund.requestId || '-' }}</dd>
            <dt>申请时长</dt><dd>{{ formatDuration(refund.requestedSeconds) }}</dd>
            <dt>申请金额</dt><dd>{{ formatMoney(refund.requestedAmountCents) }}</dd>
            <dt>申请原因</dt><dd>{{ refund.reason || '-' }}</dd>
            <dt>申请时间</dt><dd>{{ formatDateTime(refund.createTime) }}</dd>
          </dl>

          <div class="billing-actions">
            <button class="secondary-button" type="button" :disabled="!refund.orderNo" @click="openOrder">
              <ExternalLink :size="16" />
              查看关联订单
            </button>
          </div>
        </article>

        <article class="glass-panel billing-panel">
          <header class="billing-section-heading">
            <div>
              <p class="page-kicker">审核与渠道结果</p>
              <h3>{{ refundStatus.label }}</h3>
            </div>
          </header>

          <dl class="operations-detail">
            <dt>审核人</dt><dd>{{ refund.reviewerName || '-' }}</dd>
            <dt>审核备注</dt><dd>{{ refund.reviewComment || '-' }}</dd>
            <dt>审核时间</dt><dd>{{ formatDateTime(refund.reviewTime) }}</dd>
            <dt>退款渠道</dt><dd>{{ refund.channel || '-' }}</dd>
            <dt>渠道退款号</dt><dd>{{ refund.channelRefundNo || '-' }}</dd>
            <dt>退还时长</dt><dd>{{ formatDuration(refund.refundedSeconds) }}</dd>
            <dt>实际退款</dt><dd>{{ formatMoney(refund.refundAmountCents) }}</dd>
            <dt>失败原因</dt><dd>{{ refund.failureMessage || '-' }}</dd>
            <dt>完成时间</dt><dd>{{ formatDateTime(refund.completeTime) }}</dd>
            <dt>最后更新</dt><dd>{{ formatDateTime(refund.updateTime) }}</dd>
          </dl>
        </article>
      </section>
    </template>
  </section>
</template>
