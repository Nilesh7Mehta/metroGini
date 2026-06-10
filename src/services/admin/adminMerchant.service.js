import sql from '../../config/db.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';

const MERCHANT_WASH_CAPACITY_KG =
  Number(process.env.MERCHANT_WASH_CAPACITY_KG) || 150;
const MERCHANT_DRY_CAPACITY_PCS =
  Number(process.env.MERCHANT_DRY_CAPACITY_PCS) || 60;
const MERCHANT_BATCH_ORDER_CAPACITY =
  Number(process.env.MERCHANT_BATCH_ORDER_CAPACITY) || 18;

const VALID_PERIODS = ['today', 'week', 'month'];
const ACTIVE_VENDOR_STATUSES = [
  'picked_up',
  'in_process',
  'order_finalized',
  'ready_for_delivery',
  'out_for_delivery',
];

const SERVICE_CONFIG = {
  1: { key: 'wash_by_kilo' },
  2: { key: 'dry_clean' },
};

const formatDate = (date) => date.toLocaleDateString('en-CA');

const parseMerchantId = (raw) => {
  const match = String(raw).match(/^(?:MER-)?(\d+)$/i);
  if (!match) throw { status: 400, message: 'Invalid merchant id' };
  return parseInt(match[1], 10);
};

const formatMerchantId = (id) => `MER-${String(id).padStart(3, '0')}`;

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const formatMerchantStatus = (isActive) => (isActive ? 'active' : 'inactive');

const formatPhone = (mobile) => {
  if (!mobile) return 'N/A';
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return mobile;
};

const getAvatarInitials = (name) => {
  if (!name) return 'NA';
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return words[0].slice(0, 2).toUpperCase();
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return 'N/A';
  const digits = String(accountNumber).replace(/\s/g, '');
  const last4 = digits.slice(-4);
  return `XXXX XXXX ${last4}`;
};

const formatRegistrationDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatRevenue = (amount) => {
  const value = Math.round(Number(amount || 0));
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
};

const formatDateLabel = (dateStr) => {
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const getDateRange = (period) => {
  const now = new Date();

  if (period === 'week') {
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: formatDate(monday), end: formatDate(sunday) };
  }

  if (period === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDate(firstDay), end: formatDate(lastDay) };
  }

  const today = formatDate(now);
  return { start: today, end: today };
};

const resolveOrderFilters = (query = {}) => {
  const dateFrom = query.date_from;
  const dateTo = query.date_to;

  if (
    dateFrom &&
    dateTo &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateTo)
  ) {
    return {
      start: dateFrom,
      end: dateTo,
      period: VALID_PERIODS.includes(query.period) ? query.period : 'custom',
      orderStatus: normalizeOrderStatusFilter(query.order_status),
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'today';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    orderStatus: normalizeOrderStatusFilter(query.order_status),
  };
};

const normalizeOrderStatusFilter = (status) => {
  if (!status) return null;
  if (status === 'in_progress') return 'in_process';
  return status;
};

const hasConfirmedClothes = (order) => {
  const count = order.actual_clothes_count;
  return count != null && Number(count) > 0;
};

const hasConfirmedWeight = (order) =>
  order.actual_weight != null && Number(order.actual_weight) > 0;

const isClassificationPending = (order) => {
  if (order.status === 'picked_up') return true;
  if (order.status !== 'in_process') return false;

  if (Number(order.service_id) === 2) {
    return !hasConfirmedClothes(order);
  }

  return !hasConfirmedWeight(order) || !hasConfirmedClothes(order);
};

const isExpressOrder = (serviceTypeName) =>
  typeof serviceTypeName === 'string' &&
  serviceTypeName.toLowerCase().includes('express');

const getEstimatedKg = (min, max) => {
  const weightMin = Number(min || 0);
  const weightMax = Number(max || 0);
  if (weightMin && weightMax) {
    return parseFloat(((weightMin + weightMax) / 2).toFixed(1));
  }
  return parseFloat((weightMax || weightMin || 0).toFixed(1));
};

