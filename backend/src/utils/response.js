// 统一接口返回格式
// 成功: { code: 0,     message: 'ok',       data: ... }
// 失败: { code: 非0,   message: 错误信息,    data: null }

function ok(res, data = null, message = 'ok') {
  return res.status(200).json({ code: 0, message, data });
}

// 分页结果封装
function okPage(res, { list, total, page, pageSize }) {
  return res.status(200).json({
    code: 0,
    message: 'ok',
    data: { list, total, page, pageSize },
  });
}


function fail(res, message = '错误', httpStatus = 400) {
  return res.status(httpStatus).json({ code: httpStatus, message, data: null });
}

module.exports = { ok, okPage, fail };