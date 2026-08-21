import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import sql from '../config/db.js';
import { buildOrderBillingPayload } from './orderBilling.util.js';
import { splitGstComponents } from './price.util.js';

const INVOICE_DIR = path.join(process.cwd(), 'uploads', 'order-invoices');
const LOGO_PATH = path.join(process.cwd(), 'uploads', 'logo.png');

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 40;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const COLORS = {
  ink: '#000000',
  muted: '#6A6A6A',
  soft: '#8A8A8A',
  line: '#E8E8E8',
  headerBg: '#F3F3F3',
  white: '#FFFFFF',
  green: '#0F9D58',
  footerBg: '#1c8c9c',
  footerMuted: '#99F6E4',
};

const FONT_CANDIDATES = [
  {
    regular: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'segoeui.ttf'),
    bold: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'segoeuib.ttf'),
  },
  {
    regular: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arial.ttf'),
    bold: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arialbd.ttf'),
  },
];

const resolveFonts = () => {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate.regular) && fs.existsSync(candidate.bold)) {
      return candidate;
    }
  }
  return null;
};

const formatMoney = (value) => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const fixed = safe.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `Rs.${withCommas}.${dec}`;
};

const formatIssuedDate = (date = new Date()) =>
  date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

const registerFonts = (doc) => {
  const fonts = resolveFonts();
  if (fonts) {
    doc.registerFont('Body', fonts.regular);
    doc.registerFont('BodyBold', fonts.bold);
    return { regular: 'Body', bold: 'BodyBold' };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
};

const hairline = (doc, y) => {
  doc
    .strokeColor(COLORS.line)
    .lineWidth(1)
    .moveTo(MARGIN_X, y)
    .lineTo(PAGE_W - MARGIN_X, y)
    .stroke();
};

const row = (doc, fonts, label, value, y, size = 13) => {
  doc
    .fillColor(COLORS.ink)
    .font(fonts.regular)
    .fontSize(size)
    .text(label, MARGIN_X, y, { width: CONTENT_W * 0.62, lineBreak: false });
  doc
    .fillColor(COLORS.ink)
    .font(fonts.regular)
    .fontSize(size)
    .text(value, MARGIN_X, y, {
      width: CONTENT_W,
      align: 'right',
      lineBreak: false,
    });
};

export const ensureOrderInvoiceDir = () => {
  if (!fs.existsSync(INVOICE_DIR)) {
    fs.mkdirSync(INVOICE_DIR, { recursive: true });
  }
};

const buildOrderReceiptPdf = (data) =>
  new Promise((resolve, reject) => {
    const name = String(data.user_name || 'Customer');
    const orderRef = String(data.order_code || `#${data.order_id}`);
    const invoiceId = String(data.invoice_id);
    const issued = formatIssuedDate();
    const total = formatMoney(data.final_total);
    const advance = formatMoney(data.advance_paid);
    const remaining = formatMoney(data.remaining_paid);
    const subtotal = formatMoney(data.subtotal_before_gst);
    const cgst = formatMoney(data.cgst);
    const sgst = formatMoney(data.sgst);
    const gstTotal = formatMoney(data.gst);
    const hasGstBreakdown =
      data.subtotal_before_gst != null && data.gst != null;
    const isPaid = data.payment_status === 'paid' || data.is_paid === true;
    const payWhen = formatIssuedDate(
      data.paid_at ? new Date(data.paid_at) : new Date(),
    );

    const actualWeight = data.actual_weight != null
      ? `${Number(data.actual_weight).toFixed(1)} kg`
      : data.estimated_weight_min != null
        ? `${data.estimated_weight_min}–${data.estimated_weight_max} kg (est.)`
        : '-';

    const clothesCount =
      data.actual_clothes_count != null
        ? String(data.actual_clothes_count)
        : data.clothes_count != null
          ? `${data.clothes_count} (est.)`
          : '-';

    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `MetroGini Order Receipt - ${orderRef}`,
        Author: 'MetroGini',
      },
    });

    const fonts = registerFonts(doc);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accentSize = 78;
    const accentX = PAGE_W - MARGIN_X - accentSize;
    const textMaxW = CONTENT_W - (fs.existsSync(LOGO_PATH) ? accentSize + 20 : 0);

    const greeting = `Thanks for choosing us, ${name}`;
    doc.font(fonts.bold).fontSize(24);
    const greetingH = doc.heightOfString(greeting, {
      width: textMaxW,
      lineGap: 2,
    });
    const subtitle = isPaid
      ? 'Here is your laundry order receipt.'
      : 'Here is your laundry billing summary.';
    doc.font(fonts.regular).fontSize(13);
    const subtitleH = doc.heightOfString(subtitle, { width: textMaxW });

    const greetingY = 78;
    const subtitleY = greetingY + greetingH + 10;
    const headerH = Math.max(168, subtitleY + subtitleH + 22);

    doc.rect(0, 0, PAGE_W, headerH).fill(COLORS.headerBg);

    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(18)
      .text('MetroGini', MARGIN_X, 30);

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(11)
      .text(issued, MARGIN_X, 34, { width: CONTENT_W, align: 'right' });

    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, accentX, 82, {
        width: accentSize,
        height: accentSize,
      });
    }

    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(24)
      .text(greeting, MARGIN_X, greetingY, { width: textMaxW, lineGap: 2 });

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(13)
      .text(subtitle, MARGIN_X, subtitleY, { width: textMaxW });

    let y = headerH + 28;

    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(18)
      .text('Total', MARGIN_X, y + 4);

    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(28)
      .text(total, MARGIN_X, y, { width: CONTENT_W, align: 'right' });

    y += 42;
    hairline(doc, y);
    y += 20;

    if (hasGstBreakdown) {
      row(doc, fonts, 'Taxable value', subtotal, y);
      y += 26;
      row(doc, fonts, 'CGST (9%)', cgst, y);
      y += 26;
      row(doc, fonts, 'SGST (9%)', sgst, y);
      y += 26;
      row(doc, fonts, 'GST total (18%)', gstTotal, y);
      y += 26;
    }
    row(doc, fonts, 'Grand total (incl. GST)', total, y);
    y += 26;
    row(doc, fonts, 'Advance paid', advance, y);
    y += 26;
    row(doc, fonts, isPaid ? 'Final amount paid' : 'Amount due', remaining, y);
    y += 28;
    hairline(doc, y);
    y += 26;

    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(18)
      .text('Payments', MARGIN_X, y);
    y += 28;

    doc
      .roundedRect(MARGIN_X, y, 28, 28, 6)
      .fill(isPaid ? COLORS.green : COLORS.muted);
    doc
      .fillColor(COLORS.white)
      .font(fonts.bold)
      .fontSize(11)
      .text(isPaid ? 'P' : '!', MARGIN_X, y + 7, { width: 28, align: 'center' });

    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(14)
      .text(isPaid ? 'Payment received' : 'Payment pending', MARGIN_X + 40, y + 1);
    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(12)
      .text(isPaid ? payWhen : 'No payment recorded yet', MARGIN_X + 40, y + 18);
    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(14)
      .text(remaining, MARGIN_X, y + 6, {
        width: CONTENT_W,
        align: 'right',
      });

    y += 44;
    hairline(doc, y);
    y += 18;

    // ========== footer geometry ==========
    const FOOTER_H = 100;
    const footerY = PAGE_H - FOOTER_H;

    if (y > footerY - 80) y = footerY - 80;

    const legalMaxH = Math.max(20, footerY - y - 16);

    doc
      .fillColor(COLORS.soft)
      .font(fonts.regular)
      .fontSize(9)
      .text(
        `Not a GST invoice. Order ${orderRef} · Invoice ${invoiceId} · Weight ${actualWeight} · ${clothesCount} clothes. MetroGini does not replace formal GST invoices where applicable.`,
        MARGIN_X,
        y,
        {
          width: CONTENT_W,
          lineGap: 1,
          height: legalMaxH,
          ellipsis: true,
        },
      );

    if (typeof doc.bufferedPageRange === 'function') {
      const range = doc.bufferedPageRange();
      if (range?.count > 0) doc.switchToPage(range.start);
    }

    doc.rect(0, footerY, PAGE_W, FOOTER_H).fill(COLORS.footerBg);
    doc
      .fillColor(COLORS.white)
      .font(fonts.bold)
      .fontSize(22)
      .text('MetroGini', MARGIN_X, footerY + 26, { lineBreak: false });
    doc
      .fillColor(COLORS.footerMuted)
      .font(fonts.regular)
      .fontSize(12)
      .text('Laundry · Order Receipt', MARGIN_X, footerY + 56, {
        lineBreak: false,
      });
    doc
      .fillColor(COLORS.white)
      .font(fonts.regular)
      .fontSize(12)
      .text('Order receipt', MARGIN_X, footerY + 24, {
        width: CONTENT_W,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(COLORS.footerMuted)
      .font(fonts.regular)
      .fontSize(11)
      .text(invoiceId, MARGIN_X, footerY + 46, {
        width: CONTENT_W,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(COLORS.footerMuted)
      .font(fonts.regular)
      .fontSize(10)
      .text(orderRef, MARGIN_X, footerY + 66, {
        width: CONTENT_W,
        align: 'right',
        lineBreak: false,
      });

    doc.end();
  });

/**
 * Load order + payment info and write Uber-style receipt PDF.
 */
export const ensureUserOrderInvoiceFile = async (
  orderId,
  { force = false, paymentMethod = 'Online' } = {},
) => {
  ensureOrderInvoiceDir();

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.final_total,
      o.amount_paid,
      o.remaining_amount,
      o.actual_weight,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.estimated_total,
      o.base_price_per_kg,
      o.extra_price_per_kg,
      o.flat_fee,
      o.peak_extra_charge,
      o.is_stained,
      o.vendor_request_amount,
      o.vendor_request_markup,
      o.applied_coupon_id,
      o.payment_status,
      o.payment_completed_at,
      o.clothes_count,
      o.actual_clothes_count,
      o.pickup_date,
      o.delivery_date,
      o.status,
      u.full_name AS user_name,
      u.email AS user_email,
      u.mobile AS user_mobile,
      v.laundry_shop_name AS vendor_name,
      c.coupon_code,
      c.discount_type,
      c.discount_value,
      c.minimum_amount_value,
      c.maximum_amount_value,
      (
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        WHERE p.order_id = o.id
          AND p.payment_type = 'advance'
          AND p.status = 'success'
      ) AS advance_paid,
      (
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        WHERE p.order_id = o.id
          AND p.payment_type = 'remaining'
          AND p.status = 'success'
      ) AS remaining_paid
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN vendors v ON v.id = o.vendor_id
    LEFT JOIN coupons c ON c.id = o.applied_coupon_id
    WHERE o.id = $1
    `,
    [orderId],
  );

  if (!rows[0]) {
    throw { status: 404, message: 'Order not found for invoice' };
  }

  const order = rows[0];
  const invoiceId = `INV-ORD-${order.id}`;
  const filename = `order-${order.id}.pdf`;
  const absPath = path.join(INVOICE_DIR, filename);
  const publicPath = `/uploads/order-invoices/${filename}`;

  const finalTotal = Number(order.final_total || 0);
  let advancePaid = Number(order.advance_paid || 0);
  let remainingPaid = Number(order.remaining_paid || 0);

  // Fallback when payment rows are sparse
  if (advancePaid <= 0 && remainingPaid <= 0) {
    remainingPaid = Number(
      order.remaining_amount != null
        ? order.remaining_amount
        : finalTotal,
    );
    advancePaid = Math.max(0, finalTotal - remainingPaid);
  } else if (remainingPaid <= 0 && finalTotal > advancePaid) {
    remainingPaid = finalTotal - advancePaid;
  }

  const billing = buildOrderBillingPayload(order);
  const subtotalBeforeGst = Number(billing.subtotal || 0);
  const gstAmount = Number(billing.gst || 0);
  const gstParts = splitGstComponents(gstAmount);
  const additionalCharges = Array.isArray(billing.additional_charges)
    ? billing.additional_charges
    : [];

  // Lines that add up to taxable value (estimated_total already includes service fee + peak)
  const bakedInLabels = new Set(['Service Fee', 'Peak Hour Surcharge']);
  const additiveCharges = additionalCharges.filter(
    (charge) => !bakedInLabels.has(charge.name),
  );
  const laundryCharges = Math.round(Number(order.estimated_total || 0));
  const invoiceLines = [
    ...(laundryCharges > 0
      ? [{ name: 'Laundry charges', amount: laundryCharges }]
      : []),
    ...additiveCharges.map((charge) => ({
      name: charge.name,
      amount: Number(charge.amount),
    })),
  ];

  const isPaid = String(order.payment_status || '') === 'paid';

  const orderForEmail = {
    ...order,
    final_total: finalTotal,
    advance_paid: advancePaid,
    remaining_paid: remainingPaid,
    payment_status: order.payment_status,
    is_paid: isPaid,
    subtotal_before_gst: subtotalBeforeGst,
    gst: gstAmount,
    gst_rate: gstParts.gst_rate,
    cgst: gstParts.cgst,
    sgst: gstParts.sgst,
    cgst_rate: gstParts.cgst_rate,
    sgst_rate: gstParts.sgst_rate,
    invoice_lines: invoiceLines,
    additional_charges: additiveCharges,
    vendor_name: order.vendor_name,
    actual_weight: order.actual_weight,
    clothes_count: order.actual_clothes_count ?? order.clothes_count,
  };

  if (!force && fs.existsSync(absPath)) {
    return {
      invoice_id: invoiceId,
      invoice_image: publicPath,
      absPath,
      order: orderForEmail,
      billing,
      filename,
    };
  }

  const pdf = await buildOrderReceiptPdf(
    {
      order_id: order.id,
      order_code: order.order_code,
      invoice_id: invoiceId,
      user_name: order.user_name,
      user_mobile: order.user_mobile,
      final_total: finalTotal,
      advance_paid: advancePaid,
      remaining_paid: remainingPaid,
      subtotal_before_gst: subtotalBeforeGst,
      gst: gstAmount,
      cgst: gstParts.cgst,
      sgst: gstParts.sgst,
      actual_weight: order.actual_weight,
      estimated_weight_min: order.estimated_weight_min,
      estimated_weight_max: order.estimated_weight_max,
      clothes_count: order.clothes_count,
      actual_clothes_count: order.actual_clothes_count,
      pickup_date: order.pickup_date,
      delivery_date: order.delivery_date,
      status: order.status,
      vendor_name: order.vendor_name,
      payment_method: paymentMethod,
      payment_status: order.payment_status,
      is_paid: isPaid,
      paid_at: order.payment_completed_at,
    },
  );

  fs.writeFileSync(absPath, pdf);

  return {
    invoice_id: invoiceId,
    invoice_image: publicPath,
    absPath,
    order: orderForEmail,
    billing,
    filename,
  };
};
