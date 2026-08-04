<script setup>
import { computed } from 'vue'
import { ArrowRight, Clock3, ShieldCheck } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import { clearPendingAccount, getPendingAccount } from '@/utils/accountState'

const router = useRouter()
const account = getPendingAccount()
const displayName = computed(() => account?.nickname || account?.username || '当前账号')

function returnToLogin() {
  clearPendingAccount()
  router.replace('/login')
}
</script>

<template>
  <div class="starry-auth-scene restricted-account-scene">
    <StarrySky />
    <main class="restricted-account-layout">
      <section class="restricted-account-status" aria-labelledby="restricted-title">
        <div class="restricted-account-mark"><Clock3 :size="28" aria-hidden="true" /></div>
        <p class="eyebrow">ACCOUNT RECOVERY</p>
        <h1 id="restricted-title">账号正在恢复访问</h1>
        <p class="restricted-account-lead">{{ displayName }} 的登录身份已经验证，但默认租户成员关系尚未完成，因此系统没有签发访问令牌。</p>

        <dl class="restricted-account-facts">
          <div><dt>账号状态</dt><dd>租户成员关系待恢复</dd></div>
          <div><dt>登录凭证</dt><dd>未签发</dd></div>
          <div><dt>安全策略</dt><dd>恢复完成前禁止进入业务页面</dd></div>
        </dl>

        <div class="restricted-account-note"><ShieldCheck :size="18" aria-hidden="true" /><p>{{ account?.message || '默认租户成员关系正在恢复' }}</p></div>
        <button type="button" @click="returnToLogin">重新登录检查状态<ArrowRight :size="17" /></button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.restricted-account-scene { min-height: 100vh; }
.restricted-account-layout { position: relative; z-index: 1; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.restricted-account-status { width: min(620px, 100%); padding: 30px; border: 1px solid var(--wm-border); border-radius: 8px; color: var(--wm-text); background: color-mix(in srgb, var(--wm-surface) 94%, transparent); box-shadow: 0 24px 72px rgba(0, 0, 0, .34); }
.restricted-account-mark { width: 52px; height: 52px; display: grid; place-items: center; margin-bottom: 18px; border: 1px solid color-mix(in srgb, #d7a93f 45%, transparent); border-radius: 50%; color: #e3b94f; background: color-mix(in srgb, #d7a93f 12%, transparent); }
.restricted-account-status h1 { margin: 5px 0 10px; font-size: 30px; letter-spacing: 0; }
.restricted-account-lead { margin: 0; color: var(--wm-text-soft); line-height: 1.7; }
.restricted-account-facts { display: grid; margin: 22px 0; border-top: 1px solid var(--wm-border); }
.restricted-account-facts div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--wm-border); }
.restricted-account-facts dt { color: var(--wm-muted); }
.restricted-account-facts dd { margin: 0; color: var(--wm-text); overflow-wrap: anywhere; }
.restricted-account-note { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 20px; padding: 12px; color: var(--wm-text-soft); background: var(--wm-bg-soft); border-left: 3px solid #70c7bb; }
.restricted-account-note svg { flex: 0 0 auto; color: #70c7bb; }
.restricted-account-note p { margin: 0; line-height: 1.55; }
.restricted-account-status > button { display: inline-flex; align-items: center; gap: 8px; }
@media (max-width: 560px) { .restricted-account-layout { padding: 14px; } .restricted-account-status { padding: 22px 18px; } .restricted-account-status h1 { font-size: 25px; } .restricted-account-facts div { grid-template-columns: 1fr; gap: 3px; } .restricted-account-status > button { width: 100%; justify-content: center; } }
</style>
