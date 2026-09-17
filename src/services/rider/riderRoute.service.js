import {
  fetchTodayOrders,
  fetchTodayDeliveryOrders,
} from "./riderOrder.service.js";
import { optimizeWaypointOrder } from "../../utils/googleRoutes.util.js";

const PICKUP_STATUSES = new Set(["out_for_pickup", "pickup_in_progress"]);
const DELIVERY_STATUSES = new Set(["ready_for_delivery", "out_for_delivery"]);

const formatStopAddress = (order) => {
  const parts = [order.complete_address, order.pincode].filter(Boolean);
  return parts.join(", ");
};

const hasValidCoords = (latitude, longitude) =>
  latitude != null &&
  longitude != null &&
  !Number.isNaN(Number(latitude)) &&
  !Number.isNaN(Number(longitude));

const toStop = (order, routeLeg) => ({
  ...order,
  route_leg: routeLeg,
  stop_address: formatStopAddress(order),
});

/**
 * Collect today's actionable pickup + delivery stops for one rider.
 * Pickup + delivery are mixed in one route.
 */
const collectTodayStops = async (rider_id) => {
  const [pickupOrders, deliveryOrders] = await Promise.all([
    fetchTodayOrders(rider_id),
    fetchTodayDeliveryOrders(rider_id),
  ]);

  const pickupStops = pickupOrders
    .filter((o) => PICKUP_STATUSES.has(o.status))
    .map((o) => toStop(o, "pickup"));

  const deliveryStops = deliveryOrders
    .filter((o) => DELIVERY_STATUSES.has(o.status))
    .map((o) => toStop(o, "delivery"));

  // Fallback: if filters empty (all done / edge statuses), use full today lists
  if (!pickupStops.length && !deliveryStops.length) {
    return [
      ...pickupOrders.map((o) => toStop(o, "pickup")),
      ...deliveryOrders.map((o) => toStop(o, "delivery")),
    ];
  }

  return [...pickupStops, ...deliveryStops];
};

const formatOrderSequenceItem = (order) => ({
  id: order.id,
  status: order.status,
  route_leg: order.route_leg,
  customer_name: order.customer_name ?? null,
  customer_number: order.customer_number ?? null,
  complete_address: order.complete_address ?? null,
  pincode: order.pincode ?? null,
  latitude: Number(order.latitude),
  longitude: Number(order.longitude),
});

const buildLatLongList = (vendorPoint, optimizedStops) => [
  {
    latitude: vendorPoint.latitude,
    longitude: vendorPoint.longitude,
    order_id: null,
    type: "vendor",
  },
  ...optimizedStops.map((order) => ({
    latitude: Number(order.latitude),
    longitude: Number(order.longitude),
    order_id: order.id,
    type: order.route_leg,
  })),
  {
    latitude: vendorPoint.latitude,
    longitude: vendorPoint.longitude,
    order_id: null,
    type: "vendor",
  },
];

/**
 * Optimize stop order with vendor as fixed start + end depot.
 * One rider → one vendor; pickup + delivery mixed.
 */
const buildOptimizedStops = async (stops) => {
  if (!stops.length) {
    return {
      orderSequence: [],
      latlong: [],
    };
  }

  const vendorLatitude = stops[0].vendor_latitude;
  const vendorLongitude = stops[0].vendor_longitude;

  if (!hasValidCoords(vendorLatitude, vendorLongitude)) {
    throw {
      status: 400,
      message: "Vendor location is not configured",
    };
  }

  const missingCustomerCoords = stops.find(
    (s) => !hasValidCoords(s.latitude, s.longitude),
  );
  if (missingCustomerCoords) {
    throw {
      status: 400,
      message: `Order ${missingCustomerCoords.id} has no coordinates`,
    };
  }

  const vendorPoint = {
    latitude: Number(vendorLatitude),
    longitude: Number(vendorLongitude),
  };

  // Single stop: skip Google, still return vendor → order → vendor
  if (stops.length === 1) {
    return {
      orderSequence: stops.map(formatOrderSequenceItem),
      latlong: buildLatLongList(vendorPoint, stops),
    };
  }

  const result = await optimizeWaypointOrder({
    origin: vendorPoint,
    destination: vendorPoint,
    intermediates: stops.map((stop) => ({
      latitude: Number(stop.latitude),
      longitude: Number(stop.longitude),
    })),
  });

  const indexes = result.optimizedIndexes || [];
  const optimizedStops =
    indexes.length === stops.length
      ? indexes.map((idx) => stops[idx])
      : stops;

  return {
    orderSequence: optimizedStops.map(formatOrderSequenceItem),
    latlong: buildLatLongList(vendorPoint, optimizedStops),
  };
};

/**
 * Today's pickup + delivery → optimized sequence.
 * Start/end = vendor lat/long (not rider GPS).
 *
 * @param {number} rider_id
 */
export const getOptimizedRiderRoute = async (rider_id) => {
  const stops = await collectTodayStops(rider_id);
  const optimized = await buildOptimizedStops(stops);

  return {
    success: true,
    orderSequence: optimized.orderSequence,
    latlong: optimized.latlong,
  };
};
