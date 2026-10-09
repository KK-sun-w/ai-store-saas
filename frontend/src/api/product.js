import request from './request'

// 商品列表(分页)
export function getProductList(params) {
  return request.get('/products', { params })
}

// 商品详情
export function getProductDetail(id) {
  return request.get(`/products/${id}`)
}

// 创建商品
export function createProduct(data) {
  return request.post('/products', data)
}

// 更新商品
export function updateProduct(id, data) {
  return request.put(`/products/${id}`, data)
}

// 删除商品
export function deleteProduct(id) {
  return request.delete(`/products/${id}`)
}
// 根据条码查询商品
export function getProductByBarcode(barcode) {
  return request.get('/products/by-barcode/' + encodeURIComponent(barcode))
}
