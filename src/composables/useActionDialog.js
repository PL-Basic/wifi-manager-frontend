import { reactive, readonly } from 'vue'

const initialState = {
  open: false,
  title: '确认操作',
  message: '',
  confirmLabel: '确认',
  cancelLabel: '取消',
  tone: 'primary',
  inputLabel: '',
  inputPlaceholder: '',
  inputRequired: false
}

const state = reactive({ ...initialState })
let activeResolver = null

function settle(result) {
  if (!activeResolver) return

  const resolve = activeResolver
  activeResolver = null
  state.open = false
  resolve(result)
}

export function requestActionDialog(options = {}) {
  // 同一时刻只允许一个高风险操作等待确认，新的请求会取消旧请求。
  if (activeResolver) settle({ confirmed: false, value: '' })

  Object.assign(state, initialState, options, { open: true })

  return new Promise((resolve) => {
    activeResolver = resolve
  })
}

export async function confirmAction(options = {}) {
  const result = await requestActionDialog(options)
  return result.confirmed
}

export function useActionDialogController() {
  return {
    state: readonly(state),
    confirm(value = '') {
      settle({ confirmed: true, value })
    },
    cancel() {
      settle({ confirmed: false, value: '' })
    }
  }
}
