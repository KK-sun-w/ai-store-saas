import request from '@/api/request'

// 管理员: 获取所有租户 Token 使用统计
export function adminTokenStats(params) {
  return request({ url: '/token-quota/admin/stats', method: 'get', params })
}

// 管理员: 设置某租户月度 Token 额度
export function adminSetTokenQuota(tenantId, data) {
  return request({ url: `/token-quota/admin/quota/${tenantId}`, method: 'put', data })
}

// 商户: 查询自己本月 Token 额度
export function myTokenQuota() {
  return request({ url: '/token-quota/my', method: 'get' })
}

