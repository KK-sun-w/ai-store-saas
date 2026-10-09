// 轻量参数校验中间件工厂
const AppError = require('../utils/appError');

/**
 * 校验规则示例:
 * { field: 'name', required: true, type: 'string', min: 1, max: 64, message: '名称不能为空' }
 * type 取值: string | int | number | boolean | array
 * min/max: 对标量(数字)为数值范围,对 string/array 为长度
 * pattern: 正则校验(字符串)
 */
function validate(rules) {
  return (req, res, next) => {
    // 合并参数来源(仅用于校验,tenant_id 之类的字段由 auth 中间件覆盖)
    const source = Object.assign({}, req.query, req.params, req.body);

    for (const rule of rules) {
      const val = source[rule.field];
      const empty = val === undefined || val === null || val === '';

      if (empty) {
        if (rule.required) {
          return next(new AppError(400, 400, rule.message || `参数 ${rule.field} 不能为空`));
        }
        continue;
      }

      const err = (msg) => new AppError(400, 400, rule.message || msg);

      switch (rule.type) {
        case 'int': {
          if (!Number.isInteger(Number(val))) return next(err(`参数 ${rule.field} 必须为整数`));
          if (rule.min !== undefined && Number(val) < rule.min) return next(err(`参数 ${rule.field} 不能小于 ${rule.min}`));
          if (rule.max !== undefined && Number(val) > rule.max) return next(err(`参数 ${rule.field} 不能大于 ${rule.max}`));
          break;
        }
        case 'number': {
          if (Number.isNaN(Number(val))) return next(err(`参数 ${rule.field} 必须为数字`));
          if (rule.min !== undefined && Number(val) < rule.min) return next(err(`参数 ${rule.field} 不能小于 ${rule.min}`));
          if (rule.max !== undefined && Number(val) > rule.max) return next(err(`参数 ${rule.field} 不能大于 ${rule.max}`));
          break;
        }
        case 'boolean': {
          if (!['true', 'false', '1', '0', true, false].includes(val)) return next(err(`参数 ${rule.field} 必须为布尔值`));
          break;
        }
        case 'array': {
          if (!Array.isArray(val)) return next(err(`参数 ${rule.field} 必须为数组`));
          if (rule.min !== undefined && val.length < rule.min) return next(err(`参数 ${rule.field} 至少 ${rule.min} 项`));
          if (rule.max !== undefined && val.length > rule.max) return next(err(`参数 ${rule.field} 至多 ${rule.max} 项`));
          break;
        }
        case 'string':
        default: {
          const s = String(val);
          if (rule.min !== undefined && s.length < rule.min) return next(err(`参数 ${rule.field} 长度不能小于 ${rule.min}`));
          if (rule.max !== undefined && s.length > rule.max) return next(err(`参数 ${rule.field} 长度不能大于 ${rule.max}`));
          if (rule.pattern && !rule.pattern.test(s)) return next(err(`参数 ${rule.field} 格式不正确`));
          break;
        }
      }
    }

    return next();
  };
}

module.exports = validate;