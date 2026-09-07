import fs from "fs";
import path from "path";
import { isDefaultUserProfileImage } from "../constants/userProfile.js";

export const deleteFile = async (filePath) => {
  if (!filePath) return;
  // Never delete the shared MetroGini default avatar
  if (isDefaultUserProfileImage(filePath)) return;

  const fullPath = path.join(process.cwd(), filePath);

  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    // ignore
  }
};

export const cleanupAndThrow = async ( filePath ,message, status = 400) => {
  console.log("Insode");
    if (filePath) {
      await deleteFile(filePath).catch(() => {});
    }
    throw { status, message };
  };
