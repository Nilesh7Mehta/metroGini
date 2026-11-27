import sql from "../../config/db.js";
import {
  buildPaginationMeta,
  parsePagination,
} from "../../utils/pagination.util.js";

/**
 * Admin list: users who have a personal referral code.
 * GET /admin/referrals?page=&limit=&search=
 */
export const listAdminReferralsService = async (query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const search = String(query.search || "").trim();

  const params = [];
  let where = `WHERE COALESCE(u.is_deleted, false) = false`;

  if (search) {
    params.push(`%${search}%`);
    const i = params.length;
    where += ` AND (
      u.full_name ILIKE $${i}
      OR u.mobile ILIKE $${i}
      OR rc.code ILIKE $${i}
      OR u.referral_code ILIKE $${i}
    )`;
  }

  const countResult = await sql.query(
    `SELECT COUNT(*)::int AS total
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     ${where}`,
    params,
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(limit, offset);
  const { rows } = await sql.query(
    `SELECT
       u.id AS user_id,
       u.full_name,
       u.mobile,
       u.email,
       rc.id AS referral_code_id,
       rc.code AS referral_code,
       rc.is_active,
       rc.created_at AS code_created_at,
       (
         SELECT COUNT(*)::int
         FROM orders o
         WHERE o.referred_by_user_id = u.id
           AND o.status <> 'cancelled'
       ) AS times_used,
       (
         SELECT COUNT(*)::int
         FROM referral_rewards rr
         WHERE rr.referrer_user_id = u.id
       ) AS rewards_earned,
       (
         SELECT COUNT(*)::int
         FROM coupon_usages cu
         JOIN coupons c ON c.id = cu.coupon_id
         WHERE cu.user_id = u.id
           AND c.is_referral_reward = true
           AND cu.is_used = FALSE
           AND (cu.expiry_date IS NULL OR cu.expiry_date >= CURRENT_TIMESTAMP)
       ) AS reward_grants_available
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     ${where}
     ORDER BY rc.created_at DESC, rc.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    referrals: rows,
    pagination: buildPaginationMeta(total, page, limit),
  };
};

/**
 * Admin detail: one referrer + people who used their code.
 * GET /admin/referrals/:userId?page=&limit=
 */
export const getAdminReferralDetailService = async (userId, query = {}) => {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "Invalid user id" };
  }

  const { rows: referrerRows } = await sql.query(
    `SELECT
       u.id AS user_id,
       u.full_name,
       u.mobile,
       u.email,
       rc.id AS referral_code_id,
       rc.code AS referral_code,
       rc.is_active,
       rc.created_at AS code_created_at,
       (
         SELECT COUNT(*)::int
         FROM orders o
         WHERE o.referred_by_user_id = u.id
           AND o.status <> 'cancelled'
       ) AS times_used,
       (
         SELECT COUNT(*)::int
         FROM referral_rewards rr
         WHERE rr.referrer_user_id = u.id
       ) AS rewards_earned,
       (
         SELECT COUNT(*)::int
         FROM coupon_usages cu
         JOIN coupons c ON c.id = cu.coupon_id
         WHERE cu.user_id = u.id
           AND c.is_referral_reward = true
           AND cu.is_used = FALSE
           AND (cu.expiry_date IS NULL OR cu.expiry_date >= CURRENT_TIMESTAMP)
       ) AS reward_grants_available
     FROM users u
     LEFT JOIN referral_codes rc ON rc.user_id = u.id
     WHERE u.id = $1`,
    [id],
  );

  const referrer = referrerRows[0];
  if (!referrer) {
    throw { status: 404, message: "User not found" };
  }
  if (!referrer.referral_code_id && !referrer.referral_code) {
    throw { status: 404, message: "This user has no referral code" };
  }

  const { page, limit, offset } = parsePagination(query);

  const countResult = await sql.query(
    `SELECT COUNT(*)::int AS total
     FROM orders o
     WHERE o.referred_by_user_id = $1`,
    [id],
  );
  const total = countResult.rows[0]?.total || 0;

  const { rows: usages } = await sql.query(
    `SELECT
       o.id AS order_id,
       o.order_code,
       o.status AS order_status,
       o.payment_status,
       o.discount_price,
       o.final_total,
       o.estimated_total,
       o.booked_at,
       o.delivery_completed_at,
       o.cancelled_at,
       o.created_at AS order_created_at,
       o.applied_referral_code_id,
       friend.id AS friend_user_id,
       friend.full_name AS friend_name,
       friend.mobile AS friend_mobile,
       rr.id AS reward_id,
       rr.created_at AS reward_granted_at,
       CASE
         WHEN rr.id IS NOT NULL THEN 'granted'
         WHEN o.status = 'cancelled' THEN 'cancelled'
         WHEN o.status = 'draft' THEN 'on_draft'
         WHEN o.status = 'delivered' THEN 'pending_grant'
         ELSE 'pending_delivery'
       END AS reward_status
     FROM orders o
     JOIN users friend ON friend.id = o.user_id
     LEFT JOIN referral_rewards rr
       ON rr.order_id = o.id AND rr.referrer_user_id = $1
     WHERE o.referred_by_user_id = $1
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $2 OFFSET $3`,
    [id, limit, offset],
  );

  return {
    referrer,
    usages,
    pagination: buildPaginationMeta(total, page, limit),
  };
};
