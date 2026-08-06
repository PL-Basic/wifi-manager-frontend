<script setup>
import { Building2, RefreshCw } from 'lucide-vue-next'

function reload() {
  window.location.reload()
}
</script>

<template>
  <section class="workspace-view no-tenant-view">
    <Building2 :size="34" aria-hidden="true" />
    <div>
      <h2>当前没有可用工作区</h2>
      <p>账号尚未获得有效租户上下文，或者租户状态已经变化。</p>
    </div>
    <button class="secondary-button" type="button" @click="reload">
      <RefreshCw :size="16" />
      重新检查
    </button>
  </section>
</template>

<style scoped>
.no-tenant-view { min-height: 280px; display: grid; place-items: center; align-content: center; gap: 14px; text-align: center; }
.no-tenant-view > svg { color: #70c7bb; }
.no-tenant-view h2, .no-tenant-view p { margin: 0; }
.no-tenant-view p { margin-top: 6px; color: var(--wm-text-soft); }
</style>
