import { describe, expect, it } from 'vitest'
import {
  cancelActionDialog,
  requestActionDialog,
  useActionDialogController
} from '@/composables/useActionDialog'

describe('context-bound action dialog', () => {
  it('closes a pending dangerous action without confirming it', async () => {
    const controller = useActionDialogController()
    const result = requestActionDialog({
      title: '删除设备',
      tone: 'danger'
    })

    expect(controller.state.open).toBe(true)
    cancelActionDialog()

    await expect(result).resolves.toEqual({ confirmed: false, value: '' })
    expect(controller.state.open).toBe(false)
  })
})
