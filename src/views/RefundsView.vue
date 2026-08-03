<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Eye } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import AppPagination from '@/components/app/AppPagination.vue'
import { applyRefund, getRefunds } from '@/api/entitlements'
import { getApiErrorMessage } from '@/utils/apiError'
import { confirmAction } from '@/composables/useActionDialog'
import { useRequestGate } from '@/composables/useRequestGate'
import { REFUND_STATUSES, resolveRefundStatus } from '@/config/operationStatus'
import { formatMoney } from '@/utils/billing'
import './operations/operations.css'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const loaded = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const rows = ref([])
const status = ref('')
const appliedStatus = ref('')
const form = reactive({
  purchaseId: String(route.query.purchaseId || ''),
  reason: ''
})
const pager = reactive({ current: 1, size: 10, total: 0 })
const requestGate = useRequestGate()

let pendingIntent = ''
let pendingRequestId = ''

async function load(page = pager.current) {
  const current = requestGate.begin()
  loading.value = true
  error.value = ''

  try {
    const response = await getRefunds({
      current: page,
      size: pager.size,
      status: appliedStatus.value || undefined
    })

    if (!requestGate.isCurrent(current)) return
    if (response.data?.code !== 200) {
      throw new Error(response.data?.message || '退款加载失败')
    }

    const data = response.data.data || {}
    Object.assign(pager, {
      current: Number(data.current) || page,
      size: Number(data.size) || pager.size,
      total: Number(data.total) || 0
    })
    rows.value = Array.isArray(data.records) ? data.records : []
    loaded.value = true
  } catch (cause) {
    if (requestGate.isCurrent(current)) {
      error.value = cause instanceof Error && !cause.response
        ? cause.message
        : getApiErrorMessage(cause, '退款加载失败')
      loaded.value = true
    }
  } finally {
    if (requestGate.isCurrent(current)) loading.value = false
  }
}

function search() {
  appliedStatus.value = status.value
  load(1)
}

function requestIdFor(purchaseId, reason) {
  const intent = JSON.stringify([purchaseId, reason])

  if (intent !== pendingIntent) {
    pendingIntent = intent
    pendingRequestId = ('REFUND-' + purchaseId + '-' + Date.now()).slice(0, 56)
  }

  return pendingRequestId
}

async function apply() {
  const purchaseId = Number(form.purchaseId)
  const reason = form.reason.trim()

  if (!Number.isSafeInteger(purchaseId) || purchaseId <= 0 || !reason) {
    error.value = '购买 ID 和退款原因不能为空'
    return
  }

  const confirmed = await confirmAction({
    title: '确认申请退款',
    message: '将针对购买记录 ' + form.purchaseId + ' 申请退款，相关剩余时长会被冻结。',
    confirmLabel: '提交退款申请',
    tone: 'danger'
  })
  if (!confirmed) return

  busy.value = true
  error.value = ''
  message.value = ''

  try {
    const response = await applyRefund({
      requestId: requestIdFor(purchaseId, reason),
      purchaseId,
      reason
    })

    if (response.data?.code !== 200) {
      throw new Error(response.data?.message || '退款申请失败')
    }

    pendingIntent = ''
    pendingRequestId = ''
    form.purchaseId = ''
    form.reason = ''
    message.value = '退款申请已提交，剩余时长已冻结'
    await load(1)
  } catch (cause) {
    error.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '退款申请失败')
  } finally {
    busy.value = false
  }
}

function openRefund(row) {
  router.push('/app/refunds/' + encodeURIComponent(row.refundNo))
}

onMounted(() => load(1))
</script>

<template>
  <section class="workspace-view operations-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">个人权益</p>
        <h2>我的退款</h2>
      </div>
    </header>

    <p v-if="error" class="alert error">{{ error }}</p>
    <p v-if="message" class="alert success">{{ message }}</p>

    <form class="glass-panel operations-panel operations-form" @submit.prevent="apply">
      <h3>申请退款</h3>
      <div class="operations-form-row">
        <label>
          <span>购买 ID</span>
          <input v-model="form.purchaseId" type="number" min="1" required />
        </label>
        <label>
          <span>退款原因</span>
          <input v-model="form.reason" maxlength="255" required />
        </label>
      </div>
      <button type="submit" :disabled="busy">
        {{ busy ? '提交中...' : '提交退款申请' }}
      </button>
    </form>

    <form class="glass-toolbar operations-toolbar" @submit.prevent="search">
      <label>
        <span>退款状态</span>
        <select v-model="status">
          <option value="">全部状态</option>
          <option v-for="(item, value) in REFUND_STATUSES" :key="value" :value="value">
            {{ item.label }}
          </option>
        </select>
      </label>
      <button type="submit" :disabled="loading">查询</button>
    </form>

    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载退款" />
    <StateBlock v-else-if="loaded && !error && !rows.length" title="暂无退款记录" />

    <section v-if="rows.length" class="glass-panel operations-table-wrap">
      <table class="operations-table billing-table">
        <thead>
          <tr>
            <th>退款号</th>
            <th>订单号</th>
            <th>购买 ID</th>
            <th>状态</th>
            <th>申请金额</th>
            <th>退款金额</th>
            <th>原因</th>
            <th>失败原因</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.refundNo">
            <td>{{ row.refundNo }}</td>
            <td>{{ row.orderNo }}</td>
            <td>{{ row.purchaseId }}</td>
            <td>
              <span :class="['status-pill', 'status-pill--' + resolveRefundStatus(row.status).tone]">
                {{ resolveRefundStatus(row.status).label }}
              </span>
            </td>
            <td>{{ formatMoney(row.requestedAmountCents) }}</td>
            <td>{{ formatMoney(row.refundAmountCents) }}</td>
            <td class="wrap-cell">{{ row.reason }}</td>
            <td class="wrap-cell">{{ row.failureMessage || '-' }}</td>
            <td>
              <button
                class="icon-button"
                type="button"
                title="查看退款详情"
                aria-label="查看退款详情"
                @click="openRefund(row)"
              >
                <Eye :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <AppPagination
      v-if="loaded"
      :current="pager.current"
      :size="pager.size"
      :total="pager.total"
      :busy="loading"
      @change="load"
    />
  </section>
</template>
