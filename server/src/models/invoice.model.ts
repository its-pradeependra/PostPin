import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions, companyIdField } from "./_base.js";

/** invoices — one billing statement per checkout / renewal. Money in paise. */
const invoiceSchema = new Schema(
  {
    companyId: companyIdField,
    number: { type: String, required: true, unique: true }, // INV-YYYY-NNNNNN
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", default: null },
    planCode: { type: String, required: true },
    interval: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    amountPaise: { type: Number, required: true }, // base plan charge (pre-GST, post-discount)
    discountPaise: { type: Number, default: 0 },
    gstPaise: { type: Number, default: 0 },
    totalPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["draft", "open", "paid", "void", "past_due", "refunded"],
      default: "open",
    },
    couponCode: { type: String, default: null },
    lineItems: {
      type: [{ label: String, amountPaise: Number }],
      default: [],
    },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    issuedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  baseOptions,
);

invoiceSchema.index({ companyId: 1, createdAt: -1 });
invoiceSchema.index({ companyId: 1, status: 1 });
invoiceSchema.index({ razorpayOrderId: 1 });

export type Invoice = InferSchemaType<typeof invoiceSchema>;
export const InvoiceModel = model("Invoice", invoiceSchema);
