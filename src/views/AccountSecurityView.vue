<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import StateBlock from '@/components/StateBlock.vue'
import {
  getSocialIdentities,
  unbindSocialIdentity
} from '@/api/account'
import { startOAuthBind } from '@/api/auth'
import {
  getOAuthProvider,
  OAUTH_PROVIDERS
} from '@/config/oauth'
import { getApiErrorMessage } from '@/utils/apiError'
import { getToken, parseTokenPayload } from '@/utils/session'

const identities = ref([])
const loading = ref(false)
const loadError = ref('')
const message = ref('')
const messageType = ref('success')
const bindLoadingProvider = ref('')
const unbindTarget = ref(null)
const unbinding = ref(false)
const modalMessage = ref('')

let viewActive = true

const userId = computed(() => parseTokenPayload()?.sub || '')

const busy = computed(() => (
  loading.value
  || Boolean(bindLoadingProvider.value)
  || unbinding.value
))

const boundProviders = computed(() => new Set(
  identities.value.map((item) => String(item.provider || '').toLowerCase())
))

function isProviderBound(provider) {
  return boundProviders.value.has(provider)
}

function providerLabel(provider) {
  return getOAuthProvider(provider)?.label || provider || '未知来源'
}

function identityName(identity) {
  return identity.displayName
    || identity.providerUsername
    || '未提供昵称'
}

function formatTime(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ')
}

function showMessage(text, type = 'error') {
  message.value = text
  messageType.value = type
}

async function loadIdentities() {
  if (busy.value) return

  if (!userId.value) {
    loadError.value = '当前登录凭证缺少用户 ID，请重新登录'
    identities.value = []
    return
  }

  loading.value = true
  loadError.value = ''
  message.value = ''

  try {
    const { data } = await getSocialIdentities(userId.value)

    if (data?.code !== 200 || !Array.isArray(data.data)) {
      identities.value = []
      loadError.value = data?.message || '社交身份加载失败'
      return
    }

    identities.value = data.data
  } catch (error) {
    identities.value = []
    loadError.value = getApiErrorMessage(error, '社交身份加载失败')
  } finally {
    loading.value = false
  }
}

async function startBinding(provider) {
  if (
    busy.value
    || loadError.value
    || isProviderBound(provider.code)
  ) {
    return
  }

  const tokenAtStart = getToken()

  if (!tokenAtStart || !userId.value) {
    showMessage('登录状态无效，请重新登录')
    return
  }

  bindLoadingProvider.value = provider.code
  message.value = ''
  let redirecting = false

  try {
    const returnUri =
      `${window.location.origin}/oauth-complete/${provider.code}`

    const { data } = await startOAuthBind(
      provider.code,
      returnUri
    )

    if (!viewActive) return

    const authorizationUrl = data?.data?.authorizationUrl

    if (data?.code !== 200 || !authorizationUrl) {
      showMessage(
        data?.message || `${provider.label} OAuth 当前未配置`
      )
      return
    }

    // 请求过程中如果其他标签页切换了账号，禁止继续绑定。
    if (getToken() !== tokenAtStart) {
      showMessage('登录账号已经发生变化，请刷新后重新操作')
      return
    }

    window.location.assign(authorizationUrl)
    redirecting = true
  } catch (error) {
    if (!viewActive) return

    showMessage(
      getApiErrorMessage(
        error,
        `${provider.label} 身份绑定发起失败`
      )
    )
  } finally {
    if (viewActive && !redirecting) {
      bindLoadingProvider.value = ''
    }
  }
}

function openUnbind(identity) {
  if (busy.value) return

  modalMessage.value = ''
  unbindTarget.value = identity
}

function closeUnbind() {
  if (unbinding.value) return

  modalMessage.value = ''
  unbindTarget.value = null
}

async function confirmUnbind() {
  const identity = unbindTarget.value

  if (
    unbinding.value
    || !identity?.identityId
    || !userId.value
  ) {
    return
  }

  unbinding.value = true
  modalMessage.value = ''

  try {
    const { data } = await unbindSocialIdentity(
      userId.value,
      identity.identityId
    )

    if (data?.code !== 200) {
      modalMessage.value = data?.message || '社交身份解绑失败'
      return
    }

    identities.value = identities.value.filter(
      (item) => item.identityId !== identity.identityId
    )

    unbindTarget.value = null
    showMessage(
      data.message || `${providerLabel(identity.provider)} 身份解绑成功`,
      'success'
    )
  } catch (error) {
    modalMessage.value = getApiErrorMessage(
      error,
      '社交身份解绑失败'
    )
  } finally {
    unbinding.value = false
  }
}

