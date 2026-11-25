import crypto from "crypto";
import sql from "../../config/db.js";

export const REFERRAL_REWARD_CODE = "REFERRALREWARD";
export const REFERRAL_CODE_TEMPLATE = "REFERRAL_CODE_TEMPLATE";
export const REFERRAL_GRANT_DAYS = 30;

/** Avoid ambiguous 0/O/1/I in the random tail. */
const REFERRAL_RANDOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const RESERVED_REFERRAL_CODES = new Set([
  REFERRAL_REWARD_CODE,
  REFERRAL_CODE_TEMPLATE,
  "CANCEL500",
]);

/** Letters-only name prefix, e.g. "Nilesh Mehta" → "NILESHME" (max 8). */
export const namePrefixFromFullName = (name) => {
  const letters = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (letters.length >= 3) return letters.slice(0, 8);
  if (letters.length > 0) return (letters + "MGINI").slice(0, 8);
  return "MGINI";
};

export const randomReferralSuffix = (length = 4) => {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += REFERRAL_RANDOM_ALPHABET[bytes[i] % REFERRAL_RANDOM_ALPHABET.length];
  }
  return out;
};

/** e.g. Nilesh → NILESH7K2M (name prefix + random). */
export const buildReferralCode = (fullName) =>
  `${namePrefixFromFullName(fullName)}${randomReferralSuffix(4)}`;

/** Old sequential codes like USER01 / USER12. */
export const isLegacySequentialReferralCode = (code) =>
  /^USER\d+$/i.test(String(code || "").trim());

const pickUniqueReferralCode = async (fullName, client) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = buildReferralCode(fullName);
    if (RESERVED_REFERRAL_CODES.has(candidate)) continue;

    const { rows } = await client.query(
      `SELECT 1 AS taken
       WHERE EXISTS (
           SELECT 1 FROM referral_codes WHERE UPPER(code) = UPPER($1)
         )
          OR EXISTS (
           SELECT 1 FROM users WHERE UPPER(referral_code) = UPPER($1)
         )
          OR EXISTS (
           SELECT 1 FROM coupons WHERE UPPER(coupon_code) = UPPER($1)
         )`,
      [candidate],
    );
    if (!rows.length) return candidate;
  }
  throw new Error("Could not allocate a unique referral code");
};

export const getReferralCodeTemplate = async (db = sql) => {
  const { rows } = await db.query(
    `SELECT * FROM coupons
     WHERE is_referral_code_template = true AND is_active = true
     ORDER BY id ASC
     LIMIT 1`,
  );
  return rows[0] || null;
};

export const getReferralRewardCoupon = async (db = sql) => {
  const { rows } = await db.query(
    `SELECT * FROM coupons
     WHERE is_referral_reward = true AND is_active = true
     ORDER BY id ASC
     LIMIT 1`,
  );
  return rows[0] || null;
};

/** Look up an active personal referral code (separate from coupons). */
export const findActiveReferralCode = async (code, db = sql) => {
  const normalized = String(code || "").trim();
  if (!normalized) return null;
  const { rows } = await db.query(
    `SELECT rc.id, rc.user_id, rc.code, rc.is_active,
            u.status AS user_status,
            COALESCE(u.is_deleted, false) AS user_is_deleted,
            u.full_name
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     WHERE UPPER(rc.code) = UPPER($1)
     LIMIT 1`,
    [normalized],
  );
  return rows[0] || null;
};

/**
 * Build a coupon-shaped object from REFERRAL_CODE_TEMPLATE + personal code,
 * so existing discount math still works. applied_coupon_id uses the template id.
 */
export const buildReferralCouponFromCode = async (code, db = sql) => {
  const row = await findActiveReferralCode(code, db);
  if (!row || !row.is_active) return null;

  const template = await getReferralCodeTemplate(db);
  if (!template) return null;

  return {
    ...template,
    coupon_code: row.code,
    is_referral_code: true,
    is_referral_code_template: false,
    is_referral_reward: false,
    referrer_user_id: Number(row.user_id),
    referral_code_id: Number(row.id),
    per_user_limit: 1,
    usage_limit: null,
  };
};

