const fs = require('fs');
const path = require('path');
const multer = require('multer');
const slugify = require('slugify');
const { isSupabaseMode } = require('../../../config/backend');

const useMemoryStorage = isSupabaseMode(process.env);

let storage;
if (useMemoryStorage) {
  storage = multer.memoryStorage();
} else {
  const projectRoot = path.resolve(__dirname, '../../../..');
  const uploadDir = path.join(projectRoot, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      const safe = slugify(base, { lower: true, strict: true }) || 'asset';
      cb(null, `${Date.now()}-${safe}${ext}`);
    },
  });
}

function fileFilter(_req, file, cb) {
  const allowed = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
  cb(allowed ? null : new Error('이미지/영상만 업로드할 수 있습니다.'), allowed);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: useMemoryStorage ? 20 * 1024 * 1024 : 150 * 1024 * 1024 },
});

module.exports = upload;
