export const ORDER_STATUS = {
  DRAFT : "draft",  
  CREATED: "created",
  CONFIRMED: "confirmed",
  PICKED_UP: "picked_up",
  IN_PROCESS: "in_process",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

export const PAYMENT_TYPE = {
  ADVANCE: "advance",
  REMAINING: "remaining",
};