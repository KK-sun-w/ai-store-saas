import request from './request'

// 查询当日配额(调用次数)
export function getTodayQuota() {
  return request.get('/quota/today')
}

// 扣减一次调用
export function consumeQuota() {
  return request.post('/quota/consume')
}

// 查询 Agent Token 配额(total/used/remaining)
export function getAgentTokenQuota() {
  return request.get('/quota/agent-token')
}