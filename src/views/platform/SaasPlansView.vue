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
    if (response.data?.code !== 200) throw new Error(response.data?.message || '服务套餐加载失败')
    plans.value = Array.isArray(response.data.data) ? response.data.data : []
    loaded.value = true
  } catch (cause) {
    if (version === requestVersion) {
      error.value = getApiErrorMessage(cause, '服务套餐加载失败')
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
      <div><p class="page-kicker">系统管理</p><h2>服务套餐</h2></div>
      <button class="secondary-button" type="button" :disabled="loading" @click="load"><RefreshCw :size="16" />刷新</button>
    </header>

    <div class="platform-context-notice" role="status"><ShieldAlert :size="19" aria-hidden="true" /><p><strong>套餐价格和使用额度尚未开放配置。</strong> 当前页面只展示已经登记的套餐。</p></div>
    <p v-if="error" class="alert error" role="alert">{{ error }}</p>
    <StateBlock v-if="loading && !loaded" type="loading" title="正在加载服务套餐" />
    <StateBlock v-else-if="loaded && !error && !plans.length" title="尚未发布服务套餐" text="当前没有可展示的套餐记录。" />

    <section v-if="loaded && plans.length" class="glass-panel platform-table-wrap">
      <table class="platform-table">
        <thead><tr><th>系统编号</th><th>套餐</th><th>状态</th><th>当前版本编号</th><th>资料版本</th><th>创建时间</th><th>更新时间</th></tr></thead>
        <tbody><tr v-for="plan in plans" :key="plan.planId"><td>{{ plan.planId }}</td><td class="platform-name-cell"><strong>{{ plan.name }}</strong><br /><small>{{ plan.planCode }}</small></td><td><span :class="['status-pill', plan.status === 'ACTIVE' ? 'status-pill--success' : 'status-pill--neutral']">{{ plan.status || '-' }}</span></td><td>{{ plan.currentPublishedVersionId || '-' }}</td><td>{{ plan.version ?? '-' }}</td><td>{{ formatTime(plan.createTime) }}</td><td>{{ formatTime(plan.updateTime) }}</td></tr></tbody>
      </table>
    </section>
  </section>
</template>
