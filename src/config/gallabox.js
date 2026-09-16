/** Outbound WhatsApp via Gallabox Messages API. Default OFF until explicitly enabled. */

const truthy = (v) => String(v || "").toLowerCase() === "true";

export const isGallaboxWhatsappEnabled = () => {
  if (!truthy(process.env.GALLABOX_WHATSAPP_ENABLED)) return false;
  return Boolean(
    process.env.GALLABOX_API_KEY?.trim() &&
      process.env.GALLABOX_API_SECRET?.trim() &&
      process.env.GALLABOX_CHANNEL_ID?.trim(),
  );
};

export const getGallaboxApiKey = () =>
  process.env.GALLABOX_API_KEY?.trim() || null;

export const getGallaboxApiSecret = () =>
  process.env.GALLABOX_API_SECRET?.trim() || null;

export const getGallaboxChannelId = () =>
  process.env.GALLABOX_CHANNEL_ID?.trim() || null;

export const getGallaboxMessagesUrl = () =>
  process.env.GALLABOX_MESSAGES_URL?.trim() ||
  "https://server.gallabox.com/devapi/messages/whatsapp";

export const getGallaboxTimeoutMs = () =>
  Number(process.env.GALLABOX_MESSAGES_TIMEOUT_MS) || 8000;
