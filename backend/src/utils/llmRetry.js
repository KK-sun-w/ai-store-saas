// AI 调用指数退避重试
// 仅重试 网络错误 / 超时 / 5xx;4xx(参数错误、鉴权失败)直接抛出不重试
// 默认 3 次重试, 基础间隔 500ms, 指数退避 500/1000/2000ms

/**
 * 判断错误是否可重试
 */
function isRetryable(err) {
  // 无 response -> 网络错误(ECONNABORTED/ENOTFOUND/ETIMEDOUT)
  if (!err.response) return true;
  // axios 超时
  if (err.code === 'ECONNABORTED') return true;
  // 5xx 服务端错误可重试
  if (err.response.status >= 500) return true;
  // 4xx 客户端错误不重试
  return false;
}

/**
 * 带重试执行异步函数
 * @param {Function} fn 无参异步函数,返回调用结果
 * @param {object} opts { retries=3, base=500 }
 * @returns {Promise<any>}
 */
async function withRetry(fn, { retries = 3, base = 500 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || i === retries) throw e;
      // 指数退避: base * 2^i
      await new Promise(r => setTimeout(r, base * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

module.exports = { withRetry, isRetryable };
