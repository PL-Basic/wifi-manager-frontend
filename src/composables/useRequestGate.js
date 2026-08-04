import { onScopeDispose } from 'vue'

// 每个 key 都有独立版本号，用于阻止旧请求覆盖新的筛选、分页或账号数据。
export function useRequestGate() {
  const versions = new Map()

  function begin(key = 'default') {
    const version = (versions.get(key) || 0) + 1
    versions.set(key, version)
    return version
  }

  function isCurrent(version, key = 'default') {
    return versions.get(key) === version
  }

  function invalidate(key = 'default') {
    versions.set(key, (versions.get(key) || 0) + 1)
  }

  function invalidateAll() {
    for (const key of versions.keys()) invalidate(key)
  }

  onScopeDispose(invalidateAll)

  return { begin, isCurrent, invalidate, invalidateAll }
}
