import PDFDocument from "pdfkit";

const rupees = (paise: number) => `₹${(Math.round(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

interface InvoiceLike {
  number: string;
  planCode: string;
  interval: string;
  amountPaise: number;
  discountPaise?: number;
  gstPaise: number;
  totalPaise: number;
  status: string;
  couponCode?: string | null;
  issuedAt?: Date | string;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  lineItems?: Array<{ label: string; amountPaise: number }>;
}

/** Render a GST-style tax invoice to a PDF buffer using pdfkit (no network, no fonts to bundle). */
export function renderInvoicePdf(invoice: InvoiceLike, companyName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fillColor("#a21caf").fontSize(22).text("Postpin", 50, 50);
    doc.fillColor("#111").fontSize(16).text("Tax Invoice", { align: "right" });
    doc.fillColor("#666").fontSize(10).text(`Invoice ${invoice.number}`, { align: "right" });
    doc.text(`Issued ${fmtDate(invoice.issuedAt)}`, { align: "right" });
    doc.text(`Status: ${invoice.status.toUpperCase()}`, { align: "right" });

    doc.moveTo(50, 130).lineTo(545, 130).strokeColor("#e4e4e7").stroke();

    // Bill-to
    doc.fillColor("#666").fontSize(10).text("Billed to", 50, 145);
    doc.fillColor("#111").fontSize(12).text(companyName, 50, 160);
    if (invoice.periodStart && invoice.periodEnd) {
      doc.fillColor("#666").fontSize(10).text(`Period: ${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`, 50, 180);
    }

    // Line items table
    let y = 220;
    doc.fillColor("#666").fontSize(10).text("Description", 50, y).text("Amount", 400, y, { width: 145, align: "right" });
    doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor("#e4e4e7").stroke();
    y += 26;

    const items = invoice.lineItems?.length
      ? invoice.lineItems
      : [
          { label: `${invoice.planCode} plan (${invoice.interval})`, amountPaise: invoice.amountPaise },
          { label: "GST (18%)", amountPaise: invoice.gstPaise },
        ];
    doc.fillColor("#111").fontSize(11);
    for (const li of items) {
      doc.text(li.label, 50, y, { width: 340 }).text(rupees(li.amountPaise), 400, y, { width: 145, align: "right" });
      y += 22;
    }

    doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor("#e4e4e7").stroke();
    y += 14;
    doc.fillColor("#111").fontSize(13).text("Total (incl. GST)", 50, y, { width: 340 }).text(rupees(invoice.totalPaise), 400, y, { width: 145, align: "right" });

    // Footer
    doc.fillColor("#999").fontSize(9).text("This is a computer-generated invoice and does not require a signature.", 50, 760, { align: "center", width: 495 });

    doc.end();
  });
}
