import sql from "../config/db.js";
import { listActiveClothesWeightTiers } from "../services/admin/adminClothesWeightTier.service.js";

export const getEstimatedWeightRangeFromClothesCount = async (clothes_count, db = sql) => {
  const count = Number(clothes_count);
  const tiers = await listActiveClothesWeightTiers(db);

  if (tiers.length === 0) {
    throw { status: 400, message: "Clothes weight tiers are not configured" };
  }

  const tier = Number.isInteger(count)
    ? tiers.find(
        (entry) =>
          count >= Number(entry.min_clothes) && count <= Number(entry.max_clothes),
      )
    : null;

  if (!tier) {
    const minClothes = Math.min(...tiers.map((entry) => Number(entry.min_clothes)));
    const maxClothes = Math.max(...tiers.map((entry) => Number(entry.max_clothes)));
    const outOfRange = !Number.isInteger(count) || count < minClothes || count > maxClothes;

    throw {
      status: 400,
      message: outOfRange
        ? `Clothes count must be between ${minClothes} and ${maxClothes}`
        : `No weight tier configured for ${count} clothes`,
    };
  }

  return {
    min: Number(tier.min_kg),
    max: Number(tier.max_kg),
  };
};
