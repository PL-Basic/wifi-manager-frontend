<script setup>
import AppDrawer from '@/components/app/AppDrawer.vue'

defineProps({
  open: Boolean,
  record: { type: Object, default: null }
})

const emit = defineEmits(['close'])

function formatTime(value) {
  return value ? String(value).replace('T', ' ') : '-'
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
</script>

<template>
  <AppDrawer v-if="record" :open="open" :title="`记录 ${record.id}`" kicker="流量详情" width="600px" @close="emit('close')">
        <dl class="traffic-detail-list">
          <dt>事件 ID</dt><dd>{{ record.eventId || '-' }}</dd>
          <dt>节点 ID</dt><dd>{{ record.nodeId ?? '-' }}</dd>
          <dt>设备编码</dt><dd>{{ record.deviceCode || '-' }}</dd>
          <dt>Session ID</dt><dd>{{ record.sessionId ?? '-' }}</dd>
          <dt>MAC</dt><dd>{{ record.mac || '-' }}</dd>
          <dt>目标 IP</dt><dd>{{ record.dstIp || '-' }}</dd>
          <dt>目标端口</dt><dd>{{ record.dstPort ?? '-' }}</dd>
          <dt>SNI</dt><dd>{{ record.sni || '-' }}</dd>
          <dt>协议</dt><dd>{{ record.protocol || '-' }}</dd>
          <dt>上行流量</dt><dd>{{ formatBytes(record.bytesUp) }}</dd>
          <dt>下行流量</dt><dd>{{ formatBytes(record.bytesDown) }}</dd>
          <dt>记录时间</dt><dd>{{ formatTime(record.logTime) }}</dd>
        </dl>
  </AppDrawer>
</template>

<style scoped>
.traffic-detail-list {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  margin: 18px 0 0;
}

.traffic-detail-list dt,
.traffic-detail-list dd {
  margin: 0;
  padding: 10px 0;
  border-bottom: 1px solid var(--wm-border);
}

.traffic-detail-list dt {
  color: var(--wm-muted);
}

.traffic-detail-list dd {
  overflow-wrap: anywhere;
  color: var(--wm-text-soft);
}

@media (max-width: 560px) {
  .traffic-detail-list {
    grid-template-columns: 1fr;
  }

  .traffic-detail-list dt {
    padding-bottom: 2px;
    border-bottom: 0;
  }
}
</style>
