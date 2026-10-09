// 店铺长期记忆 API
import request from './request'

// 分页查询记忆列表(支持类型/来源/权重筛选)
export function getMemories(params) {
  return request.get('/shop-memory', { params })
}

// 查询单条记忆详情
export function getMemoryDetail(id) {
  return request.get(`/shop-memory/${id}`)
}

// 查询权重最高的N条记忆
export function getTopMemories(limit = 10) {
  return request.get('/shop-memory/top', { params: { limit } })
}

// 新增记忆
export function createMemory(data) {
  return request.post('/shop-memory', data)
}

// 更新记忆
export function updateMemory(id, data) {
  return request.put(`/shop-memory/${id}`, data)
}

// 删除记忆
export function deleteMemory(id) {
  return request.delete(`/shop-memory/${id}`)
}

// 查看注入prompt的记忆文本(调试用)
export function getInjectPreview(limit = 8) {
  return request.get('/shop-memory/inject', { params: { limit } })
}
