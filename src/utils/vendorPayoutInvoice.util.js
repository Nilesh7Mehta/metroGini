import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

const INVOICE_DIR = path.join(process.cwd(), 'uploads', 'vendor-payout-invoices');
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
  link: '#276EF1',
  footerBg: '#F6F6F6',
  cardBorder: '#E6E6E6',
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

const formatPayDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
};

export const ensureInvoiceDir = () => {
  if (!fs.existsSync(INVOICE_DIR)) {
    fs.mkdirSync(INVOICE_DIR, { recursive: true });
  }
};

const registerFonts = (doc) => {
  const fonts = resolveFonts();
  if (fonts) {
    doc.registerFont('Body', fonts.regular);
    doc.registerFont('BodyBold', fonts.bold);
    return { regular: 'Body', bold: 'BodyBold' };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
};

const hairline = (doc, y, x1 = MARGIN_X, x2 = PAGE_W - MARGIN_X) => {
  doc
    .strokeColor(COLORS.line)
    .lineWidth(1)
    .moveTo(x1, y)
    .lineTo(x2, y)
    .stroke();
};

const row = (doc, fonts, label, value, y, opts = {}) => {
  const size = opts.size || 13;
  doc
    .fillColor(COLORS.ink)
    .font(opts.boldLabel ? fonts.bold : fonts.regular)
    .fontSize(size)
    .text(label, MARGIN_X, y, { width: CONTENT_W * 0.62, lineBreak: false });
  doc
    .fillColor(COLORS.ink)
    .font(opts.boldValue ? fonts.bold : fonts.regular)
    .fontSize(size)
    .text(value, MARGIN_X, y, {
      width: CONTENT_W,
      align: 'right',
      lineBreak: false,
    });
};

/** Uber-matching payout receipt UI. */
const buildPayoutReceiptPdf = (batch, invoiceId, publicPath) =>
  new Promise((resolve, reject) => {
    const vendor = String(batch.vendor_name || 'Vendor');
    const zone = String(batch.zone_group || batch.pincode_group_name || '-');
    const period = String(
      batch.date_label ||
        `${batch.week_start || '-'} - ${batch.week_end || '-'}`,
    );
    const issued = formatIssuedDate();
    const total = formatMoney(batch.payable_amount);
    const gross = formatMoney(batch.gross_revenue);
    const gst = formatMoney(batch.gst_amount);
    const orders = String(batch.total_orders ?? '-');
    const weight = `${batch.total_kg ?? '-'} kg`;
    const batchId = String(batch.batch_id || '-');
    const isPaid = String(batch.payment_status || '') === 'paid';
    const payWhen =
      formatPayDate(batch.payment_date || batch.paid_at) || issued;

    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `MetroGini Payout Receipt - ${invoiceId}`,
        Author: 'MetroGini',
      },
    });

    const fonts = registerFonts(doc);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ========== 1. Light gray header (Uber-style) ==========
    const accentSize = 78;
    const accentX = PAGE_W - MARGIN_X - accentSize;
    const textMaxW = CONTENT_W - (fs.existsSync(LOGO_PATH) ? accentSize + 20 : 0);

    doc.font(fonts.bold).fontSize(24);
    const greeting = `Thanks for partnering, ${vendor}`;
    const greetingH = doc.heightOfString(greeting, {
      width: textMaxW,
      lineGap: 2,
    });
    doc.font(fonts.regular).fontSize(13);
    const subtitle = 'Here is your vendor payout receipt for this period.';
    const subtitleH = doc.heightOfString(subtitle, { width: textMaxW });

    const greetingY = 78;
    const subtitleY = greetingY + greetingH + 10;
    const headerH = Math.max(168, subtitleY + subtitleH + 22);

    doc.rect(0, 0, PAGE_W, headerH).fill(COLORS.headerBg);

    // Brand text (left) + date (right) — no left logo image
    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(18)
      .text('MetroGini', MARGIN_X, 30);

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(11)
      .text(issued, MARGIN_X, 34, {
        width: CONTENT_W,
        align: 'right',
      });

    // Right-side logo (Uber car-style accent)
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
      .text(greeting, MARGIN_X, greetingY, {
        width: textMaxW,
        lineGap: 2,
      });

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(13)
      .text(subtitle, MARGIN_X, subtitleY, {
        width: textMaxW,
      });

    let y = headerH + 28;

    // ========== 2. Total ==========
    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(18)
      .text('Total', MARGIN_X, y + 4);

    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(28)
      .text(total, MARGIN_X, y, {
        width: CONTENT_W,
        align: 'right',
      });

    y += 42;
    hairline(doc, y);
    y += 20;

    // ========== 3. Fare-style breakdown ==========
    row(doc, fonts, 'Gross revenue', gross, y);
    y += 26;
    row(doc, fonts, 'GST (18%)', gst, y);
    y += 26;
    row(doc, fonts, 'Payable amount', total, y);
    y += 28;
    hairline(doc, y);
    y += 26;

    // ========== 4. Payments ==========
    doc
      .fillColor(COLORS.ink)
      .font(fonts.bold)
      .fontSize(18)
      .text('Payments', MARGIN_X, y);
    y += 28;

    // Green cash / payment icon (rounded square)
    const iconX = MARGIN_X;
    const iconY = y;
    doc.roundedRect(iconX, iconY, 28, 28, 6).fill(COLORS.green);
    // Simple cash mark
    doc
      .fillColor(COLORS.white)
      .font(fonts.bold)
      .fontSize(13)
      .text('₹', iconX, iconY + 6, { width: 28, align: 'center' });

    const payTitle = isPaid ? 'Paid' : 'Pending';
    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(14)
      .text(payTitle, MARGIN_X + 40, y + 1);

    doc
      .fillColor(COLORS.muted)
      .font(fonts.regular)
      .fontSize(12)
      .text(payWhen, MARGIN_X + 40, y + 18);

    doc
      .fillColor(COLORS.ink)
      .font(fonts.regular)
      .fontSize(14)
      .text(total, MARGIN_X, y + 6, {
        width: CONTENT_W,
        align: 'right',
      });

    y += 52;
    hairline(doc, y);
    y += 22;

    // ========== 5. Download PDF (clickable link) ==========
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
    // Make the button open/download the invoice PDF
    doc.link(btnX, y, btnW, btnH, downloadUrl);

    y += 56;
    hairline(doc, y);
    y += 18;

    // ========== 6. Legal fine print (kept above footer) ==========
    const FOOTER_H = 100;
    const footerY = PAGE_H - FOOTER_H;
    const legalMaxH = Math.max(40, footerY - y - 24);

    doc
      .fillColor(COLORS.soft)
      .font(fonts.regular)
      .fontSize(9.5)
      .text(
        `This receipt reflects the payout summary (including GST estimate) and is not a tax invoice, but it can be used for official reimbursement purposes. Issued for ${vendor} · ${zone} · ${period} · Invoice ${invoiceId} · Batch ${batchId} · Orders ${orders} · Weight ${weight}. MetroGini does not replace your formal GST invoices where applicable.`,
        MARGIN_X,
        y,
        {
          width: CONTENT_W,
          align: 'left',
          lineGap: 2,
          height: legalMaxH,
          ellipsis: true,
        },
      );

    // ========== 7. Sticky footer on page 1 (always) ==========
    // Prevent PDFKit page-break from moving footer off page 1
    if (typeof doc.bufferedPageRange === 'function') {
      const range = doc.bufferedPageRange();
      if (range && range.count > 0) {
        doc.switchToPage(range.start);
      }
    }

    doc.save();
    doc.rect(0, footerY, PAGE_W, FOOTER_H).fill('#000000');

    // Left: brand + tagline (lineBreak:false avoids accidental new pages)
    doc
      .fillColor(COLORS.white)
      .font(fonts.bold)
      .fontSize(22)
      .text('MetroGini', MARGIN_X, footerY + 26, {
        lineBreak: false,
      });

    doc
      .fillColor('#A0A0A0')
      .font(fonts.regular)
      .fontSize(12)
      .text('Laundry · Vendor Settlements', MARGIN_X, footerY + 56, {
        lineBreak: false,
      });

    // Right: receipt meta
    doc
      .fillColor('#BDBDBD')
      .font(fonts.regular)
      .fontSize(12)
      .text('Vendor payout receipt', MARGIN_X, footerY + 24, {
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
      .text(issued, MARGIN_X, footerY + 66, {
        width: CONTENT_W,
        align: 'right',
        lineBreak: false,
      });
    doc.restore();

    doc.end();
  });

