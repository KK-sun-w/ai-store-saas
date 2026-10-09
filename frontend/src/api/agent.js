import request from './request'

export function agentDispatch(q) {
  return request({ url: '/ai/agent-dispatch', method: 'POST', data: { user_query: q } })
}
export function runInventoryAgent(i) {
  return request({ url: '/ai/agent/inventory', method: 'POST', data: { input: i } })
}
export function runProductAgent(i) {
  return request({ url: '/ai/agent/product', method: 'POST', data: { input: i } })
}
export function runMarketingAgent(i) {
  return request({ url: '/ai/agent/marketing', method: 'POST', data: { input: i } })
}
export function runSalesAgent(i) {
  return request({ url: '/ai/agent/sales', method: 'POST', data: { input: i } })
}
export function runProcurementAgent(i) {
  return request({ url: '/ai/agent/procurement', method: 'POST', data: { input: i } })
}
// 门店综合业务 Agent (统一入口)
export function runStoreBusinessAgent(input, history = []) {
  return request({ url: '/ai/agent/store-business', method: 'POST', data: { input, history } })
}
