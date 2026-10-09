import request from './request'

// 销售单列表
export function getSalesList(params) {
  return request.get('/sales', { params })
}

// 销售单详情
export function getSalesDetail(id) {
  return request.get(`/sales/${id}`)
}

// 创建销售单
export function createSales(data) {
  return request.post('/sales', data)
}