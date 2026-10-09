// 业务异常类:携带 HTTP 状态码与业务码,由全局 errorHandler 统一处理
class AppError extends Error {
  /**
   * @param {number} status  HTTP 状态码
   * @param {number} code    业务返回码(与接口返回的 code 保持一致)
   * @param {string} message 友好错误提示
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = AppError;