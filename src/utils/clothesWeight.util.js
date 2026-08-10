const WEIGHT_TIERS = [
  { minClothes: 10, maxClothes: 14, minKg: 3.0, maxKg: 5.0 },
  { minClothes: 15, maxClothes: 18, minKg: 5.0, maxKg: 7.0 },
  { minClothes: 19, maxClothes: 25, minKg: 8.0, maxKg: 11.0 },
];

export const getEstimatedWeightRangeFromClothesCount = (clothes_count) => {
  const count = Number(clothes_count);

  const tier = WEIGHT_TIERS.find(
    (entry) => count >= entry.minClothes && count <= entry.maxClothes,
  );

  if (!tier) {
    throw {
      status: 400,
      message: 'Clothes count must be between 10 and 25',
    };
  }

  return {
    min: tier.minKg,
    max: tier.maxKg,
  };
};
