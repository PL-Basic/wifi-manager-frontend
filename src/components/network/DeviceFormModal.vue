<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Save, X } from 'lucide-vue-next'
import { createDevice, updateDevice } from '@/api/devices'
import { getApiErrorMessage } from '@/utils/apiError'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: 'create'
  },
  device: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const isEdit = computed(() => props.mode === 'edit')
const saving = ref(false)
const formError = ref('')
const formSuccess = ref('')

const form = reactive({
  deviceCode: '',
  name: '',
  location: '',
  latitude: '',
  longitude: '',
  ip: '',
  firmwareVersion: '',
  maxClients: '',
  rssiAtOneMeter: '',
  pathLossExponent: ''
})

function resetForm() {
  const device = props.device || {}

  Object.assign(form, {
    deviceCode: device.deviceCode || '',
    name: device.name || '',
    location: device.location || '',
    latitude: device.latitude ?? '',
    longitude: device.longitude ?? '',
    ip: device.ip || '',
    firmwareVersion: device.firmwareVersion || '',
    maxClients: device.maxClients ?? '',
    rssiAtOneMeter: device.rssiAtOneMeter ?? '',
    pathLossExponent: device.pathLossExponent ?? ''
  })

  formError.value = ''
  formSuccess.value = ''
}

watch(
  () => props.open,
  (open) => {
    if (open) resetForm()
  }
)

watch(
  () => props.device?.nodeId,
  () => {
    if (props.open) resetForm()
  }
)

function optionalText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function isBlank(value) {
  return value === '' || value === null || value === undefined
}

function validateForm() {
  if (!isEdit.value && !form.deviceCode.trim()) {
    return '请填写设备编码'
  }

  if (!form.name.trim()) {
    return '请填写设备名称'
  }

  const latitudeBlank = isBlank(form.latitude)
  const longitudeBlank = isBlank(form.longitude)

  if (latitudeBlank !== longitudeBlank) {
    return '纬度和经度必须同时填写，或者同时留空'
  }

  if (!latitudeBlank) {
    const latitude = Number(form.latitude)
    const longitude = Number(form.longitude)

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return '纬度必须在 -90 到 90 之间'
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return '经度必须在 -180 到 180 之间'
    }
  }

  if (!isBlank(form.maxClients)) {
    const value = Number(form.maxClients)
    if (!Number.isInteger(value) || value < 4 || value > 128) {
      return '最大连接数必须是 4 到 128 的整数'
    }
  }

  if (!isBlank(form.rssiAtOneMeter)) {
    const value = Number(form.rssiAtOneMeter)
    if (!Number.isInteger(value) || value < -100 || value > -20) {
      return '一米参考 RSSI 必须是 -100 到 -20 的整数'
    }
  }

  if (!isBlank(form.pathLossExponent)) {
    const value = Number(form.pathLossExponent)
    if (!Number.isFinite(value) || value < 1 || value > 6) {
      return '路径损耗指数必须在 1.0 到 6.0 之间'
    }
  }

  return ''
}

function buildPayload() {
  const latitudeBlank = isBlank(form.latitude)
  const longitudeBlank = isBlank(form.longitude)

  const payload = {
    name: form.name.trim(),
    location: optionalText(form.location),
    ip: optionalText(form.ip),
    maxClients: isBlank(form.maxClients) ? null : Number(form.maxClients),
    rssiAtOneMeter: isBlank(form.rssiAtOneMeter)
      ? null
      : Number(form.rssiAtOneMeter),
    pathLossExponent: isBlank(form.pathLossExponent)
      ? null
      : Number(form.pathLossExponent)
  }

  if (!isEdit.value) {
    payload.deviceCode = form.deviceCode.trim()
    payload.firmwareVersion = optionalText(form.firmwareVersion)
    payload.latitude = latitudeBlank ? null : Number(form.latitude)
    payload.longitude = longitudeBlank ? null : Number(form.longitude)
    return payload
  }

  if (latitudeBlank && longitudeBlank) {
    payload.clearCoordinates = true
  } else {
    payload.clearCoordinates = false
    payload.latitude = Number(form.latitude)
    payload.longitude = Number(form.longitude)
  }

  return payload
}

