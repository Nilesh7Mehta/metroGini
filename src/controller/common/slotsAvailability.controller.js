import {
  getDeliveryDates,
  getSlotsAvailability,
} from '../../services/common/slotAvailability.service.js';

const handleError = (res, err, next) => {
  if (err.status) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};

export const getAvailability = async (req, res, next) => {
  try {
    const data = await getSlotsAvailability({
      pincodeGroupId: req.query.pincodeGroupId,
      days: req.query.days,
    });

    return res.status(200).json({
      success: true,
      message: 'Slot availability retrieved successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const getDeliveryDate = async (req, res, next) => {
  try {
    const data = await getDeliveryDates({
      laundryId: req.query.laundryId,
      currentDeliveryDate: req.query.currentDeliveryDate,
      days: req.query.days,
    });

    return res.status(200).json({
      success: true,
      message: 'Delivery dates retrieved successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
