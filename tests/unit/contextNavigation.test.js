import { describe, expect, it } from 'vitest'
import {
  getAccountNavigationItems,
  getNavigationGroups
} from '@/config/navigation'

function itemPaths(groups) {
  return groups.flatMap((group) => group.items.map((item) => item.to))
}

describe('workspace navigation', () => {
  it('shows only platform workspace entries to a platform super administrator', () => {
    const groups = getNavigationGroups(0, { contextType: 'PLATFORM' })

    expect(groups.map((group) => group.key)).toEqual(['platform'])
    expect(itemPaths(groups)).toEqual([
      '/app/platform/tenants',
      '/app/platform/saas-plans'
    ])
  })

  it('does not expose the platform workspace to an ordinary administrator', () => {
    const groups = getNavigationGroups(1, {
      contextType: 'TENANT',
      tenantCode: 'tenant-a'
    })
    const paths = itemPaths(groups)

    expect(groups.some((group) => group.key === 'platform')).toBe(false)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.every((path) => path.startsWith('/app/t/tenant-a/'))).toBe(true)
  })

  it('hides tenant-bound account entries in platform context', () => {
    expect(getAccountNavigationItems({ contextType: 'PLATFORM' }).map((item) => item.to))
      .toEqual(['/app/account/profile', '/app/account/security'])
  })
})
