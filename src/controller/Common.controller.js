import sql from "../config/db.js";
import { getImageUrl } from "../utils/getImageUrl.js";
import { getPickupAvailabilityCalendar } from "../services/common/timeSlotAvailability.service.js";
import { getServicesForCatalog } from "../services/common/serviceZonePrice.service.js";
import { listActiveKnowAboutUs } from "../services/admin/adminKnowAboutUs.service.js";
import { listActiveHowWeWork } from "../services/admin/adminHowWeWork.service.js";
import { listActiveFaqs } from "../services/admin/adminFaq.service.js";
import { listActiveClothesWeightTiers } from "../services/admin/adminClothesWeightTier.service.js";
import { getTermsAndConditionsFromDb } from "../services/common/termsAndConditions.service.js";
import { getPrivacyPolicyFromDb } from "../services/common/privacyPolicy.service.js";
import { TERMS_AND_CONDITIONS } from "../constants/termsAndConditions.js";

export const getCities = async (req, res, next) => {
    try {
        const { rows } = await sql.query(
            `SELECT * FROM cities ORDER BY is_available DESC, id ASC`,
        );
        res.status(200).json({
            success: true,
            message: "Cities retrieved successfully",
            data: rows,
        });
    } catch (error) {
        next(error);
    }
};

export const getServices = async (req, res, next) => {
    try {
        const pincode = req.query.pincode;
        const data = await getServicesForCatalog({
            pincode,
            pincode_group_id: req.query.pincode_group_id ?? req.query.zone_id,
        });
        res.status(200).json({
            success: true,
            message: "Services retrieved successfully",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getServiceTypes = async (req, res, next) => {
    try {
        const { rows } = await sql.query(`SELECT * FROM service_types where is_active = TRUE order by id desc`);
        res.status(200).json({
            success: true,
            message: "Service types retrieved successfully",
            data: rows,
        });
    }
        catch (error) {
        next(error);
    }
};

export const getTimeSlots = async (req, res, next) => {
    try {
        const data = await getPickupAvailabilityCalendar();
        res.status(200).json({
            success: true,
            message: "Time slots retrieved successfully",
            data,
        });
    } catch (error) {
        next(error);
    }
};


export const getFaqs = async (req, res, next) => {
  try {
    const rows = await listActiveFaqs();
    const data = rows.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      sequence: row.sequence,
    }));

    res.status(200).json({
      success: true,
      message: "FAQ retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/** @deprecated use GET /api/common/faq */
export const userFaq = getFaqs;

const toMoney = (value) => parseFloat(Number(value).toFixed(2));

export const getClothesWeightTiers = async (req, res, next) => {
  try {
    const serviceIdRaw = req.query.service_id;
    const serviceId =
      serviceIdRaw != null && serviceIdRaw !== "" ? Number(serviceIdRaw) : null;
    if (serviceId != null && (!Number.isInteger(serviceId) || serviceId <= 0)) {
      return res.status(400).json({
        success: false,
        message: "service_id must be a positive integer",
      });
    }

    const [rows, catalog] = await Promise.all([
      listActiveClothesWeightTiers(),
      getServicesForCatalog({
        pincode: req.query.pincode,
        pincode_group_id: req.query.pincode_group_id ?? req.query.zone_id,
      }),
    ]);

    const services = catalog.filter(
      (s) => s.is_active && (serviceId == null || Number(s.id) === serviceId),
    );
    const zoneRow = catalog.find((s) => s.zone_id != null);

    const tiers = rows.map((row) => {
      const minKg = Number(row.min_kg);
      const maxKg = Number(row.max_kg);
      return {
        id: row.id,
        min_clothes: Number(row.min_clothes),
        max_clothes: Number(row.max_clothes),
        min_kg: minKg,
        max_kg: maxKg,
        prices: services.map((s) => {
          const pricePerKg = toMoney(s.base_price_per_kg);
          return {
            service_id: Number(s.id),
            service_name: s.name,
            base_price_per_kg: pricePerKg,
            min_price: toMoney(minKg * pricePerKg),
            max_price: toMoney(maxKg * pricePerKg),
          };
        }),
      };
    });

    res.status(200).json({
      success: true,
      message: "Clothes weight tiers retrieved successfully",
      data: {
        min_clothes: tiers.length ? Math.min(...tiers.map((t) => t.min_clothes)) : null,
        max_clothes: tiers.length ? Math.max(...tiers.map((t) => t.max_clothes)) : null,
        zone: zoneRow
          ? {
              id: Number(zoneRow.zone_id),
              code: zoneRow.zone_code,
              name: zoneRow.zone_name,
            }
          : null,
        tiers,
      },
    });
  } catch (error) {
    next(error);
  }
};


export const shift = async(req , res , next) =>{
    try{
        const {rows} = await sql.query(`SELECT * FROM shifts ORDER BY id DESC`);
        res.status(200).json({
            success:true,
            message: 'Shift retrieved Successfully',
            data:rows
        })
    }catch(error){
        next(error)
    }
}

export const getBanners = async (req, res, next) => {
  try {

    const { rows } = await sql.query(
      `SELECT
         b.id,
         b.image_url,
         c.coupon_code
       FROM banners b
       LEFT JOIN coupons c ON c.id = b.coupon_id
       ORDER BY b.id ASC
       LIMIT 2`
    );

    const banners = rows.map((banner) => ({
      id: banner.id,
      image: getImageUrl(req, banner.image_url),
      couponCode: banner.coupon_code || null,
    }));

    res.status(200).json({
      success: true,
      data: banners
    });

  } catch (error) {
    next(error);
  }
};

export const getKnowAboutUs = async (req, res, next) => {
  try {
    const rows = await listActiveKnowAboutUs();
    const data = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      image: getImageUrl(req, row.image),
      sequence: row.sequence,
    }));

    res.status(200).json({
      success: true,
      message: "Know about us items retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getHowWeWork = async (req, res, next) => {
  try {
    const rows = await listActiveHowWeWork();
    const data = rows.map((row) => ({
      id: row.id,
      heading: row.heading,
      image: getImageUrl(req, row.image),
    }));

    res.status(200).json({
      success: true,
      message: "How we work items retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getTermsAndConditions = async (req, res, next) => {
  try {
    let data;
    try {
      data = await getTermsAndConditionsFromDb();
    } catch (error) {
      if (error.status !== 404) throw error;
      data = TERMS_AND_CONDITIONS;
    }

    res.status(200).json({
      success: true,
      message: "Terms and conditions retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPrivacyPolicy = async (req, res, next) => {
  try {
    const data = await getPrivacyPolicyFromDb();
    res.status(200).json({
      success: true,
      message: "Privacy policy retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
