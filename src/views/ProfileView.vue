<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  ChevronRight,
  CreditCard,
  KeyRound,
  MapPin,
  ReceiptText,
  RefreshCcw,
  ShoppingBag
} from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import { getMyProfile, updateMyProfile, uploadMyAvatar } from '@/api/account'
import {
  getMyEntitlement,
  getMyUsageLogs,
  getOrders,
  getRefunds
} from '@/api/entitlements'
import { resolveAvatarUrl, validateAvatarFile } from '@/utils/avatar'
import { getStoredUsername, parseTokenPayload, syncSessionUser } from '@/utils/session'
import { getApiErrorMessage } from '@/utils/apiError'
import { resolveOrderStatus, resolveRefundStatus } from '@/config/operationStatus'
import {
  entitlementModeLabel,
  entitlementStatusLabel,
  formatDateTime,
  formatDuration,
  formatMoney
} from '@/utils/billing'
import './operations/operations.css'
import './billing.css'

const profile = reactive({
  userId: '',
  username: getStoredUsername(),
  nickname: '',
  email: '',
  phone: '',
  avatar: ''
})
const account = reactive({
  entitlement: null,
  orders: [],
  usage: [],
  refunds: [],
  orderTotal: 0,
  refundTotal: 0
})
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const profileBusy = computed(() => saving.value || uploading.value)
const message = ref('')
const messageType = ref('success')
const loadError = ref('')
const userId = computed(() => parseTokenPayload()?.sub || '')

function unwrap(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
  return response.data.data
}

function readableError(cause, fallback) {
  return cause instanceof Error && !cause.response
    ? (cause.message || fallback)
    : getApiErrorMessage(cause, fallback)
}

function initials() {
  return (profile.nickname || profile.username || 'U').slice(0, 1).toUpperCase()
}

function avatarSrc(value) {
  return resolveAvatarUrl(value)
}

async function loadData() {
  if (!userId.value || loading.value || profileBusy.value) return
  loading.value = true
  loadError.value = ''

  const results = await Promise.allSettled([
    getMyProfile(userId.value),
    getMyEntitlement(),
    getOrders({ current: 1, size: 4 }),
    getMyUsageLogs({ current: 1, size: 4 }),
    getRefunds({ current: 1, size: 4 })
  ])
  const errors = []

  try {
    const data = results[0].status === 'fulfilled'
      ? unwrap(results[0].value, '个人资料加载失败')
      : (() => { throw results[0].reason })()
    if (data) {
      Object.assign(profile, data)
      syncSessionUser(data)
    }
  } catch (cause) {
    errors.push(readableError(cause, '个人资料加载失败'))
  }

  try {
    account.entitlement = results[1].status === 'fulfilled'
      ? unwrap(results[1].value, '权益加载失败')
      : (() => { throw results[1].reason })()
  } catch (cause) {
    errors.push(readableError(cause, '权益加载失败'))
  }

  const pageTargets = [
    { result: results[2], key: 'orders', totalKey: 'orderTotal', fallback: '订单加载失败' },
    { result: results[3], key: 'usage', fallback: '使用流水加载失败' },
    { result: results[4], key: 'refunds', totalKey: 'refundTotal', fallback: '退款加载失败' }
  ]

  pageTargets.forEach(({ result, key, totalKey, fallback }) => {
    try {
      const data = result.status === 'fulfilled'
        ? (unwrap(result.value, fallback) || {})
        : (() => { throw result.reason })()
      account[key] = Array.isArray(data.records) ? data.records : []
      if (totalKey) account[totalKey] = Number(data.total) || 0
    } catch (cause) {
      errors.push(readableError(cause, fallback))
    }
  })

  loadError.value = Array.from(new Set(errors)).join('；')
  loading.value = false
}

