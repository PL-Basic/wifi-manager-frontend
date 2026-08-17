export const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function generateClientRequestId() {
  const cryptoApi = globalThis.crypto
  let requestId = ''

  if (typeof cryptoApi?.randomUUID === 'function') {
    requestId = cryptoApi.randomUUID()
  } else if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    requestId = `req-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
  } else {
    throw new Error('当前浏览器不支持安全随机请求标识')
  }

  if (!CLIENT_REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error('生成的客户端请求标识格式不正确')
  }
  return requestId
}

export function normalizeTenantCreateInput(input) {
  return {
    tenantCode: String(input?.tenantCode ?? '').trim(),
    name: String(input?.name ?? '').trim(),
    timezone: String(input?.timezone ?? '').trim()
  }
}

export function normalizePortalAuthorizeInput(input) {
  return {
    deviceCode: String(input?.deviceCode ?? '').trim(),
    mac: String(input?.mac ?? '').trim().toUpperCase(),
    ip: String(input?.ip ?? '').trim(),
    deviceInfo: String(input?.deviceInfo ?? '').trim(),
    forceReplaceOldest: Boolean(input?.forceReplaceOldest)
  }
}

export function createClientRequestIdManager(normalizeInput, generate = generateClientRequestId) {
  let activeFingerprint = ''
  let activeRequestId = ''

  function prepare(input) {
    const normalizedInput = normalizeInput(input)
    const fingerprint = canonicalize(normalizedInput)
    if (!activeRequestId || fingerprint !== activeFingerprint) {
      const requestId = generate()
      if (!CLIENT_REQUEST_ID_PATTERN.test(requestId)) {
        throw new Error('生成的客户端请求标识格式不正确')
      }
      activeFingerprint = fingerprint
      activeRequestId = requestId
    }
    return {
      ...normalizedInput,
      clientRequestId: activeRequestId
    }
  }

  const manager = {
    get(input) {
      return prepare(input).clientRequestId
    },
    async run(input, submit) {
      const result = await submit(prepare(input))
      manager.clear()
      return result
    },
    clear() {
      activeFingerprint = ''
      activeRequestId = ''
    }
  }
  return manager
}
