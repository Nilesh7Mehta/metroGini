import sql from "../../config/db.js";

export const getTermsAndConditionsFromDb = async () => {
  const [pageRes, sectionsRes, consentsRes] = await Promise.all([
    sql.query(
      `SELECT title, subtitle, notice_title, notice_text
       FROM terms_and_conditions
       ORDER BY id ASC
       LIMIT 1`,
    ),
    sql.query(
      `SELECT id, title, body, sequence
       FROM terms_and_conditions_sections
       WHERE status IS TRUE
       ORDER BY sequence ASC, id ASC`,
    ),
    sql.query(
      `SELECT body
       FROM terms_and_conditions_consents
       WHERE status IS TRUE
       ORDER BY sequence ASC, id ASC`,
    ),
  ]);

  const page = pageRes.rows[0];
  if (!page) {
    throw { status: 404, message: "Terms and conditions not found" };
  }

  return {
    title: page.title,
    subtitle: page.subtitle,
    notice_title: page.notice_title,
    notice_text: page.notice_text,
    sections: sectionsRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
    })),
    consents: consentsRes.rows.map((row) => row.body),
  };
};
