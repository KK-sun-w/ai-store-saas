// 仪表盘 API
import request from '@/api/request'

export function getOverview() {
  return request({ url: '/dashboard/overview', method: 'get' })
}

export function getMonthlySales(months = 12) {
  return request({ url: '/dashboard/monthlySales', method: 'get', params: { months } })
}
