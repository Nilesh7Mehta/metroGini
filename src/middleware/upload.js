import multer from "multer";
import path from "path";
import fs from "fs";

const ensureDir = (uploadPath) => {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
};

export const createUploader = (folderName, maxSize = 10 * 1024 * 1024) => {

  const uploadPath = `uploads/${folderName}`;
  ensureDir(uploadPath);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  });

  const uploader = multer({
    storage,
    limits: { fileSize: maxSize }
  });

  // MulterError has no `limit`; the global error handler needs it to report the real max size.
  const single = uploader.single.bind(uploader);
  uploader.single = (fieldName) => {
    const middleware = single(fieldName);
    return (req, res, next) =>
      middleware(req, res, (err) => {
        if (err?.code === "LIMIT_FILE_SIZE") err.limit = maxSize;
        next(err);
      });
  };

  return uploader;
};

/** Stain images → order-stains; damage images → order-damages */
export const createConfirmWeightUploader = (maxSize = 2 * 1024 * 1024) => {
  const folderByField = {
    image: 'order-stains',
    damage_image: 'order-damages',
  };

  Object.values(folderByField).forEach((folder) => {
    ensureDir(`uploads/${folder}`);
  });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const folder = folderByField[file.fieldname] || 'order-stains';
      cb(null, `uploads/${folder}`);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  const middleware = multer({
    storage,
    limits: { fileSize: maxSize },
  }).fields([
    { name: 'image', maxCount: 10 },
    { name: 'damage_image', maxCount: 10 },
  ]);

  return (req, res, next) =>
    middleware(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') err.limit = maxSize;
      next(err);
    });
};
