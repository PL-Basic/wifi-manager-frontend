import http from './http'

export function register(data) {
  return http.post('/auth/register', data)
}

export function login(data) {
  return http.post('/auth/login', data)
}

export function sendVerifyCode(data){
  return http.post('/auth/codes',data)
}

export function loginByVerifyCode(data){
  return http.post('auth/code-login',data)
}