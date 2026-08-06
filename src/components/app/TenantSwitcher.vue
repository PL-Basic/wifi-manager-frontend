<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Building2, Check, ChevronDown, RotateCcw, ShieldCheck, X } from 'lucide-vue-next'
import { getMyTenants, getPlatformTenants } from '@/api/tenants'
import { ROLE_SUPER_ADMIN } from '@/utils/access'
import { getApiErrorMessage } from '@/utils/apiError'
import {
  CONTEXT_PLATFORM,
  CONTEXT_PLATFORM_TENANT
} from '@/utils/tenant'

const props = defineProps({
  role: { type: Number, required: true },
  context: { type: Object, default: null },
  busy: Boolean
})

const emit = defineEmits(['switch-tenant', 'enter-platform-tenant', 'return-platform'])
const root = ref(null)
const trigger = ref(null)
const open = ref(false)
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const tenants = ref([])
const managedTarget = ref(null)
const reason = ref('')
const reasonError = ref('')

const isSuperAdmin = computed(() => props.role === ROLE_SUPER_ADMIN)
const isPlatform = computed(() => props.context?.contextType === CONTEXT_PLATFORM)
const isManaged = computed(() => props.context?.contextType === CONTEXT_PLATFORM_TENANT)
const contextLabel = computed(() => {
  if (isPlatform.value) return '平台工作区'
  return props.context?.tenantName || props.context?.tenantCode || '租户工作区'
})
const contextMeta = computed(() => {
  if (isPlatform.value) return '平台上下文'

  const mode = isManaged.value ? '平台代管' : '当前租户'
  return props.context?.tenantCode
    ? `${mode} · ${props.context.tenantCode}`
    : mode
})

function isTenantUnavailable(tenant) {
  return String(tenant?.status || tenant?.tenantStatus || '').toUpperCase() !== 'ACTIVE'
}

async function loadTenants() {
  if (loading.value) return
  if (isManaged.value) {
    tenants.value = []
    loaded.value = true
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = isSuperAdmin.value
      ? await getPlatformTenants({ current: 1, size: 100 })
      : await getMyTenants()
    const data = response.data?.data
    tenants.value = isSuperAdmin.value
      ? (Array.isArray(data?.records) ? data.records : [])
      : (Array.isArray(data) ? data : [])
    loaded.value = true
  } catch (cause) {
    error.value = getApiErrorMessage(cause, '租户列表加载失败')
    loaded.value = true
  } finally {
    loading.value = false
  }
}

async function toggle() {
  if (props.busy) return
  open.value = !open.value
  if (open.value) {
    await loadTenants()
    await nextTick()
    root.value?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
  }
}

function choose(tenant) {
  if (isTenantUnavailable(tenant)) return
  if (String(tenant.tenantId) === String(props.context?.tenantId)) return
  if (isSuperAdmin.value) {
    managedTarget.value = tenant
    reason.value = ''
    reasonError.value = ''
    open.value = false
    return
  }
  open.value = false
  emit('switch-tenant', tenant)
}

function submitManagedContext() {
  const normalized = reason.value.trim()
  if (!normalized) {
    reasonError.value = '请输入进入租户的原因'
    return
  }
  if (normalized.length > 255) {
    reasonError.value = '进入原因不能超过 255 个字符'
    return
  }
  emit('enter-platform-tenant', { tenant: managedTarget.value, reason: normalized })
}

function closeReasonDialog() {
  if (props.busy) return
  managedTarget.value = null
  reason.value = ''
  reasonError.value = ''
}

function handleDocumentPointer(event) {
  if (open.value && root.value && !root.value.contains(event.target)) open.value = false
}

function handleKeydown(event) {
  if (event.key !== 'Escape') return
  if (managedTarget.value) closeReasonDialog()
  else if (open.value) {
    open.value = false
    nextTick(() => trigger.value?.focus())
  }
}

watch(
  () => `${props.context?.contextType || ''}:${props.context?.tenantId || ''}`,
  () => {
    open.value = false
    managedTarget.value = null
    reason.value = ''
    reasonError.value = ''
    loaded.value = false
    tenants.value = []
  }
)

