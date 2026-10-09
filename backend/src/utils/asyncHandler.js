// 包装异步 controller,捕获 reject 并交给全局 errorHandler,避免 try/catch 泛滥
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;