import request from './request'

// 开销列表
export function getExpenseList(params) {
  return request.get('/expenses', { params })
}

// 开销详情
export function getExpenseDetail(id) {
  return request.get(`/expenses/${id}`)
}

// 创建开销
export function createExpense(data) {
  return request.post('/expenses', data)
}

// 更新开销
export function updateExpense(id, data) {
  return request.put(`/expenses/${id}`, data)
}

// 删除开销
export function deleteExpense(id) {
  return request.delete(`/expenses/${id}`)
}