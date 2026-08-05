<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Building2, X } from 'lucide-vue-next'

const props = defineProps({
  open: Boolean,
  tenant: { type: Object, default: null },
  submitting: Boolean,
  submitError: { type: String, default: '' }
})

const emit = defineEmits(['close', 'submit'])
const form = reactive({ tenantCode: '', name: '', timezone: 'Asia/Shanghai' })
const localError = ref('')
const nameInput = ref(null)
const codeInput = ref(null)
const editing = computed(() => Boolean(props.tenant))

function reset() {
  form.tenantCode = props.tenant?.tenantCode || ''
  form.name = props.tenant?.name || ''
  form.timezone = props.tenant?.timezone || 'Asia/Shanghai'
  localError.value = ''
}

function close() {
  if (!props.submitting) emit('close')
}

function submit() {
  localError.value = ''
  const tenantCode = form.tenantCode.trim()
  const name = form.name.trim()
  const timezone = form.timezone.trim()

  if (!editing.value && !/^[a-z][a-z0-9-]{2,63}$/.test(tenantCode)) {
    localError.value = '租户编码需以小写字母开头，仅含小写字母、数字和短横线，长度为 3 至 64 位'
    return
  }
  if (!name || name.length > 128) {
    localError.value = '租户名称不能为空，且不能超过 128 个字符'
    return
  }
  if (!timezone || timezone.length > 64) {
    localError.value = '请输入不超过 64 个字符的 IANA 时区'
    return
  }

  emit('submit', editing.value ? { name, timezone } : { tenantCode, name, timezone })
}

function handleKeydown(event) {
  if (props.open && event.key === 'Escape') close()
}

watch(() => props.open, async (open) => {
  if (!open) return
  reset()
  await nextTick()
  if (editing.value) nameInput.value?.focus()
  else codeInput.value?.focus()
})

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="platform-modal-backdrop" @click.self="close">
      <section class="platform-modal" role="dialog" aria-modal="true" aria-labelledby="tenant-form-title">
        <header>
          <div class="platform-modal-title">
            <Building2 :size="20" aria-hidden="true" />
            <div><p>平台租户</p><h3 id="tenant-form-title">{{ editing ? '编辑租户' : '创建租户' }}</h3></div>
          </div>
          <button class="icon-button" type="button" :disabled="submitting" title="关闭" aria-label="关闭" @click="close"><X :size="18" /></button>
        </header>

        <p v-if="localError || submitError" class="alert error" role="alert">{{ localError || submitError }}</p>

        <form class="platform-form" @submit.prevent="submit">
          <label v-if="!editing"><span>租户编码</span><input ref="codeInput" v-model="form.tenantCode" autocomplete="off" maxlength="64" placeholder="例如 team-alpha" :disabled="submitting" /></label>
          <label><span>租户名称</span><input ref="nameInput" v-model="form.name" maxlength="128" placeholder="请输入租户名称" :disabled="submitting" /></label>
          <label><span>IANA 时区</span><input v-model="form.timezone" maxlength="64" placeholder="例如 Asia/Shanghai" :disabled="submitting" /></label>
          <div class="platform-modal-actions">
            <button class="secondary-button" type="button" :disabled="submitting" @click="close">取消</button>
            <button type="submit" :disabled="submitting">{{ submitting ? '正在保存...' : editing ? '保存修改' : '创建租户' }}</button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
