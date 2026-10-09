const tokenQuotaService = require('../services/tokenQuota.service');
const { fail } = require('../utils/response');

function estimateInputTokens(req) {
  const body = req.body || {};
  const str = JSON.stringify(body);
  const cjk = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
  return Math.ceil(cjk * 1.5 + (str.length - cjk) * 0.25);
}

async function checkTokenQuota(req, res, next) {
  try {
    const estimated = estimateInputTokens(req);
    const result = await tokenQuotaService.checkQuota(req.user.tenantId, estimated);
    if (!result.ok) {
      return fail(res, '本月 Token 额度已用完 (已用' + result.quota.tokenUsed + '/' + result.quota.tokenLimit + ')', 429);
    }
    req.estimatedTokens = estimated;
    next();
  } catch (e) {
    return fail(res, 'Token 额度检查失败: ' + e.message, 500);
  }
}

module.exports = checkTokenQuota;
