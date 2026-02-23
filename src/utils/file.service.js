import fs from "fs";
import path from "path";

export const deleteFile = async (filePath) => {
  if (!filePath) return;

  const fullPath = path.join(process.cwd(), filePath);

  try {
    if (fs.existsSync(fullPath)) {
      // console.log("Deleting file:", fullPath);
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    // console.error("File delete error:", error.message);
  }
};