const buildSimplePdf = (lines = []) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const fonts = registerFonts(doc);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font(fonts.bold).fontSize(16).text(lines[0] || 'Invoice');
    doc.moveDown();
    doc.font(fonts.regular).fontSize(13);
    for (let i = 1; i < lines.length; i += 1) doc.text(lines[i]);
    doc.end();
  });

export const ensureAutoInvoiceFile = async (batch, { force = false } = {}) => {
  ensureInvoiceDir();

  const filename = `auto-${batch.batch_id}.pdf`;
  const absPath = path.join(INVOICE_DIR, filename);
  const publicPath = `/uploads/vendor-payout-invoices/${filename}`;
  const invoiceId =
    batch.invoice_id || `INV-${String(batch.batch_id).toUpperCase()}`;

  if (!force && fs.existsSync(absPath)) {
    return { invoice_id: invoiceId, invoice_image: publicPath, absPath };
  }

  const pdf = await buildPayoutReceiptPdf(batch, invoiceId, publicPath);
  fs.writeFileSync(absPath, pdf);

  return { invoice_id: invoiceId, invoice_image: publicPath, absPath };
};

export const ensureInvoiceFileFromPath = async (publicPath, lines = []) => {
  if (!publicPath) return null;
  ensureInvoiceDir();
  const filename = path.basename(publicPath);
  const absPath = path.join(INVOICE_DIR, filename);
  if (!fs.existsSync(absPath)) {
    const pdf = await buildSimplePdf(
      lines.length ? lines : [`Invoice: ${filename}`],
    );
    fs.writeFileSync(absPath, pdf);
  }
  return absPath;
};
