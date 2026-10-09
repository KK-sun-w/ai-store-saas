import request from './request'

// 进货单列表
export function getPurchaseList(params) {
  return request.get('/purchases', { params })
}

// 进货单详情
export function getPurchaseDetail(id) {
  return request.get(`/purchases/${id}`)
}

// 创建进货单
export function createPurchase(data) {
  return request.post('/purchases', data)
}

// 确认入库
export function confirmPurchase(id) {
  return request.post(`/purchases/${id}/confirm`)
}