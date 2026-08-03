<script setup>
defineProps({
  toasts: {
    type: Array,
    default: () => []
  }
})
</script>

<template>
  <div class="toast-stack" aria-live="polite" aria-atomic="false">
    <article
      v-for="toast in toasts"
      :key="toast.id"
      class="alert-toast glass-panel"
      role="status"
    >
      <span>实时告警</span>
      <strong>{{ toast.title }}</strong>
      <p>{{ toast.text }}</p>
    </article>
  </div>
</template>