import request from './request'

// 商户注册
export function register(data) {
  return request.post('/auth/register', data)
}

// 账号登录
export function login(data) {
  return request.post('/auth/login', data)
}