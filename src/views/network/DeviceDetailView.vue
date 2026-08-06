<script setup>
import { computed, ref, watch } from 'vue'
import {
  ArrowLeft,
  CircleGauge,
  ListChecks,
  Pencil,
  Radio,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserX,
  Wifi
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import StateBlock from '@/components/StateBlock.vue'
import DeviceFormModal from '@/components/network/DeviceFormModal.vue'
import {
  allowDevice,
  deleteDevice,
  getDevice,
  kickDevice,
  restoreDevice
} from '@/api/devices'
import { getApiErrorMessage } from '@/utils/apiError'
import { useRequestGate } from '@/composables/useRequestGate'
import { resolveDeviceStatus } from '@/config/networkStatus'
import DeviceCommandPanel from '@/components/network/DeviceCommandPanel.vue'
import WifiConfigPanel from '@/components/network/WifiConfigPanel.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const detail = ref(null)
const retired = ref(false)
const pageError = ref('')
const actionMessage = ref('')
const actionMessageType = ref('success')
const actionBusy = ref(false)
const editOpen = ref(false)
const confirmAction = ref('')
const kickReason = ref('')
const commandPanelRef = ref(null)

const requestGate = useRequestGate()
const DETAIL_SECTIONS = new Set(['overview', 'upstream', 'commands'])

const nodeId = computed(() => String(route.params.nodeId || ''))
const activeSection = computed(() => {
  const section = String(route.query.section || 'overview')
  return DETAIL_SECTIONS.has(section) ? section : 'overview'
})
const wifiTaskRequestId = computed(() => String(route.query.wifiTask || ''))

const statusInfo = computed(() => (
  resolveDeviceStatus(detail.value?.status)
))

const confirmTitle = computed(() => {
  if (confirmAction.value === 'delete') return '确认退役设备'
  if (confirmAction.value === 'kick') return '确认断开联网设备'
  return '确认恢复设备'
})

const confirmText = computed(() => {
  if (confirmAction.value === 'delete') {
    return '停用后设备会从正常设备列表中隐藏，仍可通过设备详情恢复。'
  }

  if (confirmAction.value === 'kick') {
    return '该操作会通知网络设备断开当前联网设备，提交后仍需等待执行结果。'
  }

  return '确认恢复这个设备？'
})

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}

function formatCoordinates(latitude, longitude) {
  if (latitude === null || latitude === undefined) return '-'
  if (longitude === null || longitude === undefined) return '-'
  return `${latitude}, ${longitude}`
}

function readBody(response, label) {
  const body = response?.data

  if (body?.code !== 200) {
    throw new Error(body?.message || `${label}失败`)
  }

  return body.data
}

function readableError(error, fallback) {
  if (error instanceof Error && !error.response) {
    return error.message || fallback
  }

  return getApiErrorMessage(error, fallback)
}

function setActionMessage(type, message) {
  actionMessageType.value = type
  actionMessage.value = message
}

async function loadDevice() {
  const currentVersion = requestGate.begin()

  loading.value = true
  detail.value = null
  retired.value = false
  pageError.value = ''
  actionMessage.value = ''

  try {
    const data = readBody(
      await getDevice(nodeId.value),
      '设备详情加载'
    )

    if (!requestGate.isCurrent(currentVersion)) return

    detail.value = data
  } catch (error) {
    if (!requestGate.isCurrent(currentVersion)) return

    pageError.value = readableError(error, '设备详情加载失败')
  } finally {
    if (requestGate.isCurrent(currentVersion)) {
      loading.value = false
    }
  }
}

function goBack() {
  router.push({ name: 'app-network-devices' })
}

function openClients() {
  if (!detail.value?.nodeId) return

  router.push({
    name: 'app-network-clients',
    query: {
      nodeId: String(detail.value.nodeId),
      deviceCode: detail.value.deviceCode || undefined
    }
  })
}

function openSection(section) {
  if (!DETAIL_SECTIONS.has(section) || section === activeSection.value) return

  router.replace({
    name: 'app-network-device-detail',
    params: { nodeId: nodeId.value },
    query: {
      ...route.query,
      section
    }
  })
}

function trackWifiTask(requestId) {
  if (!requestId) return

  router.replace({
    name: 'app-network-device-detail',
    params: { nodeId: nodeId.value },
    query: {
      ...route.query,
      section: 'upstream',
      wifiTask: requestId
    }
  })
}

