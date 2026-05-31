import axios from 'axios'
import { clearSession, getToken, isTokenExpired } from '@/utils/session'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000
})

function isPublicAuthRequest(config) {
  const url = config?.url || ''
  return [
    '/auth/login',
    '/auth/register',
    '/auth/codes',
    '/auth/code-login'
  ].some((path) => url.includes(path))
}

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    if (isTokenExpired()) {
      clearSession('登录状态已过期，请重新登录')
      window.location.href = '/login'
      return Promise.reject(new Error('token expired'))
    }
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isPublicAuthRequest(error.config)) {
      clearSession('登录状态已过期，请重新登录')
      window.location.href = '/login'
    }
    if (error.response?.status === 403) {
      sessionStorage.setItem('authMessage', '当前账号没有权限执行该操作')
    }
    return Promise.reject(error)
  }
)

export default http
