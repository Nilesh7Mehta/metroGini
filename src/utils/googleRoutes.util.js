/**
 * Google Maps Routes API — waypoint order optimization.
 * Docs: https://developers.google.com/maps/documentation/routes/opt-way
 */

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const FIELD_MASK = [
  "routes.optimizedIntermediateWaypointIndex",
  "routes.duration",
  "routes.distanceMeters",
  "routes.polyline.encodedPolyline",
].join(",");

const buildAddressWaypoint = (address) => ({
  address: String(address).trim(),
});

const buildLatLngWaypoint = (latitude, longitude) => ({
  location: {
    latLng: {
      latitude: Number(latitude),
      longitude: Number(longitude),
    },
  },
});

/**
 * Optimize stop order for a single rider trip.
 * Origin stays fixed; intermediate stops are reordered; destination stays fixed.
 *
 * @param {object} params
 * @param {{ address?: string, latitude?: number, longitude?: number }} params.origin
 * @param {{ address?: string, latitude?: number, longitude?: number }} params.destination
 * @param {Array<{ address?: string, latitude?: number, longitude?: number }>} params.intermediates
 * @returns {Promise<{ optimizedIndexes: number[], duration: string|null, distanceMeters: number|null, polyline: string|null }>}
 */
export const optimizeWaypointOrder = async ({
  origin,
  destination,
  intermediates = [],
}) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey?.trim()) {
    throw {
      status: 500,
      message: "GOOGLE_MAPS_API_KEY is not configured",
    };
  }

  const toWaypoint = (point) => {
    if (
      point?.latitude != null &&
      point?.longitude != null &&
      !Number.isNaN(Number(point.latitude)) &&
      !Number.isNaN(Number(point.longitude))
    ) {
      return buildLatLngWaypoint(point.latitude, point.longitude);
    }
    if (point?.address?.trim()) {
      return buildAddressWaypoint(point.address);
    }
    throw {
      status: 400,
      message: "Each waypoint needs address or latitude/longitude",
    };
  };

  const body = {
    origin: toWaypoint(origin),
    destination: toWaypoint(destination),
    intermediates: intermediates.map(toWaypoint),
    travelMode: "DRIVE",
    optimizeWaypointOrder: true,
    regionCode: process.env.GOOGLE_MAPS_REGION_CODE || "IN",
    languageCode: process.env.GOOGLE_MAPS_LANGUAGE_CODE || "en",
  };

  const response = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const googleMessage =
      data?.error?.message ||
      data?.message ||
      `Google Routes API failed with status ${response.status}`;
    throw {
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
      message: googleMessage,
    };
  }

  const route = data?.routes?.[0];
  if (!route) {
    throw {
      status: 502,
      message: "Google Routes API returned no route",
    };
  }

  return {
    optimizedIndexes: route.optimizedIntermediateWaypointIndex || [],
    duration: route.duration || null,
    distanceMeters:
      route.distanceMeters != null ? Number(route.distanceMeters) : null,
    polyline: route.polyline?.encodedPolyline || null,
  };
};
