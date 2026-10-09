// 文件上传路由(需登录)
// 上传图片保存到 uploads/ 目录,返回可访问的相对 URL
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const { ok } = require('../utils/response');
const AppError = require('../utils/appError');

// 确保 uploads 目录存在(项目根目录下)
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// multer 存储配置:按日期分目录,文件名加时间戳防冲突
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
    cb(null, uniqueName);
  },
});

// 文件过滤:只允许图片
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|bmp/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype.toLowerCase());
  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    cb(new AppError(400, 400, '仅支持 jpg/png/gif/webp/bmp 格式图片'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// 上传接口:POST /api/upload,字段名 file
router.post('/', auth, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, 400, '请选择要上传的文件');
    }
    // 返回相对 URL,前端可直接访问 http://host/uploads/xxx.jpg
    const url = `/uploads/${req.file.filename}`;
    return ok(res, { url }, '上传成功');
  } catch (e) {
    next(e);
  }
});

module.exports = router;


