const productService = require('../services/product.service');
const { ok } = require('../utils/response');

const list = async (req, res, next) => {
  try { const tenantId = req.user.tenantId; const result = await productService.list(tenantId, req.query, { role: req.user.role }); ok(res, result); } catch(e){ next(e); }
};
const detail = async (req, res, next) => {
  try { const tenantId = req.user.tenantId; const row = await productService.detail(tenantId, Number(req.params.id), { role: req.user.role }); ok(res, row); } catch(e){ next(e); }
};
const create = async (req, res, next) => {
  try { const tenantId = req.user.tenantId; const data = await productService.create(tenantId, req.body); ok(res, data, '创建成功', 201); } catch(e){ next(e); }
};
const update = async (req, res, next) => {
  try { const tenantId = req.user.tenantId; const data = await productService.update(tenantId, Number(req.params.id), req.body); ok(res, data); } catch(e){ next(e); }
};
const remove = async (req, res, next) => {
  try { const tenantId = req.user.tenantId; await productService.remove(tenantId, Number(req.params.id), { role: req.user.role }); ok(res, { id: Number(req.params.id) }); } catch(e){ next(e); }
};
const getByBarcode = async (req, res, next) => {
  try { const tenantId = req.user.tenantId; const row = await productService.getByBarcode(tenantId, req.params.barcode); ok(res, row); } catch(e){ next(e); }
};
module.exports = { list, detail, getByBarcode, create, update, remove };