onMounted(loadIdentities)

onBeforeUnmount(() => {
  viewActive = false
})
</script>

<template>
  <section class="workspace-view">
    <header class="dashboard-header">
      <div>
        <p class="page-kicker">个人中心</p>
        <h2>账户安全</h2>
      </div>

      <button
        type="button"
        :disabled="busy"
        @click="loadIdentities"
      >
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <p
      v-if="message"
      :class="['alert', messageType]"
      aria-live="polite"
    >
      {{ message }}
    </p>

    <section class="role-action-grid">
      <article
        v-for="provider in OAUTH_PROVIDERS"
        :key="provider.code"
        class="role-action-card glass-panel"
      >
        <span>
          {{ isProviderBound(provider.code) ? '已绑定' : '未绑定' }}
        </span>
        <strong>{{ provider.label }}</strong>
        <p>绑定后可以使用该社交身份登录当前账号。</p>

        <button
          type="button"
          class="compact-button"
          :disabled="
            busy
            || Boolean(loadError)
            || isProviderBound(provider.code)
          "
          @click="startBinding(provider)"
        >
          {{
            isProviderBound(provider.code)
              ? '已经绑定'
              : bindLoadingProvider === provider.code
                ? '跳转中...'
                : `绑定 ${provider.label}`
          }}
        </button>
      </article>
    </section>

    <section class="table-panel glass-panel">
      <div class="table-summary">
        <strong>{{ identities.length }}</strong>
        <span>个已绑定社交身份</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>第三方账号</th>
            <th>邮箱</th>
            <th>绑定时间</th>
            <th>最近登录</th>
            <th>操作</th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="loading">
            <td colspan="6">
              <StateBlock
                type="loading"
                title="正在加载"
                text="正在查询当前账号绑定的社交身份"
              />
            </td>
          </tr>

          <tr v-else-if="loadError">
            <td colspan="6">
              <StateBlock
                type="error"
                title="加载失败"
                :text="loadError"
              />
            </td>
          </tr>

          <tr v-else-if="identities.length === 0">
            <td colspan="6">
              <StateBlock
                title="暂无绑定"
                text="当前账号还没有绑定社交身份"
              />
            </td>
          </tr>

          <template v-else>
            <tr
              v-for="identity in identities"
              :key="identity.identityId"
            >
              <td>{{ providerLabel(identity.provider) }}</td>
              <td>{{ identityName(identity) }}</td>
              <td>
                {{ identity.email || '-' }}
                <span v-if="identity.emailVerified">（已验证）</span>
              </td>
              <td>{{ formatTime(identity.bindTime) }}</td>
              <td>{{ formatTime(identity.lastLoginTime) }}</td>
              <td class="action-cell">
                <button
                  type="button"
                  class="danger-button compact-button"
                  :disabled="busy"
                  @click="openUnbind(identity)"
                >
                  解绑
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>

    <div
      v-if="unbindTarget"
      class="modal-backdrop"
      @click.self="closeUnbind"
    >
      <section
        class="modal-panel glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unbind-title"
      >
        <header class="modal-header">
          <h3 id="unbind-title">确认解绑社交身份</h3>

          <button
            type="button"
            class="icon-button"
            title="关闭"
            aria-label="关闭"
            :disabled="unbinding"
            @click="closeUnbind"
          >
            <X :size="20" />
          </button>
        </header>

        <p>
          即将解绑
          <strong>{{ providerLabel(unbindTarget.provider) }}</strong>
          身份“{{ identityName(unbindTarget) }}”。
        </p>

        <p>
          如果当前账号没有邮箱、手机号或其他登录身份，后端会拒绝解绑最后一个社交身份。
        </p>

        <p
          v-if="modalMessage"
          class="alert error modal-alert"
          aria-live="polite"
        >
          {{ modalMessage }}
        </p>

        <div class="action-cell">
          <button
            type="button"
            class="secondary-button"
            :disabled="unbinding"
            @click="closeUnbind"
          >
            取消
          </button>

          <button
            type="button"
            class="danger-button"
            :disabled="unbinding"
            @click="confirmUnbind"
          >
            {{ unbinding ? '解绑中...' : '确认解绑' }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>