/** @deprecated personal codes no longer live on coupons — pass-through. */
export const withLiveReferralCodeRates = async (coupon, db = sql) => {
  if (!coupon?.is_referral_code) return coupon;
  const template = await getReferralCodeTemplate(db);
  if (!template) return coupon;
  return {
    ...coupon,
    discount_type: template.discount_type,
    discount_value: template.discount_value,
    minimum_amount_value: template.minimum_amount_value,
    maximum_amount_value: template.maximum_amount_value,
    // Keep personal code string for display; billing uses template id.
    id: template.id,
  };
};

/**
 * Rename an existing referral_codes row + users.referral_code to name+random.
 */
export const reassignReferralCodeForUser = async (userId, db = sql) => {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const client = db === sql ? await sql.connect() : db;
  const shouldRelease = db === sql;
  try {
    await client.query("BEGIN");

    const { rows: userRows } = await client.query(
      `SELECT id, full_name, referral_code FROM users WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const user = userRows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows: codeRows } = await client.query(
      `SELECT id, code FROM referral_codes
       WHERE user_id = $1
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [id],
    );
    const existing = codeRows[0] || null;
    if (!existing && !user.referral_code) {
      await client.query("ROLLBACK");
      return null;
    }

    const newCode = await pickUniqueReferralCode(user.full_name, client);

    if (existing) {
      await client.query(
        `UPDATE referral_codes
         SET code = $2, is_active = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [existing.id, newCode],
      );
    } else {
      await client.query(
        `INSERT INTO referral_codes (user_id, code, is_active)
         VALUES ($1, $2, true)`,
        [id, newCode],
      );
    }

    await client.query(
      `UPDATE users
       SET referral_code = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id, newCode],
    );

    await client.query("COMMIT");
    return newCode;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[referral] reassignReferralCodeForUser failed:", error.message);
    throw error;
  } finally {
    if (shouldRelease) client.release();
  }
};

/**
 * Users who already placed a real order (not draft/cancelled) — eligible to share a code.
 */
