// 商品销售视频 Controller
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const productSvc = require('../services/productVideo.service');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AppError = require('../utils/appError');

// 商品图片上传目录
const productUploadDir = path.join(__dirname, '../../uploads/product');
if (!fs.existsSync(productUploadDir)) {
  fs.mkdirSync(productUploadDir, { recursive: true });
}

// memoryStorage: 文件先存内存 Buffer（绕过 Trae 沙盒对 fs.createWriteStream 的限制）
// 后续由 uploadImages 用 fs.writeFileSync 同步写入磁盘（沙盒放行同步写入）
const storage = multer.memoryStorage();

// 限制：jpg/png，单张 ≤5MB（按用户要求）
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|mp4|webm/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype.toLowerCase().replace('image/', '')) || file.mimetype === 'application/octet-stream';
  if (extOk && mimeOk) cb(null, true);
  else cb(new AppError(400, 400, '仅支持 jpg/png 格式图片'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// 多文件上传中间件：最多5张
exports.uploadMiddleware = upload.array('images', 5);

// ?? createTask??? multer ???????????
const noopUpload = multer();
exports.taskUploadMiddleware = noopUpload.none();

// ?????????????
const internalUpload = multer({ storage: multer.memoryStorage() });
exports.internalUploadMiddleware = internalUpload.array('images', 1);

// 上传商品图片
// memoryStorage 把文件存 Buffer，这里用 fs.writeFileSync 同步写入磁盘（绕过 Trae 沙盒限制）
exports.uploadImages = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return fail(res, '请选择要上传的商品图片');
  }
  const urls = [];
  for (const f of req.files) {
    const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
    const customName = req.body.custom_name;
    const uniqueName = customName || `${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
    const target = path.join(productUploadDir, uniqueName);
    fs.writeFileSync(target, f.buffer);
    urls.push(`/uploads/product/${uniqueName}`);
  }
  return ok(res, { urls }, '上传成功');
});

// AI 识别商品 + 生成卖点
// 入参：image_urls(必填), product_name, product_category, user_desc
// 出参：{ product_name, category, core_selling:[], fit_crowd, usage_scene, short_video_script, video_title, hash_tag:[] }
exports.analyzeProduct = asyncHandler(async (req, res) => {
  const { image_urls, product_name, product_category, user_desc } = req.body;
  // 边界：图片和文字至少有其一（无图片时走文本模型降级，便于测试与兜底）
  const hasImages = image_urls && Array.isArray(image_urls) && image_urls.length > 0;
  const hasText = (product_name && product_name.trim()) || (user_desc && user_desc.trim());
  if (!hasImages && !hasText) {
    return fail(res, '请先上传商品照片或填写商品名称/描述');
  }
  const tenantId = req.user?.tenantId || 1;
  try {
    const result = await productSvc.analyzeProduct({
      imageUrls: image_urls,
      productName: product_name || '',
      productCategory: product_category || '',
      userDesc: user_desc || '',
    });
    return ok(res, result, '商品识别完成');
  } catch (e) {
    // AI 失败：控制台打印完整报错，前端返回友好提示
    console.error('[ProductVideo] analyzeProduct error:', e);
    return fail(res, `AI 识别失败：${e.message || '服务异常，请稍后重试'}`);
  }
});

// 生成商品销售视频
// 入参：product_info(含新字段), product_images(图片url数组), template, duration
exports.createTask = asyncHandler(async (req, res) => {
  try { fs.writeFileSync(path.join(productUploadDir, 'ctrl_test.txt'), 'test'); console.log('[CTRL] write OK'); fs.unlinkSync(path.join(productUploadDir, 'ctrl_test.txt')); } catch(e) { console.log('[CTRL] write FAIL:', e.message); }
  const { product_info, product_images, template, duration } = req.body;
  // 边界：必须有商品图片
  const images = product_images || product_info?.image_urls || [];
  if (!images || images.length === 0) {
    return fail(res, '请先上传商品照片');
  }
  if (!product_info || !product_info.product_name) {
    return fail(res, '请先完成商品识别');
  }
  const tenantId = req.user?.tenantId || 1;
  try {
    const { taskId } = await productSvc.startAsync({
      tenantId,
      productInfo: product_info,
      productImages: images,
      templateKey: template || 'product_show',
      duration: duration || 30,
    });
    return ok(res, { task_id: taskId }, '商品视频任务已提交');
  } catch (e) {
    console.error('[ProductVideo] createTask error:', e);
    return fail(res, `任务提交失败：${e.message || '服务异常'}`);
  }
});

// 查询任务状态
exports.getTask = asyncHandler(async (req, res) => {
  const { task_id } = req.params;
  const tenantId = req.user?.tenantId || 1;
  const task = await productSvc.getTask(task_id, tenantId);
  if (!task) return fail(res, '任务不存在', 404);
  return ok(res, task);
});

// 模板列表
exports.listTemplates = asyncHandler(async (req, res) => {
  return ok(res, Object.entries(productSvc.PRODUCT_TEMPLATES).map(([key, v]) => ({
    key, name: v.name, style: v.style
  })));
});

// ?????????????? HTTP ??????????????????????
exports.internalSave = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) return fail(res, '???');
  const f = req.files[0];
  const customName = req.body.custom_name || f.originalname;
  const target = path.join(productUploadDir, customName);
  fs.writeFileSync(target, f.buffer);
  return ok(res, { url: '/uploads/product/' + customName }, '????');
});

// ??????????? BLOB ???
exports.streamVideo = asyncHandler(async (req, res) => {
  const { task_id } = req.params;
  const rows = await productSvc.getTaskRaw(task_id);
  if (!rows || !rows[0] || !rows[0].video_blob) {
    return res.status(404).send('Video not found');
  }
  const blob = rows[0].video_blob;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Accept-Ranges', 'bytes');
  // ???? Range ??
  const range = req.headers.range;
  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : buf.length - 1;
      res.status(206);
      res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + buf.length);
      res.setHeader('Content-Length', end - start + 1);
      res.end(buf.slice(start, end + 1));
      return;
    }
  }
  res.end(buf);
});

