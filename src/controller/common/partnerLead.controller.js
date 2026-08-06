import { createPartnerLead } from "../../services/common/partnerLead.service.js";

export const submitPartnerLead = async (req, res, next) => {
  try {
    const data = await createPartnerLead(req.body);
    return res.status(201).json({
      success: true,
      message: "Partner lead submitted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