export const listUsersEligibleForReferralCodeBackfill = async (db = sql) => {
  const { rows } = await db.query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN orders o ON o.user_id = u.id
     WHERE COALESCE(u.is_deleted, false) = false
       AND u.referral_code IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM referral_codes rc WHERE rc.user_id = u.id
       )
       AND o.status NOT IN ('draft', 'cancelled')
     ORDER BY u.id`,
  );
  return rows.map((r) => Number(r.id));
};

export const backfillReferralCodesForPriorCustomers = async (db = sql) => {
  const userIds = await listUsersEligibleForReferralCodeBackfill(db);
  const results = [];
  for (const userId of userIds) {
    const code = await ensureReferralCodeForUser(userId, db);
    if (code) results.push({ user_id: userId, referral_code: code });
  }
  return results;
};

export const migrateAllReferralCodesToNameRandom = async (db = sql) => {
  const { rows } = await db.query(
    `SELECT u.id, u.referral_code, rc.code AS table_code
     FROM users u
     LEFT JOIN referral_codes rc ON rc.user_id = u.id
     WHERE u.referral_code IS NOT NULL OR rc.id IS NOT NULL
     ORDER BY u.id`,
  );

  const changed = [];
  for (const row of rows) {
    const current = row.referral_code || row.table_code || null;
    const next = await reassignReferralCodeForUser(row.id, db);
    if (next && next !== current) {
      changed.push({ user_id: row.id, from: current, to: next });
    }
  }
  return changed;
};

/**
 * After first delivery (or backfill): create referral_codes row + users.referral_code.
 * Does NOT insert into coupons.
 */
export const ensureReferralCodeForUser = async (userId, db = sql) => {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { rows: existing } = await db.query(
    `SELECT u.referral_code, u.full_name, rc.code AS table_code
     FROM users u
     LEFT JOIN referral_codes rc ON rc.user_id = u.id
     WHERE u.id = $1`,
    [id],
  );
  if (!existing[0]) return null;

  const current = existing[0].referral_code || existing[0].table_code || null;
  if (current) {
    if (isLegacySequentialReferralCode(current)) {
      return reassignReferralCodeForUser(id, db);
    }
    // Sync mirror if table has code but users.referral_code is null
    if (!existing[0].referral_code && existing[0].table_code) {
      await db.query(
        `UPDATE users SET referral_code = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND referral_code IS NULL`,
        [id, existing[0].table_code],
      );
      return existing[0].table_code;
    }
    return current;
  }

  const template = await getReferralCodeTemplate(db);
  if (!template) {
    console.warn(
      "[referral] No active REFERRAL_CODE_TEMPLATE coupon — skip code unlock",
    );
    return null;
  }

  const client = db === sql ? await sql.connect() : db;
  const shouldRelease = db === sql;
  try {
    await client.query("BEGIN");

    const code = await pickUniqueReferralCode(existing[0].full_name, client);

    await client.query(
      `INSERT INTO referral_codes (user_id, code, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id) DO UPDATE
         SET code = EXCLUDED.code,
             is_active = true,
             updated_at = CURRENT_TIMESTAMP
       RETURNING code`,
      [id, code],
    );

    await client.query(
      `UPDATE users
       SET referral_code = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND referral_code IS NULL`,
      [id, code],
    );

    await client.query("COMMIT");
    return code;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const { rows } = await sql.query(
      `SELECT referral_code FROM users WHERE id = $1`,
      [id],
    );
    if (rows[0]?.referral_code) {
      if (isLegacySequentialReferralCode(rows[0].referral_code)) {
        return reassignReferralCodeForUser(id);
      }
      return rows[0].referral_code;
    }
    console.error("[referral] ensureReferralCodeForUser failed:", error.message);
    throw error;
  } finally {
    if (shouldRelease) client.release();
  }
};

const hasPriorReferralAttribution = async (userId, db, excludeOrderId = null) => {
  const params = [userId];
  let exclude = "";
  if (excludeOrderId != null) {
    params.push(excludeOrderId);
    exclude = ` AND id <> $${params.length}`;
  }

  const { rows: rewarded } = await db.query(
    `SELECT 1 FROM referral_rewards WHERE referred_user_id = $1 LIMIT 1`,
    [userId],
  );
  if (rewarded.length) return true;

  const { rows: attributed } = await db.query(
    `SELECT 1 FROM orders
     WHERE user_id = $1
       AND referred_by_user_id IS NOT NULL
       AND status NOT IN ('draft', 'cancelled')
       ${exclude}
     LIMIT 1`,
    params,
  );
  return attributed.length > 0;
};

/**
 * Validate personal referral code attribution on an order.
 * coupon may be synthetic from buildReferralCouponFromCode.
 */
export const assertCanApplyReferralCode = async (
  client,
  { coupon, userId, orderId },
) => {
  if (!coupon?.is_referral_code) return null;

  const referrerId = Number(coupon.referrer_user_id);
  if (!referrerId) {
    throw { status: 400, message: "Invalid referral code" };
  }
  if (referrerId === Number(userId)) {
    throw { status: 400, message: "You can't use your own referral code" };
  }
  if (await hasPriorReferralAttribution(userId, client, orderId)) {
    throw {
      status: 400,
      message: "You've already used a referral code",
    };
  }

  const { rows: referrer } = await client.query(
    `SELECT id, referral_code, status, COALESCE(is_deleted, false) AS is_deleted
     FROM users WHERE id = $1`,
    [referrerId],
  );
  if (
    !referrer[0] ||
    referrer[0].is_deleted ||
    String(referrer[0].status || "active") !== "active"
  ) {
    throw { status: 400, message: "This referral code is invalid" };
  }

  return {
    referred_by_user_id: referrerId,
    referral_code_id: coupon.referral_code_id
      ? Number(coupon.referral_code_id)
      : null,
  };
};

export const setOrderReferredBy = async (
  client,
  orderId,
  referredByUserId,
  referralCodeId = null,
) => {
  await client.query(
    `UPDATE orders
     SET referred_by_user_id = $2,
         applied_referral_code_id = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [orderId, referredByUserId, referralCodeId],
  );
};

