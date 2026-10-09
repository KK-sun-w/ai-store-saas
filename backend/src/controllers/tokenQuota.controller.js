const tokenQuotaService = require('../services/tokenQuota.service');
const { ok, fail } = require('../utils/response');

// 管理员: 获取所有租户 Token 使用统计
exports.adminStats = async (req, res, next) => {
  try {
    const { page, pageSize, tenantId, month } = req.query;
    const result = await tokenQuotaService.adminStats({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      tenantId: tenantId || undefined,
      month: month || undefined,
    });
    ok(res, result);
  } catch (e) { next(e); }
};

// 管理员: 设置某租户的月度 Token 额度
exports.adminSetQuota = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { tokenLimit, quotaMonth } = req.body;
    if (tokenLimit == null || tokenLimit < 0) {
      return fail(res, 'tokenLimit 不能为空且必须 >= 0 (0=不限量)', 400);
    }
    const result = await tokenQuotaService.adminSetQuota(Number(tenantId), quotaMonth, Number(tokenLimit));
    ok(res, result);
  } catch (e) { next(e); }
};

// 商户: 查询自己本月的 Token 额度
exports.myQuota = async (req, res, next) => {
  try {
    const quota = await tokenQuotaService.getMonthQuota(req.user.tenantId);
    ok(res, quota);
  } catch (e) { next(e); }
};
