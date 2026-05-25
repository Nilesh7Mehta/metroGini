import sql from "../../config/db.js";
import { updateVendorService } from "./vendor.service.js";

const DEFAULT_PROFILE_IMAGE = "/assets/images/avatar.png";

const formatMerchantId = (id) => `MER-${String(id).padStart(3, "0")}`;

export const formatVendorProfile = (vendor) => ({
  merchant: {
    id: formatMerchantId(vendor.id),
    laundry_name: vendor.laundry_shop_name ?? null,
    owner_name: vendor.owner_contact_name ?? null,
    profile_image: DEFAULT_PROFILE_IMAGE,
    mobile: vendor.mobile_number ?? null,
    email: vendor.email ?? null,
    status: vendor.status ?? null,
    gst_number: vendor.gst_number ?? null,
    pan_number: vendor.pan_card_number ?? null,
  },
  address: {
    shop_address: vendor.shop_address ?? null,
  },
  bank_details: {
    account_holder_name: vendor.account_holder_name ?? null,
    bank_name: vendor.bank_name ?? null,
    account_number: vendor.account_number ?? null,
    ifsc_code: vendor.ifsc_code ?? null,
  },
  is_terms_and_condtion: Boolean(vendor.is_terms_and_condition),
  is_active: Boolean(vendor.is_active),
});

const mapProfileUpdateBody = (body) => {
  const merchant = body.merchant || {};
  const address = body.address || {};
  const bank = body.bank_details || {};

  return {
    owner_contact_name:
      merchant.owner_name ?? body.owner_name ?? body.owner_contact_name,
    mobile_number:
      merchant.mobile ?? body.mobile ?? body.mobile_number,
    email: merchant.email ?? body.email,
    laundry_shop_name:
      merchant.laundry_name ?? body.laundry_name ?? body.laundry_shop_name,
    pan_card_number:
      merchant.pan_number ?? body.pan_number ?? body.pan_card_number,
    gst_number: merchant.gst_number ?? body.gst_number,
    shop_address:
      address.shop_address ?? body.shop_address,
    account_holder_name:
      bank.account_holder_name ?? body.account_holder_name,
    bank_name: bank.bank_name ?? body.bank_name,
    account_number: bank.account_number ?? body.account_number,
    ifsc_code: bank.ifsc_code ?? body.ifsc_code,
    pincode: body.pincode,
    aadhar_number: body.aadhar_number,
  };
};

export const getVendorProfileService = async (vendorId) => {
  const { rows } = await sql.query(
    `SELECT id, owner_contact_name, mobile_number, email, laundry_shop_name,
            shop_address, gst_number, pan_card_number, account_holder_name,
            bank_name, account_number, ifsc_code, status,
            is_terms_and_condition, is_active
     FROM vendors
     WHERE id = $1`,
    [vendorId],
  );

  if (!rows.length) {
    throw { status: 404, message: "Vendor not found" };
  }

  return formatVendorProfile(rows[0]);
};

export const updateVendorProfileService = async (vendorId, body) => {
  const mapped = mapProfileUpdateBody(body);
  const updated = await updateVendorService(vendorId, mapped, null);
  return formatVendorProfile(updated);
};