async function submitForm() {
  formError.value = ''
  formSuccess.value = ''

  const validationMessage = validateForm()
  if (validationMessage) {
    formError.value = validationMessage
    return
  }

  saving.value = true

  try {
    const response = isEdit.value
      ? await updateDevice(props.device.nodeId, buildPayload())
      : await createDevice(buildPayload())

    const body = response?.data

    if (body?.code !== 200) {
      formError.value = body?.message || '设备保存失败'
      return
    }

    formSuccess.value = body.message || '设备保存成功'
    emit('saved', body.data)
  } catch (error) {
    formError.value = getApiErrorMessage(error, '设备保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="modal-backdrop"
    @click.self="!saving && emit('close')"
  >
    <form
      class="modal-panel glass-panel device-form-modal"
      @submit.prevent="submitForm"
    >
      <header class="modal-header">
        <div>
          <p class="page-kicker">网络设备</p>
          <h3>{{ isEdit ? '编辑设备' : '新增设备' }}</h3>
        </div>

        <button
          class="icon-button"
          type="button"
          title="关闭弹窗"
          aria-label="关闭弹窗"
          :disabled="saving"
          @click="emit('close')"
        >
          <X :size="19" />
        </button>
      </header>

      <p v-if="formError" class="alert error modal-alert">
        {{ formError }}
      </p>

      <p v-if="formSuccess" class="alert success modal-alert">
        {{ formSuccess }}
      </p>

      <div class="device-form-fields">
        <label>
          <span>设备编码</span>
          <input
            v-model="form.deviceCode"
            type="text"
            maxlength="64"
            :disabled="isEdit || saving"
            placeholder="例如：ESP32-001"
          />
        </label>

        <label>
          <span>设备名称</span>
          <input
            v-model="form.name"
            type="text"
            maxlength="128"
            :disabled="saving"
            placeholder="例如：一楼大厅设备"
          />
        </label>

        <label>
          <span>位置说明</span>
          <input
            v-model="form.location"
            type="text"
            maxlength="255"
            :disabled="saving"
            placeholder="例如：一楼大厅"
          />
        </label>

        <div class="form-row">
          <label>
            <span>纬度</span>
            <input
              v-model="form.latitude"
              type="number"
              step="0.0000001"
              :disabled="saving"
              placeholder="可留空"
            />
          </label>

          <label>
            <span>经度</span>
            <input
              v-model="form.longitude"
              type="number"
              step="0.0000001"
              :disabled="saving"
              placeholder="可留空"
            />
          </label>
        </div>

        <div class="form-row">
          <label>
            <span>IP 地址</span>
            <input
              v-model="form.ip"
              type="text"
              maxlength="64"
              :disabled="saving"
              placeholder="可留空"
            />
          </label>

          <label v-if="!isEdit">
            <span>设备软件版本</span>
            <input
              v-model="form.firmwareVersion"
              type="text"
              maxlength="64"
              :disabled="saving"
              placeholder="可留空"
            />
          </label>
        </div>

        <div class="form-row">
          <label>
            <span>最大连接数</span>
            <input
              v-model="form.maxClients"
              type="number"
              min="4"
              max="128"
              step="1"
              :disabled="saving"
              placeholder="默认 4"
            />
          </label>

          <label>
            <span>一米参考 RSSI</span>
            <input
              v-model="form.rssiAtOneMeter"
              type="number"
              min="-100"
              max="-20"
              step="1"
              :disabled="saving"
              placeholder="可留空"
            />
          </label>
        </div>

        <label>
          <span>路径损耗指数</span>
          <input
            v-model="form.pathLossExponent"
            type="number"
            min="1"
            max="6"
            step="0.01"
            :disabled="saving"
            placeholder="可留空"
          />
        </label>
      </div>

      <footer class="modal-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="saving"
          @click="emit('close')"
        >
          关闭
        </button>

        <button type="submit" :disabled="saving">
          <Save :size="16" aria-hidden="true" />
          {{ saving ? '保存中...' : '保存设备' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.device-form-modal {
  width: min(680px, 100%);
}

.device-form-fields {
  display: grid;
  gap: 14px;
}

.device-form-modal label span {
  color: var(--wm-text-soft);
}

.device-form-modal input {
  color: var(--wm-text);
  background: var(--wm-bg-soft);
  border-color: var(--wm-border-strong);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

@media (max-width: 560px) {
  .modal-actions {
    flex-direction: column-reverse;
  }

  .modal-actions button {
    width: 100%;
  }
}
</style>
