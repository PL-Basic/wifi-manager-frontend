<script setup>
import { computed, onMounted, ref } from 'vue'
import { Check, Clock3, RefreshCw, ShoppingCart } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import { createOrder, getMyEntitlement, getProducts } from '@/api/entitlements'
import { getApiErrorMessage } from '@/utils/apiError'
import {
  entitlementModeLabel,
  formatDuration,
  formatMoney
} from '@/utils/billing'
import './billing.css'

const router = useRouter()
const products = ref([])
const entitlement = ref(null)
const selectedCode = ref('')
const customAmountYuan = ref('10')
const loading = ref(false)
const creating = ref(false)
const productError = ref('')
const entitlementError = ref('')
const actionError = ref('')
const pendingRequests = new Map()

const selectedProduct = computed(() => (
  products.value.find((item) => item.productCode === selectedCode.value) || null
))

const selectedAmountCents = computed(() => {
  if (!selectedProduct.value?.customAmountAllowed) {
    return Number(selectedProduct.value?.amountCents)
  }

  const yuan = Number(customAmountYuan.value)
  return Number.isFinite(yuan) ? Math.round(yuan * 100) : 0
})

const selectedGrantSeconds = computed(() => {
  if (!selectedProduct.value?.customAmountAllowed) {
    return Number(selectedProduct.value?.grantSeconds)
  }

  return selectedAmountCents.value * Number(selectedProduct.value?.secondsPerCent || 0)
})

function unwrap(response, fallback) {
  if (response.data?.code !== 200) throw new Error(response.data?.message || fallback)
  return response.data.data
}

function selectProduct(product) {
  selectedCode.value = product.productCode
  actionError.value = ''
}

function newRequestId(intent) {
  return `ORDER-${Date.now()}-${Math.random().toString(16).slice(2, 10)}-${intent}`.slice(0, 64)
}

function validateSelection() {
  const product = selectedProduct.value
  if (!product) return '请选择要购买的上网服务'
  if (!product.customAmountAllowed) return ''

  const amount = selectedAmountCents.value
  const min = Number(product.minAmountCents)
  const max = Number(product.maxAmountCents)

  if (!Number.isSafeInteger(amount) || amount < min || amount > max) {
    return `自定义金额应在 ${formatMoney(min)} 到 ${formatMoney(max)} 之间`
  }

  return ''
}

async function load() {
  loading.value = true
  productError.value = ''
  entitlementError.value = ''

  const [productResult, entitlementResult] = await Promise.allSettled([
    getProducts(),
    getMyEntitlement()
  ])

  if (productResult.status === 'fulfilled') {
    try {
      const data = unwrap(productResult.value, '商品加载失败')
      products.value = Array.isArray(data) ? data : []
      if (!products.value.some((item) => item.productCode === selectedCode.value)) {
        selectedCode.value = products.value[0]?.productCode || ''
      }
    } catch (cause) {
      productError.value = cause.message
    }
  } else {
    productError.value = getApiErrorMessage(productResult.reason, '商品加载失败')
  }

  if (entitlementResult.status === 'fulfilled') {
    try {
      entitlement.value = unwrap(entitlementResult.value, '当前上网服务加载失败')
    } catch (cause) {
      entitlementError.value = cause.message
    }
  } else {
    entitlementError.value = getApiErrorMessage(entitlementResult.reason, '当前上网服务加载失败')
  }

  loading.value = false
}

