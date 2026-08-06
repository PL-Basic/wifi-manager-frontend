<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Eye } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import { getAdminRefund, getAdminRefunds, reviewRefund } from '@/api/operations'
import { getApiErrorMessage } from '@/utils/apiError'
import { requestActionDialog } from '@/composables/useActionDialog'
import { useRequestGate } from '@/composables/useRequestGate'
import { REFUND_STATUSES, resolveRefundStatus } from '@/config/operationStatus'
import { formatDateTime, formatDuration, formatMoney } from '@/utils/billing'
import './operations.css'
import '../billing.css'

const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const message = ref('')
const rows = ref([])
const busyKey = ref('')
const selectedRefund = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const filters = reactive({ userId: '', status: '' })
const applied = reactive({ userId: '', status: '' })
const pager = reactive({ current: 1, size: 10, total: 0 })
const requestGate = useRequestGate()


function unwrap(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
  return response.data.data
}

async function load(page = pager.current) {
  const version = requestGate.begin()
  loading.value = true
  error.value = ''

  try {
    const data = unwrap(await getAdminRefunds({
      current: page,
      size: pager.size,
      userId: applied.userId || undefined,
      status: applied.status || undefined
    }), '退款加载失败') || {}

    if (!requestGate.isCurrent(version)) return
    pager.current = Number(data.current) || page
    pager.size = Number(data.size) || pager.size
    pager.total = Number(data.total) || 0
    rows.value = Array.isArray(data.records) ? data.records : []
    loaded.value = true
  } catch (cause) {
    if (requestGate.isCurrent(version)) {
      error.value = cause instanceof Error && !cause.response
        ? cause.message
        : getApiErrorMessage(cause, '退款加载失败')
      loaded.value = true
    }
  } finally {
    if (requestGate.isCurrent(version)) loading.value = false
  }
}

function search() {
  Object.assign(applied, filters)
  load(1)
}

async function review(row, decision) {
  const approved = decision === 'APPROVE'
  const result = await requestActionDialog({
    title: `确认${approved ? '通过' : '驳回'}退款`,
    message: `退款 ${row.refundNo} 将${approved ? '进入退款处理' : '被驳回并结束'}。`,
    confirmLabel: approved ? '通过退款' : '驳回退款',
    inputLabel: approved ? '审核备注' : '驳回原因',
    inputPlaceholder: approved ? '选填' : '请输入驳回原因',
    inputRequired: !approved,
    tone: approved ? 'primary' : 'danger'
  })
  if (!result.confirmed) return
  const comment = result.value

  busyKey.value = `review:${row.refundNo}`
  error.value = ''
  message.value = ''
  try {
    const updated = unwrap(await reviewRefund(row.refundNo, { decision, comment: comment || null }), '退款审核失败')
    if (selectedRefund.value?.refundNo === row.refundNo) selectedRefund.value = updated
    message.value = decision === 'APPROVE' ? '退款已通过审核' : '退款已驳回'
    await load()
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '退款审核失败')
  } finally {
    busyKey.value = ''
  }
}