function openEditor() {
  if (!detail.value || retired.value || actionBusy.value) return

  actionMessage.value = ''
  editOpen.value = true
}

function handleSaved(data) {
  if (data) {
    detail.value = data
  }

  setActionMessage('success', '设备信息已保存')
}

async function executeAllow() {
  if (!detail.value?.deviceCode || retired.value || actionBusy.value) {
    return
  }

  actionBusy.value = true
  actionMessage.value = ''

  try {
    const data = readBody(
      await allowDevice(detail.value.deviceCode),
      '允许设备接入'
    )

    if (data) {
      detail.value = data
    }

    setActionMessage('success', '设备已允许接入')
  } catch (error) {
    setActionMessage('error', readableError(error, '允许设备接入失败'))
  } finally {
    actionBusy.value = false
  }
}

function requestKick() {
  if (!detail.value?.deviceCode || retired.value || actionBusy.value) {
    return
  }

  confirmAction.value = 'kick'
}

function requestDelete() {
  if (!detail.value || retired.value || actionBusy.value) return
  confirmAction.value = 'delete'
}

function requestRestore() {
  if (!detail.value || !retired.value || actionBusy.value) return
  confirmAction.value = 'restore'
}

function cancelConfirm() {
  if (!actionBusy.value) {
    confirmAction.value = ''
  }
}

async function executeConfirm() {
  const action = confirmAction.value

  if (!action || !detail.value || actionBusy.value) return

  actionBusy.value = true
  pageError.value = ''

  try {
    if (action === 'delete') {
      readBody(
        await deleteDevice(detail.value.nodeId),
        '设备退役'
      )

      retired.value = true
      setActionMessage(
        'success',
        '设备已退役。当前页面保留已知 nodeId，可立即执行恢复。'
      )
    } else if (action === 'restore') {
      const data = readBody(
        await restoreDevice(detail.value.nodeId),
        '设备恢复'
      )

      if (data) {
        detail.value = data
      }

      retired.value = false
      setActionMessage('success', '设备已恢复')
    } else if (action === 'kick') {
      const reason = kickReason.value.trim()
      const data = readBody(
        await kickDevice(
          detail.value.deviceCode,
          reason ? { reason } : undefined
        ),
        '断开联网设备'
      )

      if (!data?.requestId) {
        throw new Error('服务没有返回此次操作的编号')
      }

      commandPanelRef.value?.trackRequest(data.requestId)

      setActionMessage(
        'success',
        `断开请求已提交，操作编号：${data.requestId}。可在“设备操作”中查看执行结果。`
      )

      kickReason.value = ''
    }
  } catch (error) {
    setActionMessage(
      'error',
      readableError(
        error,
        action === 'delete'
          ? '设备退役失败'
          : action === 'restore'
            ? '设备恢复失败'
            : '踢出请求失败'
      )
    )
  } finally {
    actionBusy.value = false
    confirmAction.value = ''
  }
}

watch(
  () => route.params.nodeId,
  () => {
    loadDevice()
  },
  { immediate: true }
)
</script>

