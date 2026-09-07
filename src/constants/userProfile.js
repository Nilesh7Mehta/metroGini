/** Shared default avatar for new users (do not delete this file). */
export const DEFAULT_USER_PROFILE_IMAGE =
  "uploads/profile/metrogini_avatae.jpeg";

export const isDefaultUserProfileImage = (filePath) => {
  if (!filePath) return false;
  const normalized = String(filePath).replace(/\\/g, "/").replace(/^\//, "");
  return (
    normalized === DEFAULT_USER_PROFILE_IMAGE ||
    normalized.endsWith("/metrogini_avatae.jpeg") ||
    normalized.endsWith("metrogini_avatae.jpeg")
  );
};
