<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, X } from 'lucide-vue-next'
import { useActionDialogController } from '@/composables/useActionDialog'

const { state, confirm, cancel } = useActionDialogController()
const inputValue = ref('')
const inputError = ref('')
const inputElement = ref(null)
const confirmElement = ref(null)

watch(
  () => state.open,
  async (open) => {
    inputValue.value = ''
    inputError.value = ''
    if (open && state.inputLabel) {
      await nextTick()
      inputElement.value?.focus()
    } else if (open) {
      await nextTick()
      confirmElement.value?.focus()
    }
  }
)

function submit() {
  const value = inputValue.value.trim()
  if (state.inputRequired && !value) {
    inputError.value = `${state.inputLabel}不能为空`
    return
  }
  confirm(value)
}

function handleKeydown(event) {
  if (state.open && event.key === 'Escape') cancel()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  cancel()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.open"
      class="modal-backdrop action-dialog-backdrop"
      role="presentation"
      @click.self="cancel"
      @keydown.esc="cancel"
    >
      <form
        class="glass-panel modal-panel action-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-label="state.title"
        @submit.prevent="submit"
      >
        <header class="modal-header">
          <div class="action-dialog-title">
            <AlertTriangle :size="20" aria-hidden="true" />
            <h3>{{ state.title }}</h3>
          </div>
          <button class="icon-button" type="button" title="关闭" aria-label="关闭" @click="cancel">
            <X :size="18" />
          </button>
        </header>

        <p class="action-dialog-message">{{ state.message }}</p>

        <label v-if="state.inputLabel">
          <span>{{ state.inputLabel }}</span>
          <textarea
            ref="inputElement"
            v-model="inputValue"
            :placeholder="state.inputPlaceholder"
            rows="3"
            @input="inputError = ''"
          ></textarea>
          <small v-if="inputError" class="field-error">{{ inputError }}</small>
        </label>

        <footer class="action-dialog-actions">
          <button class="secondary-button" type="button" @click="cancel">
            {{ state.cancelLabel }}
          </button>
          <button ref="confirmElement" :class="state.tone === 'danger' ? 'danger-button' : ''" type="submit">
            {{ state.confirmLabel }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>
