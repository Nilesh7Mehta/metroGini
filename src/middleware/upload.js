import multer from "multer";
import path from "path";
import fs from "fs";

export const createUploader = (folderName, maxSize = 5 * 1024) => {

  const uploadPath = `uploads/${folderName}`;
  // console.log("Upload path:", uploadPath);

  // create folder if not exists
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + path.extname(file.originalname);
      cb(null, uniqueName);
    }
  });

  return multer({
    storage,
    limits: { fileSize: maxSize }
  });
};