<template>
  <section class="workspace-view device-detail-page">
    <header class="dashboard-header device-detail-header">
      <div>
        <button
          class="ghost-button"
          type="button"
          :disabled="actionBusy"
          @click="goBack"
        >
          <ArrowLeft :size="16" aria-hidden="true" />
          返回设备列表
        </button>

        <p class="page-kicker">网络工作区 / 设备详情</p>
        <h2>{{ detail?.name || detail?.deviceCode || '设备详情' }}</h2>
      </div>

      <div v-if="detail" class="device-detail-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="actionBusy || !detail.nodeId"
          @click="openClients"
        >
          <Radio :size="16" aria-hidden="true" />
          连接信号
        </button>
        <button
          class="secondary-button"
          type="button"
          :disabled="retired || actionBusy"
          @click="openEditor"
        >
          <Pencil :size="16" aria-hidden="true" />
          编辑
        </button>

        <button
          class="secondary-button"
          type="button"
          :disabled="retired || actionBusy || !detail.deviceCode"
          @click="executeAllow"
        >
          <ShieldCheck :size="16" aria-hidden="true" />
          {{ actionBusy ? '处理中...' : '允许接入' }}
        </button>

        <button
          class="danger-button"
          type="button"
          :disabled="retired || actionBusy"
          @click="requestDelete"
        >
          <Trash2 :size="16" aria-hidden="true" />
          退役设备
        </button>
      </div>
    </header>

    <p
      v-if="actionMessage"
      :class="['alert', actionMessageType === 'success' ? 'success' : 'error']"
    >
      {{ actionMessage }}
    </p>

    <StateBlock
      v-if="loading"
      type="loading"
      title="正在加载设备详情"
      text="正在同步设备数据"
    />

    <p v-else-if="pageError" class="alert error">
      {{ pageError }}
    </p>

    <template v-else-if="detail">
      <section class="glass-panel device-status-banner">
        <div>
          <span>当前状态</span>
          <strong :class="['status-pill', `status-pill--${statusInfo.tone}`]">
            {{ retired ? '已退役' : statusInfo.label }}
          </strong>
        </div>

        <div>
          <span>设备编码</span>
          <strong>{{ detail.deviceCode || '-' }}</strong>
        </div>

        <button
          v-if="retired"
          class="secondary-button"
          type="button"
          :disabled="actionBusy"
          @click="requestRestore"
        >
          <RotateCcw :size="16" aria-hidden="true" />
          恢复设备
        </button>
      </section>

      <nav class="device-section-nav" aria-label="设备详情分区">
        <button
          type="button"
          :class="{ active: activeSection === 'overview' }"
          @click="openSection('overview')"
        >
          <CircleGauge :size="16" aria-hidden="true" />
          设备概览
        </button>
        <button
          type="button"
          :class="{ active: activeSection === 'upstream' }"
          @click="openSection('upstream')"
        >
          <Wifi :size="16" aria-hidden="true" />
          上游网络
        </button>
        <button
          type="button"
          :class="{ active: activeSection === 'commands' }"
          @click="openSection('commands')"
        >
          <ListChecks :size="16" aria-hidden="true" />
          命令与控制
        </button>
      </nav>

      <section v-if="activeSection === 'overview'" class="device-detail-grid">
        <article class="glass-panel detail-panel">
          <header>
            <p class="page-kicker">设备信息</p>
            <h3>基础资料</h3>
          </header>

          <dl class="detail-list">
            <dt>设备编号</dt>
            <dd>{{ detail.nodeId ?? '-' }}</dd>

            <dt>设备编码</dt>
            <dd>{{ detail.deviceCode || '-' }}</dd>

            <dt>设备名称</dt>
            <dd>{{ detail.name || '-' }}</dd>

            <dt>位置</dt>
            <dd>{{ detail.location || '-' }}</dd>

            <dt>IP 地址</dt>
            <dd>{{ detail.ip || '-' }}</dd>

            <dt>设备软件版本</dt>
            <dd>{{ detail.firmwareVersion || '-' }}</dd>

            <dt>WiFi 状态</dt>
            <dd>{{ detail.wifiStatus || '-' }}</dd>
          </dl>
        </article>

        <article class="glass-panel detail-panel">
          <header>
            <p class="page-kicker">运行数据</p>
            <h3>连接与信号</h3>
          </header>

          <dl class="detail-list">
            <dt>在线联网设备</dt>
            <dd>{{ detail.currentClients ?? '-' }}</dd>

            <dt>最大容量</dt>
            <dd>{{ detail.maxClients ?? '-' }}</dd>

            <dt>安装坐标</dt>
            <dd>
              {{ formatCoordinates(detail.latitude, detail.longitude) }}
            </dd>

            <dt>一米参考 RSSI</dt>
            <dd>{{ detail.rssiAtOneMeter ?? '-' }}</dd>

            <dt>路径损耗指数</dt>
            <dd>{{ detail.pathLossExponent ?? '-' }}</dd>

            <dt>最近心跳</dt>
            <dd>{{ formatTime(detail.lastHeartbeat) }}</dd>

            <dt>更新时间</dt>
            <dd>{{ formatTime(detail.updateTime) }}</dd>
          </dl>
        </article>
      </section>

      <template v-else-if="activeSection === 'commands'">
        <section v-if="!retired" class="glass-panel device-command-panel">
          <header>
            <p class="page-kicker">设备操作</p>
            <h3>断开联网设备</h3>
          </header>

          <div class="device-command-form">
            <label>
              <span>操作原因（可选）</span>
              <input
                v-model="kickReason"
                type="text"
                maxlength="255"
                :disabled="actionBusy"
                placeholder="例如：管理员手动断开"
              />
            </label>

            <button
              class="danger-button"
              type="button"
              :disabled="actionBusy || !detail.deviceCode"
              @click="requestKick"
            >
              <UserX :size="16" aria-hidden="true" />
              断开联网设备
            </button>
          </div>
        </section>

        <DeviceCommandPanel
          ref="commandPanelRef"
          :device-code="detail.deviceCode"
          :retired="retired"
          :disabled="actionBusy"
        />
      </template>

      <WifiConfigPanel
        v-else
        :device-code="detail.deviceCode"
        :retired="retired"
        :disabled="actionBusy"
        :online="detail.status === 1"
        :wifi-status="detail.wifiStatus"
        :last-heartbeat="detail.lastHeartbeat"
        :initial-request-id="wifiTaskRequestId"
        @task-started="trackWifiTask"
      />

    </template>

    <DeviceFormModal
      :open="editOpen"
      mode="edit"
      :device="detail"
      @close="editOpen = false"
      @saved="handleSaved"
    />

    <div
      v-if="confirmAction"
      class="modal-backdrop"
      @click.self="!actionBusy && cancelConfirm()"
    >
      <form
        class="modal-panel glass-panel confirm-panel"
        @submit.prevent="executeConfirm"
      >
        <header class="modal-header">
          <div>
            <p class="page-kicker">敏感操作</p>
            <h3>{{ confirmTitle }}</h3>
          </div>
        </header>

        <p class="confirm-text">{{ confirmText }}</p>

        <footer class="modal-actions">
          <button
            class="secondary-button"
            type="button"
            :disabled="actionBusy"
            @click="cancelConfirm"
          >
            取消
          </button>

          <button
            :class="['delete', 'kick'].includes(confirmAction) ? 'danger-button' : 'secondary-button'"
            type="submit"
            :disabled="actionBusy"
          >
            {{ actionBusy ? '处理中...' : '确认' }}
          </button>
        </footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.device-detail-page {
  min-width: 0;
}

