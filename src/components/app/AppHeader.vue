<script setup>
import { Menu } from 'lucide-vue-next'
import Breadcrumbs from '@/components/app/Breadcrumbs.vue'
import ConnectionStatus from '@/components/app/ConnectionStatus.vue'
import AccountMenu from '@/components/app/AccountMenu.vue'
import TenantSwitcher from '@/components/app/TenantSwitcher.vue'

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
  username: { type: String, default: '' },
  avatar: { type: String, default: '' },
  currentUserId: { type: String, default: '' },
  accounts: { type: Array, default: () => [] },
  connectionState: { type: String, default: 'idle' },
  reconnectAttempt: { type: Number, default: 0 },
  apiStatus: { type: String, default: 'unknown' },
  apiMessage: { type: String, default: '' },
  logoutBusy: { type: Boolean, default: false },
  role: { type: Number, required: true },
  tenantContext: { type: Object, default: null },
  contextBusy: { type: Boolean, default: false }
})

const emit = defineEmits([
  'toggle-menu',
  'logout',
  'switch-account',
  'forget-account',
  'retry-alert-socket',
  'retry-api',
  'switch-tenant',
  'enter-platform-tenant',
  'return-platform'
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
      <TenantSwitcher
        :role="role"
        :context="tenantContext"
        :busy="contextBusy"
        @switch-tenant="emit('switch-tenant', $event)"
        @enter-platform-tenant="emit('enter-platform-tenant', $event)"
        @return-platform="emit('return-platform')"
      />
      <ConnectionStatus
        :socket-status="connectionState"
        :socket-attempt="reconnectAttempt"
        :api-status="apiStatus"
        :api-message="apiMessage"
        @retry-socket="emit('retry-alert-socket')"
        @retry-api="emit('retry-api')"
      />
      <AccountMenu
        :display-name="displayName"
        :username="username"
        :role-label="roleLabel"
        :avatar="avatar"
        :current-user-id="currentUserId"
        :accounts="accounts"
        :busy="logoutBusy"
        :tenant-context="tenantContext"
        @logout="emit('logout')"
        @switch-account="emit('switch-account', $event)"
        @forget-account="emit('forget-account', $event)"
      />
    </div>
  </header>
</template>
