// 数字人形象管理 Controller
// 列表 / 新建(上传图片+命名) / 删除(软删 status=0)
// 仅店主及以上可操作(ai:call 权限), 店员不可见
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { query } = require('../config/db');
const { logger } = require('../utils/logger');

/**
 * GET /api/digital-human
 * 列出当前租户下启用的数字人形象
 */
exports.list = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const rows = await query(
    `SELECT id, name, image_url, description, status, create_time
     FROM ai_digital_human WHERE tenant_id = ? ORDER BY id DESC`,
    [tenantId]
  );
  return ok(res, { list: rows, total: rows.length });
});

/**
 * POST /api/digital-human
 * 新建数字人形象(multipart: file=人像图片, name, description)
 */
exports.create = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { name, description } = req.body;
  if (!name) return fail(res, '请填写形象名称');
  if (!req.file) return fail(res, '请上传人像图片');
  const imageUrl = `/uploads/digital-human/${req.file.filename}`;
  const result = await query(
    `INSERT INTO ai_digital_human (tenant_id, name, image_url, description) VALUES (?,?,?,?)`,
    [tenantId, name, imageUrl, description || null]
  );
  logger.info(`[DigitalHuman] 租户${tenantId}创建数字人 id=${result.insertId} name=${name}`);
  return ok(res, { id: result.insertId, name, image_url: imageUrl, description }, '数字人创建成功');
});

/**
 * DELETE /api/digital-human/:id
 * 软删除数字人(置 status=0)
 */
exports.remove = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const id = Number(req.params.id);
  if (!id) return fail(res, '参数错误');
  const result = await query(
    `UPDATE ai_digital_human SET status = 0 WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  if (result.affectedRows === 0) return fail(res, '数字人不存在或无权删除', 404);
  logger.info(`[DigitalHuman] 租户${tenantId}删除数字人 id=${id}`);
  return ok(res, { id }, '已删除');
});
