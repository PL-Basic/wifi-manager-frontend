<script setup>
import { computed } from 'vue'
import { Router, X } from 'lucide-vue-next'
import { getNavigationGroups } from '@/config/navigation'
import { ROLE_USER } from '@/utils/access'

const props = defineProps({
  role: {
    type: Number,
    default: ROLE_USER
  },
  open: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const groups = computed(() => getNavigationGroups(props.role))
</script>

<template>
  <aside :class="['app-sidebar', { open }]">
    <header class="app-sidebar-brand">
      <Router :size="24" aria-hidden="true" />
      <div>
        <span>Wifi Manager</span>
        <strong>网络控制台</strong>
      </div>

      <button
        class="icon-button app-sidebar-close"
        type="button"
        title="关闭导航"
        aria-label="关闭导航"
        @click="emit('close')"
      >
        <X :size="20" />
      </button>
    </header>

    <nav class="app-navigation" aria-label="主导航">
      <section v-for="group in groups" :key="group.key" class="app-nav-group">
        <h3>{{ group.label }}</h3>

        <RouterLink
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          active-class="active"
          @click="emit('close')"
        >
          <component :is="item.icon" :size="18" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </section>
    </nav>
  </aside>
</template>