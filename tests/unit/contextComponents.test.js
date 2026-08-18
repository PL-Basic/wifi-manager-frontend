import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeviceCommandPanel from '@/components/network/DeviceCommandPanel.vue'
import SessionDetailDrawer from '@/components/network/SessionDetailDrawer.vue'
import TenantSwitcher from '@/components/app/TenantSwitcher.vue'

const apiMocks = vi.hoisted(() => ({
  getDeviceCommands: vi.fn(),
  getMyTenants: vi.fn(),
  getPlatformTenants: vi.fn(),
  revokeSession: vi.fn(),
  confirmAction: vi.fn()
}))

vi.mock('@/api/devices', () => ({
  blockTraffic: vi.fn(),
  disconnectMac: vi.fn(),
  getDeviceCommands: apiMocks.getDeviceCommands
}))

vi.mock('@/api/sessions', () => ({
  revokeSession: apiMocks.revokeSession
}))

vi.mock('@/api/tenants', () => ({
  getMyTenants: apiMocks.getMyTenants,
  getPlatformTenants: apiMocks.getPlatformTenants
}))

vi.mock('@/composables/useActionDialog', () => ({
  confirmAction: apiMocks.confirmAction
}))

const emptyPage = {
  data: {
    code: 200,
    data: { records: [] }
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('context-bound component cleanup', () => {
  it('drops an old device list and clears the command draft when the device changes', async () => {
    const pending = []
    apiMocks.getDeviceCommands.mockImplementation(() => new Promise((resolve) => {
      pending.push(resolve)
    }))

    const wrapper = mount(DeviceCommandPanel, {
      props: { deviceCode: 'device-a' }
    })
    await vi.waitFor(() => expect(pending).toHaveLength(1))

    await wrapper.get('input[placeholder="AA:BB:CC:DD:EE:FF"]')
      .setValue('AA:BB:CC:DD:EE:FF')
    await wrapper.setProps({ deviceCode: 'device-b' })
    await vi.waitFor(() => expect(pending).toHaveLength(2))

    pending[1]({
      data: {
        code: 200,
        data: {
          records: [{ requestId: 'new-request', status: 1 }]
        }
      }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('new-request')

    pending[0]({
      data: {
        code: 200,
        data: {
          records: [{ requestId: 'old-request', status: 2 }]
        }
      }
    })
    await flushPromises()

    expect(wrapper.get('input[placeholder="AA:BB:CC:DD:EE:FF"]').element.value)
      .toBe('')
    expect(wrapper.text()).toContain('new-request')
    expect(wrapper.text()).not.toContain('old-request')
    wrapper.unmount()
  })

  it('drops a late tenant list after the active context changes', async () => {
    let release
    apiMocks.getMyTenants.mockImplementation(() => new Promise((resolve) => {
      release = resolve
    }))

    const wrapper = mount(TenantSwitcher, {
      props: {
        role: 1,
        context: {
          contextType: 'TENANT',
          tenantId: '1',
          tenantCode: 'tenant-a'
        }
      }
    })

    await wrapper.get('.tenant-switcher__trigger').trigger('click')
    await wrapper.setProps({
      context: {
        contextType: 'TENANT',
        tenantId: '2',
        tenantCode: 'tenant-b'
      }
    })
    release({
      data: {
        data: [{ tenantId: '3', tenantCode: 'old-tenant', status: 'ACTIVE' }]
      }
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('old-tenant')
    expect(wrapper.find('.tenant-switcher__menu').exists()).toBe(false)
    wrapper.unmount()
  })

  it('stops revoke polling when the session drawer unmounts', async () => {
    apiMocks.getDeviceCommands.mockResolvedValue(emptyPage)
    apiMocks.confirmAction.mockResolvedValue(true)
    apiMocks.revokeSession.mockResolvedValue({
      data: {
        code: 200,
        data: { sessionId: 'session-a', status: 0 }
      }
    })
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const wrapper = mount(SessionDetailDrawer, {
      attachTo: document.body,
      props: {
        open: true,
        session: { sessionId: 'session-a', status: 1 }
      }
    })
    await flushPromises()

    document.body.querySelector('.danger-button').click()
    await flushPromises()

    expect(setIntervalSpy).toHaveBeenCalled()
    wrapper.unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
