import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import sql from '../config/db.js';

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
  buttonBg: '#EEEEEE',
  green: '#0F9D58',
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

const buildOrderReceiptPdf = (data, publicPath) =>
  new Promise((resolve, reject) => {
    const name = String(data.user_name || 'Customer');
    const orderRef = String(data.order_code || `#${data.order_id}`);
    const invoiceId = String(data.invoice_id);
    const issued = formatIssuedDate();
    const total = formatMoney(data.final_total);
    const advance = formatMoney(data.advance_paid);
    const remaining = formatMoney(data.remaining_paid);
    const payMethod = String(data.payment_method || 'Online');
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

    const fmtDate = (v) => {
      if (!v) return '-';
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
    };

    const pickupDate = fmtDate(data.pickup_date);
    const deliveryDate = fmtDate(data.delivery_date);
    const vendorName = String(data.vendor_name || '-');
    const userMobile = String(data.user_mobile || '-');

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
    const subtitle = 'Here is your laundry order receipt.';
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

    row(doc, fonts, 'Order total', total, y);
    y += 26;
    row(doc, fonts, 'Advance paid', advance, y);
    y += 26;
    row(doc, fonts, 'Final amount paid', remaining, y);
    y += 28;
    hairline(doc, y);
    y += 26;

    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(18)
      .text('Payments', MARGIN_X, y);
    y += 28;

    doc.roundedRect(MARGIN_X, y, 28, 28, 6).fill(COLORS.green);
    doc
      .fillColor(COLORS.white)
      .font(fonts.bold)
      .fontSize(11)
      .text('P', MARGIN_X, y + 7, { width: 28, align: 'center' });

    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(14)
      .text('Payment received', MARGIN_X + 40, y + 1);
    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(12)
      .text(payWhen, MARGIN_X + 40, y + 18);
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

    // ========== footer geometry (needed for clipping below) ==========
    const FOOTER_H = 100;
    const footerY = PAGE_H - FOOTER_H;
    // Reserve space: download row 50 + hairline + legal 3 lines ~50 + gaps ~36 = 140
    const CONTENT_BOTTOM = footerY - 140;

    // ========== Order details card ==========
    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(16)
      .text('Order details', MARGIN_X, y);
    y += 20;

    const details = [
      ['Order ID', orderRef],
      ['Invoice', invoiceId],
      ['Clothes count', clothesCount],
      ['Weight', actualWeight],
      ['Pickup date', pickupDate],
      ['Delivery date', deliveryDate],
    ];

    const DET_ROW_H = 22;
    // Calculate how many rows fit before CONTENT_BOTTOM
    const availForCard = CONTENT_BOTTOM - y - 12; // 12 = top padding inside card
    const maxRows = Math.max(1, Math.floor(availForCard / DET_ROW_H));
    const visibleDetails = details.slice(0, maxRows);
    const detailsH = visibleDetails.length * DET_ROW_H + 14;

    doc.roundedRect(MARGIN_X, y, CONTENT_W, detailsH, 8).fill('#F5F5F5');

    let dy = y + 10;
    for (const [label, value] of visibleDetails) {
      doc
        .fillColor(COLORS.muted)
        .font(fonts.regular)
        .fontSize(10.5)
        .text(label, MARGIN_X + 14, dy, { lineBreak: false });
      doc
        .fillColor(COLORS.ink)
        .font(fonts.bold)
        .fontSize(10.5)
        .text(String(value), MARGIN_X, dy, {
          width: CONTENT_W - 14,
          align: 'right',
          lineBreak: false,
        });
      dy += DET_ROW_H;
    }

    y = dy + 10;
    // Hard-clamp so nothing overlaps the footer
    if (y > CONTENT_BOTTOM) y = CONTENT_BOTTOM;

    hairline(doc, y);
    y += 16;

    const baseUrl = String(
      process.env.API_BASE_URL ||
        process.env.SERVER_URL ||
        `http://localhost:${process.env.PORT || 4001}`,
    ).replace(/\/$/, '');
    const downloadUrl = `${baseUrl}${publicPath}?download=1`;

    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(13)
      .text('Download the receipt in a PDF format', MARGIN_X, y + 10, {
        width: CONTENT_W * 0.55,
      });

    const btnW = 148;
    const btnH = 36;
    const btnX = PAGE_W - MARGIN_X - btnW;
    doc.roundedRect(btnX, y, btnW, btnH, 18).fill(COLORS.buttonBg);
    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(12)
      .text('Download PDF', btnX, y + 11, {
        width: btnW,
        align: 'center',
      });
    doc.link(btnX, y, btnW, btnH, downloadUrl);

    y += 56;
    // Clamp before legal text so it never reaches the footer
    if (y > footerY - 80) y = footerY - 80;
    hairline(doc, y);
    y += 14;

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

    doc.rect(0, footerY, PAGE_W, FOOTER_H).fill('#000000');
    doc
      .fillColor(COLORS.white)
      .font(fonts.bold)
      .fontSize(22)
      .text('MetroGini', MARGIN_X, footerY + 26, { lineBreak: false });
    doc
      .fillColor('#A0A0A0')
      .font(fonts.regular)
      .fontSize(12)
      .text('Laundry · Order Receipt', MARGIN_X, footerY + 56, {
        lineBreak: false,
      });
    doc
      .fillColor('#BDBDBD')
      .font(fonts.regular)
      .fontSize(12)
      .text('Order receipt', MARGIN_X, footerY + 24, {
        width: CONTENT_W,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor('#8A8A8A')
      .font(fonts.regular)
      .fontSize(11)
      .text(invoiceId, MARGIN_X, footerY + 46, {
        width: CONTENT_W,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor('#8A8A8A')
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

  if (!force && fs.existsSync(absPath)) {
    return {
      invoice_id: invoiceId,
      invoice_image: publicPath,
      absPath,
      order,
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
      paid_at: order.payment_completed_at,
    },
    publicPath,
  );

  fs.writeFileSync(absPath, pdf);

  return {
    invoice_id: invoiceId,
    invoice_image: publicPath,
    absPath,
    order,
    filename,
  };
};
