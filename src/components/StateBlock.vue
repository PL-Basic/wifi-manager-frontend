<script setup>
defineProps({
  type: {
    type: String,
    default: 'empty'
  },
  title: {
    type: String,
    default: '暂无数据'
  },
  text: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <div :class="['state-block', `state-block--${type}`]">
    <div class="state-mark"></div>
    <strong>{{ title }}</strong>
    <p v-if="text">{{ text }}</p>
  </div>
</template>
