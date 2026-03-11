export const getImageUrl = (req, path) => {
  if (!path) return null;

  const baseUrl = `${req.protocol}://${req.get("host")}`;

  const clean = (p) =>
    `${baseUrl}/${p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/")}`;

  if (Array.isArray(path)) {
    return path.map(p => clean(p));
  }

  return clean(path);
};