document.addEventListener('pointerdown', handleDocumentPointer)
window.addEventListener('keydown', handleKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointer)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="tenant-switcher">
    <button ref="trigger" class="tenant-switcher__trigger" type="button" :disabled="busy" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
      <ShieldCheck v-if="isPlatform" :size="17" />
      <Building2 v-else :size="17" />
      <span><small>{{ contextMeta }}</small><strong>{{ contextLabel }}</strong></span>
      <ChevronDown :size="15" />
    </button>

    <div v-if="open" class="tenant-switcher__menu" role="menu">
      <header><strong>切换工作区</strong><button class="icon-button" type="button" title="关闭" aria-label="关闭" @click="open = false"><X :size="16" /></button></header>
      <p v-if="error" class="tenant-switcher__error">{{ error }}</p>
      <p v-else-if="loading" class="tenant-switcher__state">正在加载租户...</p>
      <p v-else-if="loaded && !tenants.length" class="tenant-switcher__state">没有其他可用租户</p>
      <button v-for="tenant in tenants" :key="tenant.tenantId" type="button" role="menuitem" :disabled="busy || isTenantUnavailable(tenant) || String(tenant.tenantId) === String(context?.tenantId)" @click="choose(tenant)">
        <Building2 :size="16" /><span><strong>{{ tenant.name || tenant.tenantName }}</strong><small>{{ tenant.tenantCode }}</small></span>
        <Check v-if="String(tenant.tenantId) === String(context?.tenantId)" :size="15" />
      </button>
      <button v-if="isManaged" class="tenant-switcher__return" type="button" role="menuitem" :disabled="busy" @click="open = false; emit('return-platform')">
        <RotateCcw :size="16" /><span><strong>返回平台工作区</strong><small>结束当前租户代管上下文</small></span>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="managedTarget" class="tenant-reason-backdrop" @click.self="closeReasonDialog">
      <section class="tenant-reason-dialog" role="dialog" aria-modal="true" aria-labelledby="tenant-reason-title">
        <header><div><p>平台代管</p><h3 id="tenant-reason-title">进入 {{ managedTarget.name }}</h3></div><button class="icon-button" type="button" :disabled="busy" title="关闭" aria-label="关闭" @click="closeReasonDialog"><X :size="18" /></button></header>
        <p>该操作会写入审计，并让所有标签页切换到目标租户。</p>
        <p v-if="reasonError" class="alert error">{{ reasonError }}</p>
        <label><span>进入原因</span><textarea v-model="reason" maxlength="255" rows="3" :disabled="busy" placeholder="说明本次代管操作目的"></textarea></label>
        <footer><button class="secondary-button" type="button" :disabled="busy" @click="closeReasonDialog">取消</button><button type="button" :disabled="busy" @click="submitManagedContext">{{ busy ? '正在切换...' : '确认进入' }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tenant-switcher { position: relative; min-width: 0; }
.tenant-switcher__trigger { min-width: 190px; max-width: 280px; min-height: 42px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 5px 9px; color: var(--wm-text); background: var(--wm-bg-soft); border: 1px solid var(--wm-border); border-radius: 7px; box-shadow: none; text-align: left; }
.tenant-switcher__trigger > span, .tenant-switcher__menu button > span { min-width: 0; display: grid; }
.tenant-switcher__trigger small, .tenant-switcher__trigger strong, .tenant-switcher__menu small, .tenant-switcher__menu strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tenant-switcher__trigger small, .tenant-switcher__menu small { color: var(--wm-muted); font-size: 11px; }
.tenant-switcher__trigger strong { font-size: 13px; }
.tenant-switcher__menu { position: absolute; z-index: 95; top: calc(100% + 8px); right: 0; width: min(340px, calc(100vw - 24px)); max-height: min(520px, calc(100vh - 90px)); overflow-y: auto; padding: 8px; border: 1px solid var(--wm-border); border-radius: 8px; background: var(--wm-surface); box-shadow: 0 18px 48px rgba(0, 0, 0, .3); }
.tenant-switcher__menu header { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 8px; }
.tenant-switcher__menu > button { width: 100%; min-height: 46px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 8px; color: var(--wm-text-soft); background: transparent; border: 1px solid transparent; border-radius: 6px; box-shadow: none; text-align: left; }
.tenant-switcher__menu > button:hover:not(:disabled) { color: var(--wm-text); border-color: var(--wm-border); background: var(--wm-bg-soft); }
.tenant-switcher__return { margin-top: 6px; border-top-color: var(--wm-border) !important; }
.tenant-switcher__state, .tenant-switcher__error { margin: 8px; color: var(--wm-muted); font-size: 13px; }
.tenant-switcher__error { color: var(--wm-danger); }
.tenant-reason-backdrop { position: fixed; z-index: 130; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(4, 10, 12, .72); }
.tenant-reason-dialog { width: min(500px, 100%); padding: 20px; border: 1px solid var(--wm-border); border-radius: 8px; color: var(--wm-text); background: var(--wm-surface); box-shadow: 0 24px 72px rgba(0, 0, 0, .36); }
.tenant-reason-dialog header, .tenant-reason-dialog footer { display: flex; justify-content: space-between; gap: 10px; }
.tenant-reason-dialog header p, .tenant-reason-dialog header h3 { margin: 0; }
.tenant-reason-dialog header p { color: #70c7bb; font-size: 12px; font-weight: 800; }
.tenant-reason-dialog > p { color: var(--wm-text-soft); }
.tenant-reason-dialog label { display: grid; gap: 7px; }
.tenant-reason-dialog footer { justify-content: flex-end; margin-top: 16px; }
@media (max-width: 760px) { .tenant-switcher__trigger { min-width: 44px; width: 44px; grid-template-columns: 1fr; place-items: center; } .tenant-switcher__trigger > span, .tenant-switcher__trigger > svg:last-child { display: none; } }
</style>
