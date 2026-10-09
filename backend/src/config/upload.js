const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../public/upload'));
  },
  filename: function (req, file, cb) {
    const suffix = path.extname(file.originalname);
    const filename = Date.now() + suffix;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowType = ['image/jpeg','image/png'];
  if(allowType.includes(file.mimetype)){
    cb(null,true);
  }else{
    cb(new Error('只允许jpg、png图片'),false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits:{fileSize: 2*1024*1024}
});

// 注意：这里改成对象导出，统一格式
module.exports = { upload };