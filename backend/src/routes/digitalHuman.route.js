// 数字人形象管理路由
// 全部需 auth + ai:call 权限(店主及以上), 店员不可用
// 上传图片保存到 uploads/digital-human/
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middlewares/auth');
const requirePerm = require('../middlewares/requirePerm');
const { list, create, remove } = require('../controllers/digitalHuman.controller');
const AppError = require('../utils/appError');

// 数字人图片上传目录
const dhDir = path.join(__dirname, '../../uploads/digital-human');
if (!fs.existsSync(dhDir)) fs.mkdirSync(dhDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dhDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|bmp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new AppError(400, 400, '仅支持 jpg/png/webp/bmp 格式图片'), false);
  }
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/digital-human 列表
router.get('/', auth, requirePerm('ai:call'), list);
// POST /api/digital-human 新建(字段名 image)
router.post('/', auth, requirePerm('ai:call'), upload.single('image'), create);
// DELETE /api/digital-human/:id 软删
router.delete('/:id', auth, requirePerm('ai:call'), remove);

module.exports = router;
