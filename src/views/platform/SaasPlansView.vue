<script setup>
import { onMounted, ref } from 'vue'
import { RefreshCw, ShieldAlert } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import { getPlatformSaasPlans } from '@/api/tenants'
import { getApiErrorMessage } from '@/utils/apiError'
import './platform.css'

const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const plans = ref([])
let requestVersion = 0

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

async function load() {
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const response = await getPlatformSaasPlans()
    if (version !== requestVersion) return
    if (response.data?.code !== 200) throw new Error(response.data?.message || 'SaaS 套餐加载失败')
    plans.value = Array.isArray(response.data.data) ? response.data.data : []
    loaded.value = true
  } catch (cause) {
    if (version === requestVersion) {
      error.value = cause instanceof Error && !cause.response ? cause.message : getApiErrorMessage(cause, 'SaaS 套餐加载失败')
      loaded.value = true
    }
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="workspace-view platform-page">
    <header class="dashboard-header">
      <div><p class="page-kicker">平台治理</p><h2>SaaS 套餐</h2></div>
      <button class="secondary-button" type="button" :disabled="loading" @click="load"><RefreshCw :size="16" />刷新</button>
    </header>

    <div class="platform-context-notice" role="status"><ShieldAlert :size="19" aria-hidden="true" /><p><strong>租户上下文迁移尚未启用。</strong> 套餐定价与配额尚未发布，当前仅展示 tenant-service 已存在的套餐身份。</p></div>
    <p v-if="error" class="alert error" role="alert">{{ error }}</p>
    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载 SaaS 套餐" />
    <StateBlock v-else-if="loaded && !error && !plans.length" title="尚未发布 SaaS 套餐" text="tenant-service 当前返回 0 条套餐记录。" />

    <section v-if="loaded && plans.length" class="glass-panel platform-table-wrap">
      <table class="platform-table">
        <thead><tr><th>套餐 ID</th><th>套餐</th><th>状态</th><th>当前发布版本</th><th>记录版本</th><th>创建时间</th><th>更新时间</th></tr></thead>
        <tbody><tr v-for="plan in plans" :key="plan.planId"><td>{{ plan.planId }}</td><td class="platform-name-cell"><strong>{{ plan.name }}</strong><br /><small>{{ plan.planCode }}</small></td><td><span :class="['status-pill', plan.status === 'ACTIVE' ? 'status-pill--success' : 'status-pill--neutral']">{{ plan.status || '-' }}</span></td><td>{{ plan.currentPublishedVersionId || '-' }}</td><td>{{ plan.version ?? '-' }}</td><td>{{ formatTime(plan.createTime) }}</td><td>{{ formatTime(plan.updateTime) }}</td></tr></tbody>
      </table>
    </section>
  </section>
</template>
