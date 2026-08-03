<script setup>
import { computed } from 'vue'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps({
  current: { type: Number, default: 1 },
  size: { type: Number, default: 10 },
  total: { type: Number, default: 0 },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['change'])
const pages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.size))))

function go(page) {
  const target = Math.min(pages.value, Math.max(1, Number(page) || 1))
  if (!props.busy && target !== props.current) emit('change', target)
}
</script>

<template>
  <nav v-if="total > 0" class="pager app-pagination" aria-label="分页导航">
    <span>第 {{ current }} / {{ pages }} 页，共 {{ total }} 条</span>
    <div class="app-pagination-actions">
      <button class="icon-button" type="button" title="第一页" :disabled="busy || current <= 1" @click="go(1)">
        <ChevronFirst :size="16" />
      </button>
      <button class="icon-button" type="button" title="上一页" :disabled="busy || current <= 1" @click="go(current - 1)">
        <ChevronLeft :size="16" />
      </button>
      <button class="icon-button" type="button" title="下一页" :disabled="busy || current >= pages" @click="go(current + 1)">
        <ChevronRight :size="16" />
      </button>
      <button class="icon-button" type="button" title="最后一页" :disabled="busy || current >= pages" @click="go(pages)">
        <ChevronLast :size="16" />
      </button>
    </div>
  </nav>
</template>
