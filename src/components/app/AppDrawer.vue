<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  open: Boolean,
  title: { type: String, default: '详情' },
  kicker: { type: String, default: '详情' },
  width: { type: String, default: '600px' },
  closeDisabled: Boolean
})

const emit = defineEmits(['close'])

function close() {
  if (!props.closeDisabled) emit('close')
}

function handleKeydown(event) {
  if (props.open && event.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop app-drawer-backdrop" @click.self="close">
      <aside
        class="drawer-panel glass-panel app-drawer"
        :style="{ '--drawer-width': width }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <header class="app-drawer-header">
          <div>
            <p class="page-kicker">{{ kicker }}</p>
            <h3>{{ title }}</h3>
          </div>
          <button class="icon-button" type="button" :disabled="closeDisabled" title="关闭" aria-label="关闭" @click="close">
            <X :size="18" />
          </button>
        </header>
        <slot />
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.app-drawer-backdrop {
  z-index: 70;
}

.app-drawer {
  width: min(var(--drawer-width), 100%);
  height: 100%;
  padding: 20px;
  background: var(--wm-surface);
}

.app-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.app-drawer-header h3 {
  margin: 0;
  color: var(--wm-text);
  font-size: 19px;
  overflow-wrap: anywhere;
}

@media (max-width: 560px) {
  .app-drawer {
    padding: 16px;
  }
}
</style>
