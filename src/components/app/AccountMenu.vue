<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, LogOut, ShieldCheck, Trash2, UserRoundCheck } from 'lucide-vue-next'
import { getAccountNavigationItems } from '@/config/navigation'
import { resolveAvatarUrl } from '@/utils/avatar'

const props = defineProps({
  displayName: { type: String, default: '' },
  username: { type: String, default: '' },
  roleLabel: { type: String, default: '' },
  avatar: { type: String, default: '' },
  currentUserId: { type: String, default: '' },
  accounts: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  tenantContext: { type: Object, default: null }
})

const emit = defineEmits(['logout', 'switch-account', 'forget-account'])
const open = ref(false)
const root = ref(null)
const trigger = ref(null)

const otherAccounts = computed(() => props.accounts.filter((item) => String(item.userId) !== props.currentUserId))
const accountNavigationItems = computed(() => getAccountNavigationItems(props.tenantContext))
const avatarUrl = computed(() => resolveAvatarUrl(props.avatar))
const initial = computed(() => (props.displayName || props.username || 'U').slice(0, 1).toUpperCase())

async function toggle() {
  if (props.busy) return
  open.value = !open.value
  if (open.value) {
    await nextTick()
    root.value?.querySelector('.account-menu__links a')?.focus()
  }
}

function close(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) nextTick(() => trigger.value?.focus())
}

function handleDocumentPointer(event) {
  if (open.value && root.value && !root.value.contains(event.target)) close()
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    close(true)
    return
  }
  if (!open.value || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  const items = [...root.value.querySelectorAll('[role="menuitem"]:not(:disabled)')]
  if (!items.length) return
  event.preventDefault()
  const currentIndex = items.indexOf(document.activeElement)
  if (event.key === 'Home') items[0].focus()
  else if (event.key === 'End') items[items.length - 1].focus()
  else {
    const offset = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + offset + items.length) % items.length
    items[nextIndex].focus()
  }
}

