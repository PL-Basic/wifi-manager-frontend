import axios from 'axios'
import { API_BASE_URL } from '@/config/runtime'
import { getClientInstanceId } from '@/utils/session'

const sessionTransport = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true
})

function clientHeaders() {
  return {
    'X-Client-Instance-Id': getClientInstanceId()
  }
}

export async function requestSessionRefresh() {
  const response = await sessionTransport.post('/auth/refresh', null, {
    headers: clientHeaders()
  })
  return response.data
}

export async function requestRefreshStepUp(data) {
  const response = await sessionTransport.post('/auth/refresh/step-up', data, {
    headers: clientHeaders()
  })
  return response.data
}

export async function requestSessionLogout() {
  const response = await sessionTransport.post('/auth/logout', null, {
    headers: clientHeaders()
  })
  return response.data
}
