<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

const route = useRoute()

// 每个业务路由通过 meta.breadcrumbs 提供层级名称。
const items = computed(() => {
  const breadcrumbs = route.meta.breadcrumbs
  return Array.isArray(breadcrumbs) ? breadcrumbs : []
})
</script>

<template>
  <nav v-if="items.length" class="app-breadcrumbs" aria-label="面包屑">
    <ol>
      <li v-for="(item, index) in items" :key="`${item}-${index}`">
        <ChevronRight v-if="index > 0" :size="14" aria-hidden="true" />
        <span :aria-current="index === items.length - 1 ? 'page' : undefined">
          {{ item }}
        </span>
      </li>
    </ol>
  </nav>
</template>