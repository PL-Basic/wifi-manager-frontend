<script setup>
defineProps({
  busy: Boolean,
  label: { type: String, default: '数据列表' }
})
</script>

<template>
  <section class="glass-panel app-table-frame" :aria-label="label" :aria-busy="busy">
    <slot />
  </section>
</template>

<style scoped>
.app-table-frame {
  min-width: 0;
  overflow-x: auto;
  border-radius: 8px;
  scrollbar-color: var(--wm-border-strong) transparent;
  scrollbar-gutter: stable;
}
</style>
