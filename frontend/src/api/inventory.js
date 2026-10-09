import request from './request'
 
// 库存盘点调整
// 入参:product_id、adjust_num(正数加/负数减)、remark(可选)
export function checkAdjust(data) {
  return request.post('/inventory/checkAdjust', data)
}