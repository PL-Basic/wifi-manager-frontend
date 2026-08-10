function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

export function createUnsignedTestToken(payload = {}) {
  return [
    encodeJson({ alg: 'none', typ: 'JWT' }),
    encodeJson(payload),
    'test-only-signature'
  ].join('.')
}
