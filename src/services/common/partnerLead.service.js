import sql from "../../config/db.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^\d{10}$/;

export const createPartnerLead = async ({ name, email, phone }) => {
  if (!name?.trim()) {
    throw { status: 400, message: "name is required" };
  }

  if (!email?.trim()) {
    throw { status: 400, message: "email is required" };
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw { status: 400, message: "email must be a valid email address" };
  }

  if (!phone?.toString().trim()) {
    throw { status: 400, message: "phone is required" };
  }

  const normalizedPhone = String(phone).trim();
  if (!MOBILE_REGEX.test(normalizedPhone)) {
    throw { status: 400, message: "phone must be a 10-digit number" };
  }

  const { rows } = await sql.query(
    `INSERT INTO partner_leads (name, email, phone)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, phone, created_at, updated_at`,
    [name.trim(), normalizedEmail, normalizedPhone],
  );

  return rows[0];
};