function chooseAccount(account) {
  close()
  emit('switch-account', account)
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointer)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointer)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="account-menu">
    <button
      ref="trigger"
      class="account-menu__trigger"
      type="button"
      :disabled="busy"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-label="打开个人菜单"
      @click="toggle"
    >
      <span class="account-avatar">
        <img v-if="avatarUrl" :src="avatarUrl" alt="" />
        <span v-else>{{ initial }}</span>
      </span>
      <span class="account-menu__identity">
        <strong>{{ displayName || username || '当前用户' }}</strong>
        <small>{{ roleLabel }}</small>
      </span>
      <ChevronDown :size="16" :class="{ 'is-open': open }" aria-hidden="true" />
    </button>

    <Transition name="account-popover">
      <div v-if="open" class="account-menu__popover" role="menu" aria-label="个人功能">
        <header class="account-menu__header">
          <span class="account-avatar account-avatar--large">
            <img v-if="avatarUrl" :src="avatarUrl" alt="" />
            <span v-else>{{ initial }}</span>
          </span>
          <div><strong>{{ displayName || username }}</strong><span>@{{ username }}</span></div>
          <ShieldCheck :size="18" aria-hidden="true" />
        </header>

        <nav class="account-menu__links" aria-label="个人页面">
          <RouterLink
            v-for="item in accountNavigationItems"
            :key="item.to"
            :to="item.to"
            role="menuitem"
            @click="close()"
          >
            <component :is="item.icon" :size="17" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>

        <section v-if="otherAccounts.length" class="account-menu__accounts" aria-label="历史账号">
          <p>切换账号</p>
          <div v-for="account in otherAccounts" :key="account.userId" class="account-menu__account-row">
            <button
              type="button"
              role="menuitem"
              :disabled="busy || !account.channels?.length"
              :title="account.channels?.length ? '通过验证码切换' : '该历史账号没有可用的验证渠道'"
              @click="chooseAccount(account)"
            >
              <UserRoundCheck :size="17" aria-hidden="true" />
              <span><strong>{{ account.nickname || account.username }}</strong><small>@{{ account.username }}</small></span>
            </button>
            <button class="account-menu__forget" type="button" role="menuitem" title="从本机移除账号" aria-label="从本机移除账号" @click="emit('forget-account', account.userId)"><Trash2 :size="15" /></button>
          </div>
        </section>

        <button class="account-menu__logout" type="button" role="menuitem" :disabled="busy" @click="emit('logout')">
          <LogOut :size="17" aria-hidden="true" />
          <span>{{ busy ? '处理中...' : '退出账号' }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.account-menu { position: relative; flex: 0 0 auto; }
.account-menu__trigger { min-width: 0; min-height: 44px; display: flex; align-items: center; gap: 10px; padding: 5px 8px 5px 6px; color: var(--wm-text); background: transparent; border: 1px solid transparent; border-radius: 8px; box-shadow: none; }
.account-menu__trigger:hover:not(:disabled), .account-menu__trigger[aria-expanded='true'] { background: var(--wm-bg-soft); border-color: var(--wm-border); }
.account-menu__trigger > svg { color: var(--wm-muted); transition: transform 180ms ease; }
.account-menu__trigger > svg.is-open { transform: rotate(180deg); }
.account-avatar { width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; color: #052e2b; background: #70c7bb; font-weight: 800; }
.account-avatar img { width: 100%; height: 100%; object-fit: cover; }
.account-avatar--large { width: 42px; height: 42px; flex-basis: 42px; }
.account-menu__identity { min-width: 0; display: grid; text-align: left; }
.account-menu__identity strong, .account-menu__identity small { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-menu__identity strong { font-size: 14px; }
.account-menu__identity small { color: var(--wm-muted); font-size: 12px; }
.account-menu__popover { position: absolute; z-index: 90; top: calc(100% + 10px); right: 0; width: min(328px, calc(100vw - 24px)); max-height: min(680px, calc(100vh - 84px)); overflow-y: auto; padding: 8px; border: 1px solid var(--wm-border); border-radius: 8px; background: var(--wm-surface); box-shadow: 0 18px 48px rgba(0, 0, 0, .28); }
.account-menu__header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 10px; border-bottom: 1px solid var(--wm-border); }
.account-menu__header > div { min-width: 0; display: grid; }
.account-menu__header strong, .account-menu__header span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-menu__header span { color: var(--wm-muted); font-size: 12px; }
.account-menu__header > svg { color: #70c7bb; }
.account-menu__links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; padding: 8px 0; }
.account-menu__links a, .account-menu__accounts button, .account-menu__logout { min-width: 0; min-height: 38px; display: flex; align-items: center; gap: 9px; padding: 8px 10px; color: var(--wm-text-soft); background: transparent; border: 1px solid transparent; border-radius: 6px; box-shadow: none; text-decoration: none; text-align: left; }
.account-menu__links a:hover, .account-menu__links a.router-link-active, .account-menu__accounts button:hover:not(:disabled) { color: var(--wm-text); background: var(--wm-bg-soft); border-color: var(--wm-border); }
.account-menu__links a:focus-visible, .account-menu__accounts button:focus-visible, .account-menu__logout:focus-visible { outline: 2px solid #70c7bb; outline-offset: 1px; }
.account-menu__accounts { padding: 8px 0; border-top: 1px solid var(--wm-border); }
.account-menu__accounts > p { margin: 0 10px 5px; color: var(--wm-muted); font-size: 12px; font-weight: 700; }
.account-menu__account-row { display: grid; grid-template-columns: minmax(0, 1fr) 36px; gap: 3px; }
.account-menu__account-row > button:first-child { width: 100%; }
.account-menu__account-row .account-menu__forget { width: 36px; justify-content: center; padding: 8px; color: var(--wm-muted); }
.account-menu__account-row .account-menu__forget:hover { color: var(--wm-danger); background: color-mix(in srgb, var(--wm-danger) 10%, transparent); }
.account-menu__accounts button > span { min-width: 0; display: grid; }
.account-menu__accounts strong, .account-menu__accounts small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-menu__accounts small { color: var(--wm-muted); }
.account-menu__logout { width: 100%; margin-top: 2px; color: var(--wm-danger); border-top-color: var(--wm-border); border-radius: 0 0 6px 6px; }
.account-menu__logout:hover:not(:disabled) { background: color-mix(in srgb, var(--wm-danger) 10%, transparent); }
.account-popover-enter-active, .account-popover-leave-active { transition: opacity 160ms ease, transform 160ms ease; transform-origin: top right; }
.account-popover-enter-from, .account-popover-leave-to { opacity: 0; transform: translateY(-4px); }
@media (max-width: 720px) { .account-menu__identity { display: none; } .account-menu__trigger { padding-right: 5px; } }
@media (max-width: 420px) { .account-menu__popover { position: fixed; top: 66px; right: 12px; } .account-menu__links { grid-template-columns: 1fr 1fr; } }
@media (prefers-reduced-motion: reduce) { .account-popover-enter-active, .account-popover-leave-active, .account-menu__trigger > svg { transition: none; } }
</style>