async function openRefund(row) {
  selectedRefund.value = row
  detailLoading.value = true
  detailError.value = ''

  try {
    selectedRefund.value = unwrap(await getAdminRefund(row.refundNo), '退款详情加载失败')
  } catch (cause) {
    detailError.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '退款详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

function closeRefund() {
  if (busyKey.value) return
  selectedRefund.value = null
  detailError.value = ''
}

onMounted(() => load(1))
</script>

<template>
  <section class="workspace-view operations-page">
    <header class="dashboard-header"><div><p class="page-kicker">业务管理</p><h2>退款审核</h2></div></header>
    <p v-if="error" class="alert error">{{ error }}</p>
    <p v-if="message" class="alert success">{{ message }}</p>

    <form class="glass-toolbar operations-toolbar" @submit.prevent="search">
      <label><span>用户 ID</span><input v-model="filters.userId" type="number" min="1" /></label>
      <label><span>状态</span><select v-model="filters.status"><option value="">全部状态</option><option v-for="(item, value) in REFUND_STATUSES" :key="value" :value="value">{{ item.label }}</option></select></label>
      <button type="submit" :disabled="loading">查询</button>
    </form>

    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载退款" />
    <StateBlock v-else-if="loaded && !error && !rows.length" title="暂无退款" />
    <section v-if="loaded && rows.length" class="glass-panel operations-table-wrap">
      <table class="operations-table refund-review-table">
        <colgroup>
          <col style="width: 250px" /><col style="width: 90px" /><col style="width: 250px" /><col style="width: 120px" />
          <col style="width: 120px" /><col style="width: 260px" /><col style="width: 120px" /><col style="width: 250px" />
        </colgroup>
        <thead><tr><th>退款号</th><th>用户</th><th>购买 ID</th><th>状态</th><th>申请金额</th><th>原因</th><th>审核人</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.refundNo">
            <td :title="row.refundNo">{{ row.refundNo }}</td><td :title="String(row.userId)">{{ row.userId }}</td><td :title="row.purchaseId || row.orderNo">{{ row.purchaseId || row.orderNo }}</td>
            <td><span :class="['status-pill', `status-pill--${resolveRefundStatus(row.status).tone}`]">{{ resolveRefundStatus(row.status).label }}</span></td>
            <td>{{ formatMoney(row.requestedAmountCents) }}</td><td class="refund-reason-cell" :title="row.reason">{{ row.reason }}</td><td :title="row.reviewerName || '-'">{{ row.reviewerName || '-' }}</td>
            <td class="refund-action-cell">
              <div class="operations-actions refund-row-actions">
                <button class="icon-button" type="button" title="查看退款详情" aria-label="查看退款详情" @click="openRefund(row)"><Eye :size="16" /></button>
                <template v-if="row.status === 'REQUESTED'">
                  <button class="secondary-button compact-button" type="button" :disabled="!!busyKey" @click="review(row, 'APPROVE')">通过</button>
                  <button class="danger-button compact-button" type="button" :disabled="!!busyKey" @click="review(row, 'REJECT')">驳回</button>
                </template>
                <template v-if="row.status === 'PROCESSING'">
                  <button class="secondary-button compact-button" type="button" disabled title="真实支付退款尚未接入">当前服务未提供</button>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <AppPagination v-if="loaded" :current="pager.current" :size="pager.size" :total="pager.total" :busy="loading" @change="load" />

    <AppDrawer
      :open="!!selectedRefund"
      title="退款详情"
      kicker="退款审核"
      width="720px"
      :close-disabled="!!busyKey"
      @close="closeRefund"
    >
      <template v-if="selectedRefund">
        <StateBlock v-if="detailLoading" type="loading" title="正在加载退款详情" />
        <p v-else-if="detailError" class="alert error">{{ detailError }}</p>
        <template v-else>
        <section class="refund-detail-section">
          <h4>申请信息</h4>
          <dl class="operations-detail">
            <dt>退款单号</dt><dd>{{ selectedRefund.refundNo }}</dd>
            <dt>购买 ID</dt><dd>{{ selectedRefund.purchaseId || selectedRefund.orderNo }}</dd>
            <dt>支付单号</dt><dd>{{ selectedRefund.paymentNo || '-' }}</dd>
            <dt>用户 ID</dt><dd>{{ selectedRefund.userId }}</dd>
            <dt>申请状态</dt><dd><span :class="['status-pill', `status-pill--${resolveRefundStatus(selectedRefund.status).tone}`]">{{ resolveRefundStatus(selectedRefund.status).label }}</span></dd>
            <dt>申请金额</dt><dd>{{ formatMoney(selectedRefund.requestedAmountCents) }}</dd>
            <dt>申请时长</dt><dd>{{ formatDuration(selectedRefund.requestedSeconds) }}</dd>
            <dt>申请原因</dt><dd>{{ selectedRefund.reason }}</dd>
            <dt>申请时间</dt><dd>{{ formatDateTime(selectedRefund.createTime) }}</dd>
          </dl>
        </section>

        <section class="refund-detail-section">
          <h4>审核与结果</h4>
          <dl class="operations-detail">
            <dt>审核人</dt><dd>{{ selectedRefund.reviewerName || '-' }}</dd>
            <dt>审核备注</dt><dd>{{ selectedRefund.reviewComment || '-' }}</dd>
            <dt>审核时间</dt><dd>{{ formatDateTime(selectedRefund.reviewTime) }}</dd>
            <dt>退款渠道</dt><dd>{{ selectedRefund.channel || '-' }}</dd>
            <dt>渠道退款号</dt><dd>{{ selectedRefund.channelRefundNo || '-' }}</dd>
            <dt>实际退款</dt><dd>{{ formatMoney(selectedRefund.refundAmountCents) }}</dd>
            <dt>实际退还时长</dt><dd>{{ formatDuration(selectedRefund.refundedSeconds) }}</dd>
            <dt>失败原因</dt><dd>{{ selectedRefund.failureMessage || '-' }}</dd>
            <dt>完成时间</dt><dd>{{ formatDateTime(selectedRefund.completeTime) }}</dd>
          </dl>
        </section>

        <div class="billing-actions">
          <template v-if="selectedRefund.status === 'REQUESTED'">
            <button type="button" :disabled="!!busyKey" @click="review(selectedRefund, 'APPROVE')">通过退款</button>
            <button class="danger-button" type="button" :disabled="!!busyKey" @click="review(selectedRefund, 'REJECT')">驳回退款</button>
          </template>
          <template v-if="selectedRefund.status === 'PROCESSING'">
            <button type="button" disabled title="真实支付退款尚未接入">当前服务未提供</button>
          </template>
        </div>
        </template>
      </template>
    </AppDrawer>
  </section>
</template>
