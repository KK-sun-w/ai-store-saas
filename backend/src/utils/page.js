// 分页参数归一化
function getPageParams(params = {}) {
  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(params.pageSize, 10) || 10, 1), 100);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

module.exports = { getPageParams };