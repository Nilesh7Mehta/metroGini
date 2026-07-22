/**
 * Shared list pagination helpers.
 * Query: ?page=1&limit=20
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * @param {object} query
 * @param {{ defaultLimit?: number, maxLimit?: number }} [options]
 * @returns {{ page: number, limit: number, offset: number }}
 */
export const parsePagination = (query = {}, options = {}) => {
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? MAX_LIMIT;

  let page = Number.parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;

  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

/**
 * @param {number} total
 * @param {number} page
 * @param {number} limit
 */
export const buildPaginationMeta = (total, page, limit) => {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLimit = Math.max(1, Number(limit) || DEFAULT_LIMIT);
  const safePage = Math.max(1, Number(page) || DEFAULT_PAGE);

  return {
    total: safeTotal,
    page: safePage,
    limit: safeLimit,
    total_pages: safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit),
  };
};

/**
 * Slice an in-memory list and attach pagination meta.
 * @template T
 * @param {T[]} items
 * @param {object} query
 * @param {{ defaultLimit?: number, maxLimit?: number }} [options]
 * @returns {{ items: T[], pagination: object }}
 */
export const paginateArray = (items = [], query = {}, options = {}) => {
  const { page, limit } = parsePagination(query, options);
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const offset = (page - 1) * limit;

  return {
    items: list.slice(offset, offset + limit),
    pagination: buildPaginationMeta(total, page, limit),
  };
};
