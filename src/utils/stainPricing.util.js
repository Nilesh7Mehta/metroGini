/** Fixed stain prices. User amount includes platform markup. */
export const STAIN_PRICING = {
  small: { user: 75, vendor: 50 },
  big: { user: 100, vendor: 75 },
};

export const normalizeStainSizeList = (stain_sizes) => {
  if (stain_sizes == null || stain_sizes === '') return [];
  if (Array.isArray(stain_sizes)) return stain_sizes;
  if (typeof stain_sizes === 'string' && stain_sizes.trim()) {
    try {
      const parsed = JSON.parse(stain_sizes);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* comma-separated form-data */
    }
    return stain_sizes
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
};

export const resolveStainChargesFromSizes = (sizeList, imageCount) => {
  if (!imageCount) {
    throw {
      status: 400,
      message: 'At least one image is required when is_stained is 1',
    };
  }
  if (sizeList.length !== imageCount) {
    throw {
      status: 400,
      message: 'Each stain image must have stain_size small or big',
    };
  }

  let userTotal = 0;
  let vendorTotal = 0;
  const sizes = [];

  for (const raw of sizeList) {
    const size = String(raw || '').trim().toLowerCase();
    const pricing = STAIN_PRICING[size];
    if (!pricing) {
      throw {
        status: 400,
        message: 'Each stain image must have stain_size small or big',
      };
    }
    userTotal += pricing.user;
    vendorTotal += pricing.vendor;
    sizes.push(size);
  }

  return {
    sizes,
    vendor_request_amount: vendorTotal,
    vendor_request_markup: parseFloat((userTotal - vendorTotal).toFixed(2)),
    user_stain_total: userTotal,
  };
};
