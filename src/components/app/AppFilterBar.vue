<script setup>
defineEmits(['submit'])
</script>

<template>
  <form class="glass-toolbar app-filter-bar" @submit.prevent="$emit('submit')">
    <slot />
  </form>
</template>