async function submitOrder() {
  const validationMessage = validateSelection()
  if (validationMessage) {
    actionError.value = validationMessage
    return
  }

  const product = selectedProduct.value
  const intent = `${product.productCode}:${selectedAmountCents.value}`
  const requestId = pendingRequests.get(intent) || newRequestId(intent)
  pendingRequests.set(intent, requestId)

  creating.value = true
  actionError.value = ''

  try {
    const payload = {
      clientRequestId: requestId,
      productCode: product.productCode
    }

    if (product.customAmountAllowed) {
      payload.customAmountCents = selectedAmountCents.value
    }

    const order = unwrap(await createOrder(payload), '订单创建失败')
    pendingRequests.delete(intent)
    await router.push(`/app/orders/${encodeURIComponent(order.orderNo)}`)
  } catch (cause) {
    actionError.value = cause instanceof Error && !cause.response
      ? cause.message
      : getApiErrorMessage(cause, '订单创建失败')
  } finally {
    creating.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="workspace-view billing-page">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">网络服务</p>
        <h2>购买上网时长</h2>
      </div>
      <button class="secondary-button" type="button" :disabled="loading" @click="load">
        <RefreshCw :size="16" />
        {{ loading ? '刷新中...' : '刷新商品' }}
      </button>
    </header>

    <p v-if="productError" class="alert error">{{ productError }}</p>
    <p v-if="entitlementError" class="alert warning">{{ entitlementError }}</p>
    <p v-if="actionError" class="alert error">{{ actionError }}</p>

    <section v-if="entitlement" class="billing-summary" aria-label="当前上网服务摘要">
      <article class="billing-metric">
        <span>当前模式</span>
        <strong>{{ entitlementModeLabel(entitlement.mode) }}</strong>
      </article>
      <article class="billing-metric">
        <span>剩余时长</span>
        <strong>{{ formatDuration(entitlement.remainingSeconds) }}</strong>
      </article>
      <article class="billing-metric">
        <span>服务状态</span>
        <strong>{{ Number(entitlement.status) === 1 ? '可用' : '停用' }}</strong>
      </article>
      <article class="billing-metric">
        <span>订阅到期</span>
        <strong>{{ entitlement.subscriptionEndTime ? String(entitlement.subscriptionEndTime).replace('T', ' ') : '-' }}</strong>
      </article>
    </section>

    <StateBlock v-if="loading && !products.length" type="loading" title="正在加载可购买服务" />
    <StateBlock v-else-if="!loading && !productError && !products.length" title="暂无可购买商品" />

    <section v-if="products.length" class="billing-purchase-layout">
      <div>
        <header class="billing-section-heading">
          <div>
            <h3>可购买服务</h3>
            <p>页面显示的价格、时长和可用状态就是实际下单内容。</p>
          </div>
        </header>

        <div class="billing-products">
          <article
            v-for="product in products"
            :key="product.productCode"
            :class="['billing-product-card', { 'billing-product-card--selected': selectedCode === product.productCode }]"
          >
            <div>
              <h3>{{ product.name }}</h3>
              <p>{{ entitlementModeLabel(product.entitlementMode) }}</p>
              <p v-if="!product.customAmountAllowed">
                <Clock3 :size="15" aria-hidden="true" />
                {{ formatDuration(product.grantSeconds) }}
              </p>
              <p v-else>按 ¥1 = 1 小时计算</p>
            </div>
            <strong>{{ product.customAmountAllowed ? '自定义金额' : formatMoney(product.amountCents) }}</strong>
            <button
              :class="selectedCode === product.productCode ? '' : 'secondary-button'"
              type="button"
              :aria-pressed="selectedCode === product.productCode"
              @click="selectProduct(product)"
            >
              <Check v-if="selectedCode === product.productCode" :size="16" />
              {{ selectedCode === product.productCode ? '已选择' : '选择' }}
            </button>
          </article>
        </div>
      </div>

      <aside class="glass-panel billing-checkout">
        <p class="page-kicker">订单确认</p>
        <h3>{{ selectedProduct?.name || '请选择商品' }}</h3>

        <label v-if="selectedProduct?.customAmountAllowed" class="billing-custom-input">
          <span>充值金额（元）</span>
          <input v-model="customAmountYuan" type="number" min="1" max="1000" step="0.01" />
          <small>{{ formatMoney(selectedProduct.minAmountCents) }} - {{ formatMoney(selectedProduct.maxAmountCents) }}</small>
          <span class="billing-custom-presets">
            <button v-for="amount in [10, 50, 100]" :key="amount" class="secondary-button compact-button" type="button" @click="customAmountYuan = String(amount)">
              ¥{{ amount }}
            </button>
          </span>
        </label>

        <dl class="operations-detail">
          <dt>服务类型</dt><dd>{{ entitlementModeLabel(selectedProduct?.entitlementMode) }}</dd>
          <dt>获得时长</dt><dd>{{ formatDuration(selectedGrantSeconds) }}</dd>
          <dt>应付金额</dt><dd>{{ formatMoney(selectedAmountCents) }}</dd>
        </dl>

        <button type="button" :disabled="creating || !selectedProduct" @click="submitOrder">
          <ShoppingCart :size="16" />
          {{ creating ? '创建中...' : '创建订单' }}
        </button>
      </aside>
    </section>
  </section>
</template>
