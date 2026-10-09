// 库存盘点控制器
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const inventoryService = require('../services/inventory.service');

// 盘点调整:POST /inventory/checkAdjust
// 入参:product_id、adjust_num(正数加/负数减)、remark(可选)
exports.checkAdjust = asyncHandler(async (req, res) => {
  const { product_id, adjust_num, remark } = req.body;
  const data = await inventoryService.inventoryCheck(
    req.user.tenantId,
    product_id,
    adjust_num,
    remark
  );
  return ok(res, data, '盘点调整成功');
});