async function saveProfile() {
  if (profileBusy.value || !userId.value) return
  const nickname = String(profile.nickname ?? '').trim()

  if (!nickname || nickname.length > 64) {
    message.value = !nickname ? '昵称不能为空' : '昵称不能超过 64 个字符'
    messageType.value = 'error'
    return
  }

  saving.value = true
  message.value = ''

  try {
    const data = unwrap(await updateMyProfile(userId.value, { nickname }), '昵称保存失败')
    Object.assign(profile, data)
    syncSessionUser(data)
    message.value = '昵称保存成功'
    messageType.value = 'success'
  } catch (error) {
    message.value = readableError(error, '昵称保存失败')
    messageType.value = 'error'
  } finally {
    saving.value = false
  }
}

async function chooseAvatar(event) {
  const file = event.target.files?.[0]
  if (!file || profileBusy.value || !userId.value) {
    event.target.value = ''
    return
  }

  uploading.value = true
  message.value = ''

  try {
    validateAvatarFile(file)
    const data = unwrap(await uploadMyAvatar(userId.value, file), '头像上传失败')
    if (!data?.url) throw new Error('头像上传结果缺少访问地址')
    profile.avatar = data.url
    syncSessionUser({ avatar: profile.avatar })
    message.value = '头像上传成功'
    messageType.value = 'success'
  } catch (error) {
    message.value = readableError(error, '头像上传失败')
    messageType.value = 'error'
  } finally {
    uploading.value = false
    event.target.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <section class="workspace-view profile-workspace billing-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">个人中心</p>
        <h2>{{ profile.nickname || profile.username || '账户总览' }}</h2>
      </div>
      <button class="secondary-button" type="button" :disabled="loading || profileBusy" @click="loadData">
        <RefreshCcw :size="16" />{{ loading ? '刷新中...' : '刷新账户' }}
      </button>
    </header>

    <p v-if="loadError" class="alert error">{{ loadError }}</p>
    <p v-if="message" :class="['alert', messageType]">{{ message }}</p>

    <section class="billing-summary" aria-label="账户权益摘要">
      <article class="billing-metric"><span>剩余网络时长</span><strong>{{ formatDuration(account.entitlement?.remainingSeconds) }}</strong></article>
      <article class="billing-metric"><span>权益模式</span><strong>{{ entitlementModeLabel(account.entitlement?.mode) }}</strong></article>
      <article class="billing-metric"><span>权益状态</span><strong>{{ account.entitlement ? entitlementStatusLabel(account.entitlement.status) : '-' }}</strong></article>
      <article class="billing-metric"><span>订阅到期</span><strong>{{ formatDateTime(account.entitlement?.subscriptionEndTime) }}</strong></article>
    </section>

    <section class="profile-account-layout">
      <form class="profile-panel glass-panel" @submit.prevent="saveProfile">
        <div class="avatar-editor">
          <div class="avatar-preview">
            <img v-if="profile.avatar" :src="avatarSrc(profile.avatar)" alt="当前头像" />
            <span v-else>{{ initials() }}</span>
          </div>
          <div>
            <strong>{{ profile.nickname || profile.username }}</strong>
            <p>{{ profile.username }}</p>
          </div>
        </div>

        <label><span>昵称</span><input v-model="profile.nickname" maxlength="64" :disabled="profileBusy" /></label>
        <label><span>上传头像</span><input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp" :disabled="profileBusy" @change="chooseAvatar" /></label>

        <div class="profile-binding-list">
          <div class="profile-binding-row"><span>用户名</span><strong>{{ profile.username || '-' }}</strong></div>
          <div class="profile-binding-row"><span>邮箱绑定</span><strong>{{ profile.email || '未绑定' }}</strong></div>
          <div class="profile-binding-row"><span>手机绑定</span><strong>{{ profile.phone || '未绑定' }}</strong></div>
        </div>

        <button type="submit" :disabled="profileBusy">{{ saving ? '保存中...' : uploading ? '头像上传中...' : '保存昵称' }}</button>
      </form>

      <article class="glass-panel billing-panel">
        <header class="billing-section-heading"><div><p class="page-kicker">账户服务</p><h3>常用操作</h3></div></header>
        <nav class="billing-link-list" aria-label="账户服务">
          <RouterLink class="billing-link" to="/app/purchase"><span><ShoppingBag :size="18" /><span>购买权益<small>选择固定时长、订阅或自定义金额</small></span></span><ChevronRight :size="18" /></RouterLink>
          <RouterLink class="billing-link" to="/app/entitlements"><span><ReceiptText :size="18" /><span>权益与使用流水<small>查看购买批次和每次时长变化</small></span></span><ChevronRight :size="18" /></RouterLink>
          <RouterLink class="billing-link" to="/app/orders"><span><CreditCard :size="18" /><span>订单记录<small>{{ account.orderTotal }} 笔订单</small></span></span><ChevronRight :size="18" /></RouterLink>
          <RouterLink class="billing-link" to="/app/refunds"><span><RefreshCcw :size="18" /><span>退款记录<small>{{ account.refundTotal }} 笔退款</small></span></span><ChevronRight :size="18" /></RouterLink>
          <RouterLink class="billing-link" to="/app/account-security"><span><KeyRound :size="18" /><span>账户安全<small>管理密码、社交身份和删除申请</small></span></span><ChevronRight :size="18" /></RouterLink>
          <RouterLink class="billing-link" to="/app/location"><span><MapPin :size="18" /><span>我的定位<small>查看个人定位授权和历史</small></span></span><ChevronRight :size="18" /></RouterLink>
        </nav>
      </article>
    </section>

    <section class="billing-records" aria-label="账户近期记录">
      <article class="glass-panel billing-panel">
        <header class="billing-section-heading"><div><h3>近期订单</h3><p>最近 {{ account.orders.length }} 条</p></div><RouterLink to="/app/orders">全部订单</RouterLink></header>
        <ul v-if="account.orders.length" class="billing-record-list">
          <li v-for="row in account.orders" :key="row.orderNo" class="billing-record-row">
            <strong>{{ row.orderType === 'REWARD' ? '超级管理员奖励' : row.productCode }}</strong><span>{{ formatMoney(row.amountCents) }} · {{ resolveOrderStatus(row.status).label }}</span><small>{{ formatDateTime(row.createTime) }}</small>
          </li>
        </ul>
        <StateBlock v-else title="暂无订单" />
      </article>

      <article class="glass-panel billing-panel">
        <header class="billing-section-heading"><div><h3>近期使用</h3><p>时长变化流水</p></div><RouterLink to="/app/entitlements">全部流水</RouterLink></header>
        <ul v-if="account.usage.length" class="billing-record-list">
          <li v-for="row in account.usage" :key="row.id" class="billing-record-row">
            <strong>{{ row.reason || '权益变动' }}</strong><span>{{ row.changeSeconds > 0 ? '+' : '' }}{{ formatDuration(row.changeSeconds) }}</span><small>{{ formatDateTime(row.createTime) }}</small>
          </li>
        </ul>
        <StateBlock v-else title="暂无使用流水" />
      </article>

      <article class="glass-panel billing-panel">
        <header class="billing-section-heading"><div><h3>近期退款</h3><p>申请和处理状态</p></div><RouterLink to="/app/refunds">全部退款</RouterLink></header>
        <ul v-if="account.refunds.length" class="billing-record-list">
          <li v-for="row in account.refunds" :key="row.refundNo" class="billing-record-row">
            <strong>{{ row.refundNo }}</strong><span>{{ formatMoney(row.requestedAmountCents) }} · {{ resolveRefundStatus(row.status).label }}</span><small>{{ formatDateTime(row.createTime) }}</small>
          </li>
        </ul>
        <StateBlock v-else title="暂无退款记录" />
      </article>
    </section>
  </section>
</template>