export const clearOrderReferredBy = async (client, orderId) => {
  await client.query(
    `UPDATE orders
     SET referred_by_user_id = NULL,
         applied_referral_code_id = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [orderId],
  );
};

/**
 * When a referred order is delivered: grant referrer one REFERRALREWARD usage.
 */
export const creditReferrerRewardForDeliveredOrder = async (
  orderId,
  db = sql,
) => {
  const { rows } = await db.query(
    `SELECT id, user_id, referred_by_user_id, status
     FROM orders WHERE id = $1`,
    [orderId],
  );
  const order = rows[0];
  if (!order?.referred_by_user_id || order.status !== "delivered") return null;

  const referrerId = Number(order.referred_by_user_id);
  const referredId = Number(order.user_id);
  if (!referrerId || !referredId || referrerId === referredId) return null;

  const { rows: existing } = await db.query(
    `SELECT id FROM referral_rewards WHERE referred_user_id = $1 LIMIT 1`,
    [referredId],
  );
  if (existing.length) return null;

  const rewardCoupon = await getReferralRewardCoupon(db);
  if (!rewardCoupon) {
    console.warn(
      "[referral] No active REFERRALREWARD coupon — skip referrer grant",
    );
    return null;
  }

  const client = db === sql ? await sql.connect() : db;
  const shouldRelease = db === sql;
  try {
    await client.query("BEGIN");

    const { rows: usageRows } = await client.query(
      `INSERT INTO coupon_usages (coupon_id, user_id, order_id, is_used, expiry_date)
       VALUES ($1, $2, $3, FALSE, NOW() + ($4::int * INTERVAL '1 day'))
       ON CONFLICT (coupon_id, user_id, order_id) DO NOTHING
       RETURNING id`,
      [rewardCoupon.id, referrerId, orderId, REFERRAL_GRANT_DAYS],
    );

    let usageId = usageRows[0]?.id ?? null;
    if (!usageId) {
      const { rows: found } = await client.query(
        `SELECT id FROM coupon_usages
         WHERE coupon_id = $1 AND user_id = $2 AND order_id = $3
         LIMIT 1`,
        [rewardCoupon.id, referrerId, orderId],
      );
      usageId = found[0]?.id ?? null;
    }

    await client.query(
      `INSERT INTO referral_rewards
         (referrer_user_id, referred_user_id, order_id, coupon_usage_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (referred_user_id) DO NOTHING`,
      [referrerId, referredId, orderId, usageId],
    );

    await client.query("COMMIT");
    return { referrerId, referredId, couponUsageId: usageId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[referral] creditReferrerReward failed:", error.message);
    throw error;
  } finally {
    if (shouldRelease) client.release();
  }
};

export const consumeReferralRewardGrant = async (client, userId, couponId) => {
  const { rows } = await client.query(
    `UPDATE coupon_usages
     SET is_used = TRUE
     WHERE id = (
       SELECT id FROM coupon_usages
       WHERE coupon_id = $1
         AND user_id = $2
         AND is_used = FALSE
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)
       ORDER BY created_at ASC, id ASC
       LIMIT 1
       FOR UPDATE
     )
     RETURNING id`,
    [couponId, userId],
  );
  if (!rows[0]) {
    throw {
      status: 400,
      message: "You are not eligible to use this coupon",
    };
  }
  return rows[0].id;
};

export const assertReferralRewardEligible = async (client, userId, couponId) => {
  const { rows } = await client.query(
    `SELECT id FROM coupon_usages
     WHERE coupon_id = $1
       AND user_id = $2
       AND is_used = FALSE
       AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
    [couponId, userId],
  );
  if (!rows[0]) {
    throw {
      status: 400,
      message: "You are not eligible to use this coupon",
    };
  }
};

export const getUserReferralSummary = async (userId, db = sql) => {
  const { rows } = await db.query(
    `SELECT COALESCE(u.referral_code, rc.code) AS referral_code,
            (SELECT COUNT(*)::int FROM referral_rewards rr WHERE rr.referrer_user_id = u.id) AS rewards_earned,
            (
              SELECT COUNT(*)::int FROM coupon_usages cu
              JOIN coupons c ON c.id = cu.coupon_id
              WHERE cu.user_id = u.id
                AND c.is_referral_reward = true
                AND cu.is_used = FALSE
                AND (cu.expiry_date IS NULL OR cu.expiry_date >= CURRENT_TIMESTAMP)
            ) AS reward_grants_available
     FROM users u
     LEFT JOIN referral_codes rc ON rc.user_id = u.id AND rc.is_active = true
     WHERE u.id = $1`,
    [userId],
  );
  const row = rows[0] || {};
  return {
    referral_code: row.referral_code || null,
    rewards_earned: Number(row.rewards_earned || 0),
    reward_grants_available: Number(row.reward_grants_available || 0),
    reward_coupon_code: REFERRAL_REWARD_CODE,
  };
};
