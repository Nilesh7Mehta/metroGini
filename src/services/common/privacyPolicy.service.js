import sql from "../../config/db.js";

export const getPrivacyPolicyFromDb = async () => {
  const [pageRes, sectionsRes] = await Promise.all([
    sql.query(
      `SELECT title, subtitle, last_modified
       FROM privacy_policy
       ORDER BY id ASC
       LIMIT 1`,
    ),
    sql.query(
      `SELECT id, title, body, sequence
       FROM privacy_policy_sections
       WHERE status IS TRUE
       ORDER BY sequence ASC, id ASC`,
    ),
  ]);

  const page = pageRes.rows[0];
  if (!page) {
    throw { status: 404, message: "Privacy policy not found" };
  }

  return {
    title: page.title,
    subtitle: page.subtitle,
    last_modified: page.last_modified,
    sections: sectionsRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
    })),
  };
};
