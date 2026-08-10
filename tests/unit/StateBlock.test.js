import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StateBlock from '@/components/StateBlock.vue'

describe('StateBlock', () => {
  it('renders stable default empty state without optional text', () => {
    const wrapper = mount(StateBlock)

    expect(wrapper.classes()).toContain('state-block--empty')
    expect(wrapper.get('strong').text()).toBe('暂无数据')
    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('renders explicit state, title and detail text', () => {
    const wrapper = mount(StateBlock, {
      props: {
        type: 'error',
        title: '加载失败',
        text: '请稍后重试'
      }
    })

    expect(wrapper.classes()).toContain('state-block--error')
    expect(wrapper.get('strong').text()).toBe('加载失败')
    expect(wrapper.get('p').text()).toBe('请稍后重试')
  })
})
