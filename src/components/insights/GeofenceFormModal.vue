<script setup>
import { reactive, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  open: Boolean,
  fence: {
    type: Object,
    default: null
  },
  loading: Boolean,
  error: {
    type: String,
    default: ''
  },
  success: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'save'])

const form = reactive({
  name: '',
  centerLatitude: '',
  centerLongitude: '',
  radiusMeters: 50,
  enabled: 1,
  description: ''
})
const validationError = reactive({ message: '' })

function resetForm() {
  Object.assign(form, {
    name: props.fence?.name || '',
    centerLatitude: props.fence?.centerLatitude ?? '',
    centerLongitude: props.fence?.centerLongitude ?? '',
    radiusMeters: props.fence?.radiusMeters ?? 50,
    enabled: props.fence?.enabled ?? 1,
    description: props.fence?.description || ''
  })
  validationError.message = ''
}

function validate() {
  const latitude = Number(form.centerLatitude)
  const longitude = Number(form.centerLongitude)
  const radius = Number(form.radiusMeters)

  if (!form.name.trim()) return '围栏名称不能为空'
  if (form.name.trim().length > 64) return '围栏名称不能超过 64 个字符'
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return '纬度必须在 -90 到 90 之间'
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return '经度必须在 -180 到 180 之间'
  if (!Number.isFinite(radius) || radius < 5 || radius > 10000) return '围栏半径必须在 5 到 10000 米之间'
  if (decimalPlaces(form.centerLatitude) > 7 || decimalPlaces(form.centerLongitude) > 7) return '围栏经纬度最多保留 7 位小数'
  if (decimalPlaces(form.radiusMeters) > 2) return '围栏半径最多保留 2 位小数'
  if (form.description.length > 255) return '围栏描述不能超过 255 个字符'
  return ''
}

function decimalPlaces(value) {
  const text = String(value)
  if (/e/i.test(text)) {
    const number = Number(value)
    if (!Number.isFinite(number)) return Number.POSITIVE_INFINITY
    return Math.max(0, (text.split('e-')[1] || '').length ? Number(text.split('e-')[1]) : 0)
  }
  return text.includes('.') ? text.split('.')[1].length : 0
}

function submit() {
  const message = validate()
  validationError.message = message
  if (message) return

  emit('save', {
    name: form.name.trim(),
    centerLatitude: Number(form.centerLatitude),
    centerLongitude: Number(form.centerLongitude),
    radiusMeters: Number(form.radiusMeters),
    enabled: Number(form.enabled),
    description: form.description.trim() || null
  })
}

function close() {
  if (!props.loading) emit('close')
}

watch(
  () => [props.open, props.fence],
  ([open]) => {
    if (open) resetForm()
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="close">
      <form class="modal-panel glass-panel geofence-modal" @submit.prevent="submit">
        <header class="modal-header">
          <div>
            <p class="page-kicker">空间规则</p>
            <h3>{{ fence?.fenceId ? '编辑围栏' : '创建围栏' }}</h3>
          </div>
          <button class="icon-button" type="button" title="关闭" :disabled="loading" @click="close">
            <X :size="18" aria-hidden="true" />
          </button>
        </header>

        <p v-if="validationError.message || error" class="alert error modal-alert">
          {{ validationError.message || error }}
        </p>
        <p v-if="success" class="alert success modal-alert">{{ success }}</p>

        <label><span>围栏名称</span><input v-model="form.name" maxlength="64" required /></label>
        <div class="geofence-coordinate-grid">
          <label><span>中心纬度</span><input v-model="form.centerLatitude" type="number" min="-90" max="90" step="0.0000001" required /></label>
          <label><span>中心经度</span><input v-model="form.centerLongitude" type="number" min="-180" max="180" step="0.0000001" required /></label>
        </div>
        <div class="geofence-coordinate-grid">
          <label><span>半径（米）</span><input v-model.number="form.radiusMeters" type="number" min="5" max="10000" step="0.01" required /></label>
          <label>
            <span>初始状态</span>
            <select v-model.number="form.enabled" :disabled="Boolean(fence?.fenceId)">
              <option :value="1">启用</option><option :value="0">停用</option>
            </select>
          </label>
        </div>
        <label><span>描述</span><textarea v-model="form.description" maxlength="255" rows="4"></textarea></label>

        <footer class="modal-actions">
          <button class="secondary-button" type="button" :disabled="loading" @click="close">取消</button>
          <button type="submit" :disabled="loading">{{ loading ? '正在保存...' : '保存围栏' }}</button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>