.device-detail-header {
  align-items: flex-end;
}

.device-detail-header > div:first-child {
  min-width: 0;
}

.device-detail-header h2 {
  margin-top: 8px;
  overflow-wrap: anywhere;
}

.device-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.device-status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  padding: 16px;
}

.device-status-banner > div {
  min-width: 0;
}

.device-status-banner span {
  display: block;
  color: var(--wm-muted);
  font-size: 12px;
}

.device-status-banner strong {
  display: block;
  margin-top: 5px;
  color: var(--wm-text);
  overflow-wrap: anywhere;
}

.device-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.device-section-nav {
  display: flex;
  min-width: 0;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--wm-border);
  overflow-x: auto;
}

.device-section-nav button {
  flex: 0 0 auto;
  min-height: 44px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 0 16px;
  color: var(--wm-muted);
  background: transparent;
  box-shadow: none;
}

.device-section-nav button:hover,
.device-section-nav button.active {
  border-bottom-color: var(--wm-primary);
  color: var(--wm-text);
  background: var(--wm-surface-muted);
  transform: none;
}

.detail-panel,
.device-command-panel {
  min-width: 0;
  border-radius: 8px;
  padding: 16px;
}

.detail-panel header,
.device-command-panel header {
  margin-bottom: 14px;
}

.detail-panel h3,
.device-command-panel h3 {
  margin: 0;
  color: var(--wm-text);
  font-size: 17px;
}

.detail-panel .detail-list {
  margin-top: 0;
}

.device-command-panel {
  margin-top: 16px;
}

.device-command-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.device-command-form label span {
  color: var(--wm-text-soft);
}

.device-command-form input {
  color: var(--wm-text);
  background: var(--wm-bg-soft);
  border-color: var(--wm-border-strong);
}

.confirm-panel {
  width: min(480px, 100%);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

.confirm-text {
  margin: 0;
  color: var(--wm-text-soft);
  line-height: 1.6;
}

@media (max-width: 820px) {
  .device-detail-grid {
    grid-template-columns: 1fr;
  }

  .device-status-banner {
    align-items: flex-start;
    flex-direction: column;
  }

  .device-status-banner button {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .device-detail-actions {
    width: 100%;
  }

  .device-detail-actions button {
    flex: 1 1 0;
  }

  .device-command-form {
    grid-template-columns: 1fr;
  }

  .device-command-form button {
    width: 100%;
  }

  .device-section-nav button {
    padding: 0 12px;
  }

  .modal-actions {
    flex-direction: column-reverse;
  }

  .modal-actions button {
    width: 100%;
  }
}
</style>