const getServiceKey = (serviceId) =>
  SERVICE_CONFIG[Number(serviceId)]?.key || 'wash_by_kilo';

const getAdminDisplayStatus = (status) => {
  if (status === 'in_process') return 'in_progress';
  return status;
};

const resolveIssueType = (order) => {
  if (order.open_issue_type) return order.open_issue_type;

  if (
    order.actual_clothes_count != null &&
    order.clothes_count != null &&
    order.clothes_count > 0 &&
    Math.abs(order.actual_clothes_count - order.clothes_count) >= 3
  ) {
    return 'count_mismatch';
  }

  return null;
};

const buildEstFin = (order) => {
  const isWash = Number(order.service_id) === 1;

  if (isWash) {
    const est = getEstimatedKg(order.estimated_weight_min, order.estimated_weight_max);
    const fin = order.actual_weight != null ? Number(order.actual_weight) : est;
    return `${est}kg/${fin}kg`;
  }

  const est = Number(order.clothes_count || 0);
  const fin = Number(order.actual_clothes_count ?? order.clothes_count ?? 0);
  return `${est}/${fin} Items`;
};

const buildCharges = (order) => {
  const amount = order.final_total ?? order.estimated_total ?? 0;
  return String(Math.round(Number(amount)));
};

const mapMerchantOrder = (order) => {
  const issueType = resolveIssueType(order);

  return {
    id: order.id,
    order_id: order.order_code || `ORD-${String(order.id).padStart(3, '0')}`,
    customer_id: formatCustomerId(order.user_id),
    service_type: getServiceKey(order.service_id),
    category: isExpressOrder(order.service_type_name) ? 'express' : 'regular',
    status: getAdminDisplayStatus(order.status),
    ...(issueType ? { issue_type: issueType } : {}),
    est_fin: buildEstFin(order),
    charges: buildCharges(order),
  };
};

const getWashLoadKg = (orders) =>
  orders
    .filter((o) => Number(o.service_id) === 1)
    .reduce((sum, o) => {
      const weight =
        o.actual_weight != null
          ? Number(o.actual_weight)
          : getEstimatedKg(o.estimated_weight_min, o.estimated_weight_max);
      return sum + weight;
    }, 0);

const getDryCleanPieces = (orders) =>
  orders
    .filter((o) => Number(o.service_id) === 2)
    .reduce(
      (sum, o) =>
        sum + Number(o.actual_clothes_count ?? o.clothes_count ?? 0),
      0,
    );

const buildWorkloads = (orders) => {
  const washOrders = orders.filter((o) => Number(o.service_id) === 1);
  const dryOrders = orders.filter((o) => Number(o.service_id) === 2);
  const workloads = [];

  if (washOrders.length) {
    const kg = Math.round(getWashLoadKg(washOrders));
    workloads.push({
      key: 'wash_by_kilo',
      value: `${kg} kg | ${washOrders.length} orders`,
    });
  }

  if (dryOrders.length) {
    const pcs = Math.round(getDryCleanPieces(dryOrders));
    workloads.push({
      key: 'dry_clean',
      value: `${pcs} pcs | ${dryOrders.length} orders`,
    });
  }

  return workloads;
};

const buildBatchUtilization = (orders) => {
  if (!orders.length) return 0;
  return Math.min(
    100,
    Math.round((orders.length / MERCHANT_BATCH_ORDER_CAPACITY) * 100),
  );
};

const buildBatchPayload = (orders, lotCode) => ({
  lot: lotCode,
  status: orders.some((o) => o.status === 'delivered') ? 'completed' : 'in_progress',
  workloads: buildWorkloads(orders),
  order_count: orders.length,
  utilization: buildBatchUtilization(orders),
});

const resolveVendorStatusFilter = (status) => {
  if (!status || status === 'all') return null;
  if (status === 'active') return true;
  if (status === 'inactive') return false;
  throw { status: 400, message: 'status must be active or inactive' };
};

