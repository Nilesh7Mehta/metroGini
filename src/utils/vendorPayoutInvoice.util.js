import fs from 'fs';
import path from 'path';

const INVOICE_DIR = path.join(process.cwd(), 'uploads', 'vendor-payout-invoices');

const escapePdfText = (text) =>
  String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

/** Minimal single-page PDF (no external deps). */
const buildSimplePdf = (lines = []) => {
  const contentLines = [
    'BT',
    '/F1 14 Tf',
    '50 750 Td',
    `(${escapePdfText(lines[0] || 'Vendor Payout Invoice')}) Tj`,
  ];

  for (let i = 1; i < lines.length; i += 1) {
    contentLines.push('0 -22 Td');
    contentLines.push(`/F1 11 Tf`);
    contentLines.push(`(${escapePdfText(lines[i])}) Tj`);
  }
  contentLines.push('ET');

  const stream = contentLines.join('\n');
  const objects = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream endobj`,
  );
  objects.push(
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  );

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return pdf;
};

export const ensureInvoiceDir = () => {
  if (!fs.existsSync(INVOICE_DIR)) {
    fs.mkdirSync(INVOICE_DIR, { recursive: true });
  }
};

/**
 * Create (or reuse) an auto invoice PDF for a payout batch.
 * Returns public path: /uploads/vendor-payout-invoices/<filename>
 */
export const ensureAutoInvoiceFile = (batch) => {
  ensureInvoiceDir();

  const filename = `auto-${batch.batch_id}.pdf`;
  const absPath = path.join(INVOICE_DIR, filename);
  const publicPath = `/uploads/vendor-payout-invoices/${filename}`;
  const invoiceId =
    batch.invoice_id || `INV-${String(batch.batch_id).toUpperCase()}`;

  if (!fs.existsSync(absPath)) {
    const pdf = buildSimplePdf([
      `Metro Gini — Vendor Payout Invoice`,
      `Invoice ID: ${invoiceId}`,
      `Batch ID: ${batch.batch_id}`,
      `Vendor: ${batch.vendor_name || '-'}`,
      `Zone: ${batch.zone_group || batch.pincode_group_name || '-'}`,
      `Period: ${batch.date_label || `${batch.week_start} - ${batch.week_end}`}`,
      `Orders: ${batch.total_orders ?? '-'}`,
      `Weight (kg): ${batch.total_kg ?? '-'}`,
      `Gross: ${batch.gross_revenue ?? '-'}`,
      `GST (18%): ${batch.gst_amount ?? '-'}`,
      `Payable: ${batch.payable_amount ?? '-'}`,
      `Generated: ${new Date().toISOString().slice(0, 10)}`,
    ]);
    fs.writeFileSync(absPath, pdf, 'utf8');
  }

  return { invoice_id: invoiceId, invoice_image: publicPath, absPath };
};

/** Ensure seed/dummy invoice files exist too. */
export const ensureInvoiceFileFromPath = (publicPath, lines = []) => {
  if (!publicPath) return null;
  ensureInvoiceDir();
  const filename = path.basename(publicPath);
  const absPath = path.join(INVOICE_DIR, filename);
  if (!fs.existsSync(absPath)) {
    const pdf = buildSimplePdf(lines.length ? lines : [`Invoice: ${filename}`]);
    fs.writeFileSync(absPath, pdf, 'utf8');
  }
  return absPath;
};
