export const SLOT_AVAILABILITY_DAYS =
  Number(process.env.SLOT_AVAILABILITY_DAYS) || 7;

  export const SLOT_AVAILABILITY_DAYS_FOR_DELIVERY =
  Number(process.env.SLOT_AVAILABILITY_DAYS_FOR_DELIVERY) || 75;

export const SLOT_AVAILABILITY_MAX_DAYS =
  Number(process.env.SLOT_AVAILABILITY_MAX_DAYS) || 15;

/** Same-day pickup is bookable until this local time (HH:MM, APP_TIMEZONE); after it, next day. */
const rawSameDayCutoff = String(process.env.SLOT_SAME_DAY_CUTOFF || "").trim();
export const SLOT_SAME_DAY_CUTOFF = /^([01]?\d|2[0-3]):[0-5]\d$/.test(rawSameDayCutoff)
  ? rawSameDayCutoff
  : "18:00";

export const DEFAULT_VENDOR_WASH_CAPACITY_KG =
  Number(process.env.MERCHANT_WASH_CAPACITY_KG) || 15;
