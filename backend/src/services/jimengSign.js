// 火山引擎 V4 HMAC-SHA256 签名(即梦视频 API 用)
// 纯 Node crypto 实现, 无第三方依赖
// 签名步骤: 规范请求 → 待签字符串 → 派生密钥(kDate→kRegion→kService) → HMAC 签名
// 参考: https://www.volcengine.com/docs/6569/1776820
const crypto = require('crypto');

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/**
 * 规范化 query string: 按 key 字典序排列, key/value 做 URI 编码
 */
function canonicalQuery(query) {
  if (!query) return '';
  const entries = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [String(k), String(v)]);
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/**
 * 构造火山引擎 V4 签名
 * @param {object} opts
 * @param {string} opts.method HTTP 方法(大写)
 * @param {string} opts.host 主机名(如 visual.volcengineapi.com)
 * @param {string} opts.path 请求路径(如 /)
 * @param {object} opts.query 查询参数对象
 * @param {string} opts.body 请求体字符串(GET 可为空)
 * @param {string} opts.ak Access Key
 * @param {string} opts.sk Secret Key
 * @returns {{authorization: string, headers: object}} 需要附加到请求的 headers
 */
function sign({ method, host, path, query, body, ak, sk }) {
  const now = new Date();
  // x-date 格式: YYYYMMDDTHHmmssZ
  const xDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const shortDate = xDate.slice(0, 8); // YYYYMMDD
  const payloadHash = sha256Hex(body || '');

  // 规范请求
  const canonQuery = canonicalQuery(query);
  const canonicalRequest = [
    method.toUpperCase(),
    path || '/',
    canonQuery,
    `host:${host}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${xDate}`,
    '',
    'host;x-content-sha256;x-date',
    payloadHash,
  ].join('\n');

  const canonHash = sha256Hex(canonicalRequest);

  // 派生密钥: kDate → kRegion → kService
  const kDate = hmac(sk, shortDate);
  const kRegion = hmac(kDate, 'cn-north-1');
  const kService = hmac(kRegion, 'cv');
  const kSigning = hmac(kService, 'request');

  // 待签字符串
  const credentialScope = `${shortDate}/cn-north-1/cv/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    canonHash,
  ].join('\n');

  const signature = hmacHex(kSigning, stringToSign);

  const authorization =
    `HMAC-SHA256 Credential=${ak}/${credentialScope}, ` +
    `SignedHeaders=host;x-content-sha256;x-date, ` +
    `Signature=${signature}`;

  return {
    authorization,
    headers: {
      Host: host,
      'x-date': xDate,
      'x-content-sha256': payloadHash,
      Authorization: authorization,
    },
  };
}

module.exports = { sign, sha256Hex, canonicalQuery };
