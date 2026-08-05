<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import NoTenantAccessView from '@/views/account/NoTenantAccessView.vue'

const props = defineProps({
  context: { type: Object, default: null }
})

const route = useRoute()
const hasContext = computed(() => (
  Boolean(props.context?.contextType)
  || route.meta.allowWithoutTenant === true
))
</script>

<template>
  <slot v-if="hasContext" />
  <NoTenantAccessView v-else />
</template>