const fetchVendors = async (isActiveFilter) => {
  const params = [];
  let whereClause = '';

  if (isActiveFilter !== null) {
    params.push(isActiveFilter);
    whereClause = `WHERE v.is_active = $${params.length}`;
  }

  const { rows } = await sql.query(
    `
    SELECT
      v.id,
      v.laundry_shop_name,
      v.shop_address,
      v.mobile_number,
      v.is_active
    FROM vendors v
    ${whereClause}
    ORDER BY v.id ASC
    `,
    params,
  );

  return rows;
};

const fetchVendorById = async (vendorId) => {
  const { rows } = await sql.query(
    `
    SELECT
      v.id,
      v.owner_contact_name,
      v.mobile_number,
      v.email,
      v.laundry_shop_name,
      v.shop_address,
      v.gst_number,
      v.pan_card_number,
      v.account_holder_name,
      v.bank_name,
      v.account_number,
      v.ifsc_code,
      v.pincode,
      v.is_active,
      v.created_at
    FROM vendors v
    WHERE v.id = $1
    `,
    [vendorId],
  );

  return rows[0] || null;
};

const fetchMerchantOrders = async ({
  vendorIds = null,
  start = null,
  end = null,
  orderStatus = null,
  pipelineOnly = false,
}) => {
  const params = [];
  const conditions = [`o.vendor_id IS NOT NULL`, `o.status NOT IN ('draft', 'cancelled')`];

  if (vendorIds?.length) {
    params.push(vendorIds);
    conditions.push(`o.vendor_id = ANY($${params.length}::int[])`);
  }

  if (start && end) {
    params.push(start, end);
    conditions.push(
      `o.vendor_received_at IS NOT NULL AND o.vendor_received_at::date BETWEEN $${params.length - 1}::date AND $${params.length}::date`,
    );
  }

  if (pipelineOnly) {
    conditions.push(`o.status = ANY($${params.length + 1}::text[])`);
    params.push(ACTIVE_VENDOR_STATUSES);
  }

  if (orderStatus) {
    params.push(orderStatus);
    conditions.push(`o.status = $${params.length}`);
  }

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.vendor_id,
      o.pickup_slot_id,
      o.status,
      o.service_id,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      o.estimated_total,
      o.final_total,
      o.vendor_received_at,
      TO_CHAR(o.vendor_received_at::date, 'YYYY-MM-DD') AS vendor_received_date,
      st.name AS service_type_name,
      ts.shift_name AS pickup_shift_name,
      ir.issue_type AS open_issue_type
    FROM orders o
    LEFT JOIN service_types st ON o.service_type_id = st.id
    LEFT JOIN time_slots ts ON o.pickup_slot_id = ts.id
    LEFT JOIN LATERAL (
      SELECT issue_type
      FROM order_reports
      WHERE order_id = o.id AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    ) ir ON TRUE
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.vendor_received_at DESC NULLS LAST, o.pickup_slot_id ASC, o.id ASC
    `,
    params,
  );

  return rows;
};

const buildMerchantBatches = (orders, pickupShiftSlotIds) => {
  const batches = [];
  const slotIdsWithOrders = [
    ...new Set(
      orders
        .map((o) => Number(o.pickup_slot_id))
        .filter((id) => pickupShiftSlotIds.includes(id)),
    ),
  ];

  slotIdsWithOrders.forEach((slotId) => {
    const slotOrders = orders.filter(
      (o) => Number(o.pickup_slot_id) === Number(slotId),
    );
    if (!slotOrders.length) return;

    const lotIndex = pickupShiftSlotIds.indexOf(Number(slotId));
    const lotCode = `LOT-${String(lotIndex + 1).padStart(3, '0')}`;
    batches.push(buildBatchPayload(slotOrders, lotCode));
  });

  return batches;
};

const buildTopStats = (orders) => {
  const pipelineOrders = orders.filter((o) =>
    ACTIVE_VENDOR_STATUSES.includes(o.status),
  );
  const washKg = Math.round(getWashLoadKg(pipelineOrders));
  const dryPcs = Math.round(getDryCleanPieces(pipelineOrders));

  return [
    { key: 'total_laundry_kg', value: `${washKg} kg` },
    { key: 'dry_clean_pieces', value: `${dryPcs} pcs` },
    {
      key: 'orders_in_processing',
      value: String(
        pipelineOrders.filter(
          (o) =>
            o.status === 'order_finalized' ||
            (o.status === 'in_process' && !isClassificationPending(o)),
        ).length,
      ),
    },
    {
      key: 'ready_for_dispatch',
      value: String(
        pipelineOrders.filter((o) =>
          ['ready_for_delivery', 'out_for_delivery'].includes(o.status),
        ).length,
      ),
    },
    {
      key: 'pending_backlog',
      value: String(pipelineOrders.filter(isClassificationPending).length),
    },
    {
      key: 'order_completed',
      value: String(orders.filter((o) => o.status === 'delivered').length),
    },
  ];
};

const buildDetailKeyValue = (key, value) => ({
  key,
  value: value != null && String(value).trim() !== '' ? String(value) : 'N/A',
});

export const getAdminMerchantsService = async (query = {}) => {
  const isActiveFilter = resolveVendorStatusFilter(query.status);
  const vendors = await fetchVendors(isActiveFilter);
  const vendorIds = vendors.map((v) => v.id);

  const orders = vendorIds.length
    ? await fetchMerchantOrders({ vendorIds, pipelineOnly: true })
    : [];

  const deliveredOrders = vendorIds.length
    ? await fetchMerchantOrders({
        vendorIds,
        orderStatus: 'delivered',
      })
    : [];

  const statsOrders = [...orders, ...deliveredOrders];
  const { pickupShiftSlotIds } = await getPickupShiftConfig();

  const ordersByVendor = orders.reduce((acc, order) => {
    if (!acc[order.vendor_id]) acc[order.vendor_id] = [];
    acc[order.vendor_id].push(order);
    return acc;
  }, {});

  return {
    top_stats: buildTopStats(statsOrders),
    merchants: vendors.map((vendor) => ({
      id: vendor.id,
      merchant_id: formatMerchantId(vendor.id),
      name: vendor.laundry_shop_name || 'N/A',
      location: vendor.shop_address || vendor.pincode || 'N/A',
      contact: formatPhone(vendor.mobile_number),
      status: formatMerchantStatus(vendor.is_active),
      avatar_initials: getAvatarInitials(vendor.laundry_shop_name),
      batches: buildMerchantBatches(
        ordersByVendor[vendor.id] || [],
        pickupShiftSlotIds,
      ),
    })),
  };
};

export const getAdminMerchantDetailsService = async (rawId) => {
  const vendorId = parseMerchantId(rawId);
  const vendor = await fetchVendorById(vendorId);

  if (!vendor) {
    throw { status: 404, message: 'Merchant not found' };
  }

  return {
    id: vendor.id,
    merchant_id: formatMerchantId(vendor.id),
    name: vendor.laundry_shop_name || 'N/A',
    contact: formatPhone(vendor.mobile_number),
    status: formatMerchantStatus(vendor.is_active),
    avatar_initials: getAvatarInitials(vendor.laundry_shop_name),
    address: vendor.shop_address || 'N/A',
    business_details: [
      buildDetailKeyValue('business_name', vendor.laundry_shop_name),
      buildDetailKeyValue('owner_name', vendor.owner_contact_name),
      buildDetailKeyValue('phone', formatPhone(vendor.mobile_number)),
      buildDetailKeyValue('email', vendor.email),
      buildDetailKeyValue('address', vendor.shop_address),
      buildDetailKeyValue('service_areas', vendor.pincode),
      buildDetailKeyValue('working_days', 'N/A'),
      buildDetailKeyValue('working_hours', 'N/A'),
      buildDetailKeyValue('gst_number', vendor.gst_number),
      buildDetailKeyValue('pan_number', vendor.pan_card_number),
      buildDetailKeyValue('business_type', 'N/A'),
      buildDetailKeyValue(
        'registration_date',
        formatRegistrationDate(vendor.created_at),
      ),
    ],
    equipment_details: [
      buildDetailKeyValue('washing_machines', 'N/A'),
      buildDetailKeyValue('dryers', 'N/A'),
      buildDetailKeyValue('iron_stations', 'N/A'),
      buildDetailKeyValue('dry_cleaning_machines', 'N/A'),
      buildDetailKeyValue('detergents_used', 'N/A'),
      buildDetailKeyValue('fabric_conditioners', 'N/A'),
      buildDetailKeyValue('special_chemicals', 'N/A'),
      buildDetailKeyValue('special_handling', 'N/A'),
      buildDetailKeyValue('quality_checks', 'N/A'),
      buildDetailKeyValue('water_supply', 'N/A'),
      buildDetailKeyValue('power_backup', 'N/A'),
    ],
    banking_details: [
      buildDetailKeyValue('account_holder', vendor.account_holder_name),
      buildDetailKeyValue('bank', vendor.bank_name),
      buildDetailKeyValue('account_number', maskAccountNumber(vendor.account_number)),
      buildDetailKeyValue('ifsc_code', vendor.ifsc_code),
      buildDetailKeyValue('upi_id', 'N/A'),
    ],
  };
};

export const getAdminMerchantOrdersService = async (rawId, query = {}) => {
  const vendorId = parseMerchantId(rawId);
  const vendor = await fetchVendorById(vendorId);

  if (!vendor) {
    throw { status: 404, message: 'Merchant not found' };
  }

  const { start, end, period, orderStatus } = resolveOrderFilters(query);
  const orders = await fetchMerchantOrders({
    vendorIds: [vendorId],
    start,
    end,
    orderStatus,
  });

  const { pickupShiftSlotIds, shiftByPickupSlot } =
    await getPickupShiftConfig();

  const pipelineOrders = orders.filter((o) =>
    ACTIVE_VENDOR_STATUSES.includes(o.status),
  );
  const washLoad = Math.round(getWashLoadKg(pipelineOrders));
  const dryLoad = Math.round(getDryCleanPieces(pipelineOrders));
  const revenue = orders
    .filter((o) =>
      ['ready_for_delivery', 'out_for_delivery', 'delivered'].includes(o.status),
    )
    .reduce((sum, o) => sum + Number(o.final_total ?? o.estimated_total ?? 0), 0);

  const groupMap = new Map();

  orders.forEach((order) => {
    const receivedDate = order.vendor_received_date || start;
    const slotId = Number(order.pickup_slot_id) || 0;
    const groupKey = `${receivedDate}:${slotId}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        date: receivedDate,
        slotId,
        orders: [],
      });
    }

    groupMap.get(groupKey).orders.push(order);
  });

  const groups = [...groupMap.values()]
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return pickupShiftSlotIds.indexOf(a.slotId) - pickupShiftSlotIds.indexOf(b.slotId);
    })
    .map((group) => {
      const lotIndex = pickupShiftSlotIds.indexOf(Number(group.slotId));
      const lotCode =
        lotIndex >= 0
          ? `LOT-${String(lotIndex + 1).padStart(3, '0')}`
          : `LOT-${String(group.slotId).padStart(3, '0')}`;
      const shiftType =
        shiftByPickupSlot[group.slotId]?.shift_type || 'shift';

      return {
        date_label: formatDateLabel(group.date),
        shift_type: shiftType,
        batch: buildBatchPayload(group.orders, lotCode),
        orders: group.orders.map(mapMerchantOrder),
      };
    });

  return {
    period: period === 'custom' ? 'today' : period,
    capacity: {
      wash_by_kilo: { max: MERCHANT_WASH_CAPACITY_KG, current_load: washLoad },
      dry_clean: { max: MERCHANT_DRY_CAPACITY_PCS, current_load: dryLoad },
    },
    summary: {
      total_completed_orders: orders.filter((o) => o.status === 'delivered')
        .length,
      revenue: formatRevenue(revenue),
    },
    groups,
  };
};
