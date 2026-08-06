import sql from '../../config/db.js';
import { paginateArray } from '../../utils/pagination.util.js';

export const getAdminPartnerLeadsService = async (query = {}) => {
  const { rows } = await sql.query(
    `SELECT id, name, email, phone, created_at, updated_at
     FROM partner_leads
     ORDER BY created_at DESC`,
  );

  const { items, pagination } = paginateArray(rows, query);

  return {
    partner_leads: items,
    pagination,
  };
};
