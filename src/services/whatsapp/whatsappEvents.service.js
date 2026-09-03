/**
 * Fire-and-forget outbound events MetroGini → Gallabox.
 * Configure GALLABOX_WEBHOOK_URL + GALLABOX_WEBHOOK_ENABLED=true
 */

const enabled = () =>
  String(process.env.GALLABOX_WEBHOOK_ENABLED || "").toLowerCase() ===
    "true" && Boolean(String(process.env.GALLABOX_WEBHOOK_URL || "").trim());

export const emitWhatsappEvent = async (event, { order_id, mobile, data } = {}) => {
  if (!enabled()) {
    return {
      skipped: true,
      reason: "webhook_disabled_or_url_missing",
      event,
    };
  }

  const url = String(process.env.GALLABOX_WEBHOOK_URL).trim();
  const payload = {
    event,
    order_id: order_id ?? null,
    mobile: mobile ?? null,
    data: data || {},
    sent_at: new Date().toISOString(),
  };

  const headers = {
    "Content-Type": "application/json",
  };
  const secret = String(process.env.GALLABOX_WEBHOOK_SECRET || "").trim();
  if (secret) {
    headers["X-MetroGini-Secret"] = secret;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(
        Number(process.env.GALLABOX_WEBHOOK_TIMEOUT_MS) || 8000,
      ),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[whatsapp-webhook] ${event} failed status=${res.status} body=${text.slice(0, 200)}`,
      );
      return { skipped: false, ok: false, status: res.status, event };
    }

    return { skipped: false, ok: true, event };
  } catch (err) {
    console.error(`[whatsapp-webhook] ${event} error:`, err.message);
    return { skipped: false, ok: false, error: err.message, event };
  }
};

/** Non-blocking wrapper — never throws to callers */
export const emitWhatsappEventSafe = (event, payload) => {
  setImmediate(() => {
    emitWhatsappEvent(event, payload).catch(() => {});
  });
};

/**
 * Load order + user mobile then emit.
 */
export const emitWhatsappOrderEventSafe = async (event, orderId, extraData = {}) => {
  try {
    const sql = (await import("../../config/db.js")).default;
    const { rows } = await sql.query(
      `
      SELECT o.id,
             o.order_code,
             o.status,
             o.user_id,
             o.actual_weight,
             o.final_total,
             o.remaining_amount,
             o.amount_paid,
             o.pickup_date,
             o.delivery_date,
             o.assigned_rider_id,
             u.mobile,
             u.full_name,
             r.full_name AS rider_name,
             r.mobile_number AS rider_mobile
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN riders r ON r.id = o.assigned_rider_id
      WHERE o.id = $1
      `,
      [orderId],
    );

    if (!rows[0]) return;

    const o = rows[0];
    emitWhatsappEventSafe(event, {
      order_id: Number(o.id),
      mobile: o.mobile,
      data: {
        order_code: o.order_code,
        status: o.status,
        user_name: o.full_name,
        pickup_date: o.pickup_date,
        delivery_date: o.delivery_date,
        actual_weight:
          o.actual_weight != null ? Number(o.actual_weight) : null,
        final_total: o.final_total != null ? Number(o.final_total) : null,
        remaining_amount:
          o.remaining_amount != null ? Number(o.remaining_amount) : null,
        amount_paid: o.amount_paid != null ? Number(o.amount_paid) : null,
        rider_name: o.rider_name || null,
        rider_mobile: o.rider_mobile || null,
        ...extraData,
      },
    });
  } catch (err) {
    console.error(`[whatsapp-webhook] emitOrderEvent ${event}:`, err.message);
  }
};
