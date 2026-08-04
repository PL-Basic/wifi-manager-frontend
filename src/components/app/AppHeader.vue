<script setup>
import { LogOut, Menu } from 'lucide-vue-next'
import Breadcrumbs from '@/components/app/Breadcrumbs.vue'
import ConnectionStatus from '@/components/app/ConnectionStatus.vue'

defineProps({
  displayName: {
    type: String,
    default: ''
  },
  roleLabel: {
    type: String,
    default: ''
  },
  menuOpen: {
    type: Boolean,
    default: false
  },
  connectionState: { type: String, default: 'idle' },
  reconnectAttempt: { type: Number, default: 0 },
  apiStatus: { type: String, default: 'unknown' },
  apiMessage: { type: String, default: '' },
  logoutBusy: { type: Boolean, default: false }
})

const emit = defineEmits([
  'toggle-menu',
  'logout',
  'retry-alert-socket',
  'retry-api'
])
</script>

<template>
  <header class="app-header">
    <button
      class="icon-button app-menu-button"
      type="button"
      title="打开导航"
      aria-label="打开导航"
      :aria-expanded="menuOpen"
      @click="emit('toggle-menu')"
    >
      <Menu :size="20" />
    </button>

    <div class="app-header-context">
      <Breadcrumbs />
      <h2>{{ $route.meta.title || 'Wifi Manager' }}</h2>
    </div>

    <div class="app-user-summary">
      <ConnectionStatus
        :socket-status="connectionState"
        :socket-attempt="reconnectAttempt"
        :api-status="apiStatus"
        :api-message="apiMessage"
        @retry-socket="emit('retry-alert-socket')"
        @retry-api="emit('retry-api')"
      />
      <div class="app-user-identity">
        <strong>{{ displayName || '当前用户' }}</strong>
        <span>{{ roleLabel }}</span>
      </div>

      <button
        class="icon-button"
        type="button"
        title="退出登录"
        aria-label="退出登录"
        :disabled="logoutBusy"
        @click="emit('logout')"
      >
        <LogOut :size="19" />
      </button>
    </div>
  </header>
</template>
