export const API_CONNECTIVITY_EVENT = 'wifi:api-connectivity'

let currentState = {
  status: 'unknown',
  message: '',
  occurredAt: 0
}

export function getApiConnectivitySnapshot() {
  return { ...currentState }
}

export function reportApiConnectivity(detail) {
  currentState = {
    status: detail?.status || 'unknown',
    message: detail?.message || '',
    occurredAt: Date.now()
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(API_CONNECTIVITY_EVENT, {
      detail: currentState
    }))
  }
}
