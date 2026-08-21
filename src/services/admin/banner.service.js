import sql from "../../config/db.js";
import { deleteFile } from "../../utils/file.service.js";

const MAX_BANNERS = 2;

const BANNER_SELECT = `
  b.id,
  b.image_url,
  b.coupon_id,
  c.coupon_code
`;

const parseCouponId = (value, { required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw { status: 400, message: "coupon_id is required" };
    return null;
  }

  const couponId = Number(value);
  if (!Number.isInteger(couponId) || couponId <= 0) {
    throw { status: 400, message: "coupon_id must be a positive integer" };
  }
  return couponId;
};

const assertCouponExists = async (couponId) => {
  if (couponId == null) return;

  const { rows } = await sql.query(`SELECT id FROM coupons WHERE id = $1`, [
    couponId,
  ]);
  if (!rows.length) throw { status: 400, message: "coupon_id does not exist" };
};

const getBannerById = async (id) => {
  const { rows } = await sql.query(
    `SELECT ${BANNER_SELECT}
     FROM banners b
     LEFT JOIN coupons c ON c.id = b.coupon_id
     WHERE b.id = $1`,
    [id],
  );
  return rows[0] || null;
};

const assertBannerSlotAvailable = async () => {
  const { rows } = await sql.query(`SELECT COUNT(*)::int AS count FROM banners`);
  if (rows[0].count >= MAX_BANNERS) {
    throw {
      status: 400,
      message: `A maximum of ${MAX_BANNERS} banners are allowed`,
    };
  }
};

export const upsertBanner = async (body, imagePath) => {
  const { banner_id } = body;
  const couponId = parseCouponId(body.coupon_id, { required: true });

  if (!imagePath) throw { status: 400, message: "Banner image is required" };

  await assertCouponExists(couponId);

  if (banner_id) {
    const { rows: existing } = await sql.query(
      `SELECT image_url FROM banners WHERE id = $1`,
      [banner_id],
    );
    if (!existing.length) throw { status: 404, message: "Banner not found" };

    const oldImage = existing[0].image_url;

    await sql.query(
      `UPDATE banners SET image_url=$1, coupon_id=$2 WHERE id=$3`,
      [imagePath, couponId, banner_id],
    );

    if (oldImage) await deleteFile(oldImage);
    return { data: await getBannerById(banner_id), created: false };
  }

  await assertBannerSlotAvailable();

  const { rows } = await sql.query(
    `INSERT INTO banners (image_url, coupon_id) VALUES ($1,$2) RETURNING id`,
    [imagePath, couponId],
  );
  return { data: await getBannerById(rows[0].id), created: true };
};

export const editBanner = async (id, body, newImagePath) => {
  const { rows } = await sql.query(
    `SELECT image_url, coupon_id FROM banners WHERE id = $1`,
    [id],
  );
  if (!rows.length) throw { status: 404, message: "Banner not found" };

  let imagePath = rows[0].image_url;
  if (newImagePath) {
    await deleteFile(imagePath);
    imagePath = newImagePath;
  }

  const couponId = Object.prototype.hasOwnProperty.call(body, "coupon_id")
    ? parseCouponId(body.coupon_id, { required: true })
    : rows[0].coupon_id;

  await assertCouponExists(couponId);

  await sql.query(
    `UPDATE banners SET image_url=$1, coupon_id=$2 WHERE id=$3`,
    [imagePath, couponId, id],
  );
  return getBannerById(id);
};

export const removeBanner = async (id) => {
  const { rows } = await sql.query(
    `SELECT image_url FROM banners WHERE id = $1`,
    [id],
  );
  if (!rows.length) throw { status: 404, message: "Banner not found" };

  await deleteFile(rows[0].image_url);
  await sql.query(`DELETE FROM banners WHERE id = $1`, [id]);
};

export const fetchBanners = async () => {
  const { rows } = await sql.query(
    `SELECT ${BANNER_SELECT}
     FROM banners b
     LEFT JOIN coupons c ON c.id = b.coupon_id
     ORDER BY b.id ASC
     LIMIT ${MAX_BANNERS}`,
  );
  return rows;
};
