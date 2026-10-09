import request from './request'

// ========== 管理员接口 (requireRole: admin) ==========
export function adminList(params) {
  return request({ url: '/agent-log/admin/list', method: 'get', params })
}
export function adminSummary(params) {
  return request({ url: '/agent-log/admin/summary', method: 'get', params })
}
export function adminExport(params) {
  return request({ url: '/agent-log/admin/export', method: 'get', params, responseType: 'blob' })
}

// ========== 商户接口 (自动脱敏, 无token/cost) ==========
export function userHistory(params) {
  return request({ url: '/agent-log/user-history', method: 'get', params })
}

// ========== 超级管理员后台接口 ==========
export function adminTenants() {
  return request({ url: '/admin/tenants', method: 'get' })
}
