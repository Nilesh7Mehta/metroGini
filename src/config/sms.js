const isEnabledFlag = () => process.env.SPRINGEDGE_ENABLED !== "false";

export const isSmsEnabled = () => {
  if (!isEnabledFlag()) return false;
  return Boolean(
    process.env.SPRINGEDGE_API_KEY?.trim() &&
      process.env.SPRINGEDGE_SENDER?.trim(),
  );
};

export const getSpringEdgeApiKey = () =>
  process.env.SPRINGEDGE_API_KEY?.trim() || null;

export const getSpringEdgeSender = () =>
  process.env.SPRINGEDGE_SENDER?.trim() || null;

export const getSpringEdgeApiUrl = () =>
  process.env.SPRINGEDGE_API_URL?.trim() ||
  "https://web.springedge.com/api/web/send/";
