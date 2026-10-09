// AI 服务熔断器: 失败率过高时熔断,防止第三方 API 雪崩超额扣费
// 阈值: 最近 50 次调用中失败率 >= 50% 且调用数 >= 10 -> 熔断 30 秒
// 半开: 熔断到期后允许一次探测调用,成功则恢复,失败则续熔断

class CircuitBreaker {
  /**
   * @param {number} threshold 失败率阈值(0~1)
   * @param {number} timeout 熔断时长(毫秒)
   * @param {number} minCalls 进入熔断判断所需最小调用数
   */
  constructor(threshold = 0.5, timeout = 30000, minCalls = 10) {
    this.failures = [];      // 滑动窗口,1=失败 0=成功
    this.openUntil = 0;      // 熔断到期时间戳
    this.threshold = threshold;
    this.timeout = timeout;
    this.minCalls = minCalls;
  }

  /**
   * 执行受熔断保护的函数
   * @param {Function} fn 异步函数
   * @returns {Promise<any>} fn 的返回值
   * @throws {Error} 熔断中或 fn 抛出的原始错误
   */
  async exec(fn) {
    // 熔断中直接拒绝
    if (Date.now() < this.openUntil) {
      const err = new Error('AI服务熔断中,请稍后重试');
      err.code = 'CIRCUIT_OPEN';
      throw err;
    }
    try {
      const r = await fn();
      this.failures.push(0); // 成功
      return r;
    } catch (e) {
      this.failures.push(1); // 失败
      // 滑动窗口保持最近 50 条
      if (this.failures.length > 50) this.failures.shift();
      const rate = this.failures.reduce((a, b) => a + b, 0) / this.failures.length;
      // 满足条件触发熔断
      if (this.failures.length >= this.minCalls && rate >= this.threshold) {
        this.openUntil = Date.now() + this.timeout;
      }
      throw e;
    }
  }
}

// 全局单例,所有 LLM 调用共用同一个熔断器
const breaker = new CircuitBreaker();

module.exports = CircuitBreaker;
module.exports.breaker = breaker;
