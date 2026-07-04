import { isTest } from "@/config/env.js";
import { logger } from "@/lib/logger.js";
import { CompanyModel, PlanModel, SubscriptionModel } from "@/models/index.js";
import { writeAudit } from "@/services/audit.service.js";
import { createNotification } from "@/services/notification.service.js";
import { sendDunningEmail } from "@/services/email.service.js";
import { UserModel } from "@/models/index.js";

/** Subscription lifecycle sweeper — the missing piece that makes
 * `cancelAtPeriodEnd` and `currentPeriodEnd` real:
 *  - free plans roll their period forward silently,
 *  - canceled paid plans downgrade to Free at period end,
 *  - expired paid plans get a grace window with a renewal notice, then downgrade.
 * Runs in-process (like the pincode sync scheduler); safe to call ad hoc. */

const MONTH_MS = 30 * 24 * 3600 * 1000;
const YEAR_MS = 365 * 24 * 3600 * 1000;
const GRACE_MS = 7 * 24 * 3600 * 1000; // paid grace window after period end

export interface SweepResult {
  scanned: number;
  rolled: number; // free periods rolled forward
  downgraded: number; // canceled or expired → Free
  renewal_notices: number; // grace-window notices sent
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function downgradeToFree(sub: any, reason: "canceled" | "expired"): Promise<void> {
  const free = await PlanModel.findOne({ code: "free", isActive: true }).lean();
  if (!free) {
    logger.error("subscription sweeper: free plan missing — cannot downgrade");
    return;
  }
  const now = new Date();
  const before = sub.planCode;
  sub.planId = free._id;
  sub.planCode = free.code;
  sub.interval = "monthly";
  sub.priceSnapshotPaise = 0;
  sub.currentPeriodStart = now;
  sub.currentPeriodEnd = new Date(now.getTime() + MONTH_MS);
  sub.cancelAtPeriodEnd = false;
  sub.couponId = null;
  sub.discountAppliedPaise = 0;
  sub.set("usage.includedCalls", free.includedCalls ?? 0);
  sub.set("usage.callsUsed", 0);
  sub.set("usage.periodKey", now.toISOString().slice(0, 7));
  sub.set("dunning.attempts", 0);
  sub.set("dunning.lastAttemptAt", null);
  await sub.save();

  await writeAudit({
    action: reason === "canceled" ? "billing.downgraded_on_cancel" : "billing.downgraded_on_expiry",
    category: "billing",
    severity: "notice",
    companyId: sub.companyId,
    resource: { kind: "subscription", id: String(sub._id) },
    changes: [{ field: "planCode", before, after: "free" }],
  });

  const company = await CompanyModel.findById(sub.companyId).select("ownerUserId name").lean();
  const recipient = sub.createdByUserId ?? company?.ownerUserId ?? null;
  if (recipient) {
    void createNotification({
      recipientId: recipient,
      companyId: sub.companyId,
      kind: "billing",
      type: "subscription.downgraded",
      severity: "warning",
      title: reason === "canceled" ? "Your plan has ended" : "Your plan expired",
      body:
        reason === "canceled"
          ? `Your ${before} plan reached its period end and your account is now on Free.`
          : `Your ${before} plan expired without renewal — your account is now on Free. Upgrade anytime to restore limits.`,
      actionUrl: "/app/billing/plans",
    });
  }
  try {
    const { emitWebhookEvent } = await import("@/services/webhook.service.js");
    void emitWebhookEvent(sub.companyId, "subscription.updated", {
      plan_code: "free",
      status: "active",
      interval: "monthly",
      current_period_end: sub.currentPeriodEnd.toISOString(),
      cancel_at_period_end: false,
      reason,
    });
  } catch {
    /* best-effort */
  }
}

/** One sweep over every active subscription past its period end. */
export async function sweepSubscriptions(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, rolled: 0, downgraded: 0, renewal_notices: 0 };
  const due = await SubscriptionModel.find({ status: "active", currentPeriodEnd: { $lt: now } });
  result.scanned = due.length;

  for (const sub of due) {
    try {
      if (sub.planCode === "free" || (sub.priceSnapshotPaise ?? 0) === 0) {
        // Free plans just roll forward — quota resets with the new periodKey.
        sub.currentPeriodStart = now;
        sub.currentPeriodEnd = new Date(now.getTime() + (sub.interval === "yearly" ? YEAR_MS : MONTH_MS));
        sub.set("usage.callsUsed", 0);
        sub.set("usage.periodKey", now.toISOString().slice(0, 7));
        await sub.save();
        result.rolled++;
        continue;
      }

      if (sub.cancelAtPeriodEnd) {
        await downgradeToFree(sub, "canceled");
        result.downgraded++;
        continue;
      }

      // Paid, not canceled, past due — grace window then downgrade.
      const overdueMs = now.getTime() - new Date(sub.currentPeriodEnd).getTime();
      if (overdueMs > GRACE_MS) {
        await downgradeToFree(sub, "expired");
        result.downgraded++;
        continue;
      }
      // Inside grace: one renewal notice per period (guarded by lastAttemptAt).
      const lastAttempt = sub.dunning?.lastAttemptAt ? new Date(sub.dunning.lastAttemptAt).getTime() : 0;
      if (lastAttempt < new Date(sub.currentPeriodEnd).getTime()) {
        sub.set("dunning.attempts", (sub.dunning?.attempts ?? 0) + 1);
        sub.set("dunning.lastAttemptAt", now);
        await sub.save();
        const recipient = sub.createdByUserId
          ? await UserModel.findById(sub.createdByUserId).select("email").lean()
          : null;
        if (recipient?.email) {
          await sendDunningEmail(recipient.email, {
            invoiceNumber: "renewal due",
            planName: sub.planCode,
            amount: `₹${Math.round((sub.priceSnapshotPaise ?? 0)) / 100}`,
          });
        }
        if (sub.createdByUserId) {
          void createNotification({
            recipientId: sub.createdByUserId,
            companyId: sub.companyId,
            kind: "billing",
            type: "subscription.renewal_due",
            severity: "warning",
            title: "Plan renewal due",
            body: `Your ${sub.planCode} plan period has ended — renew within 7 days to keep your limits.`,
            actionUrl: "/app/billing/plans",
          });
        }
        result.renewal_notices++;
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, sub: String(sub._id) }, "subscription sweep: item failed");
    }
  }
  if (result.scanned > 0) logger.info(result, "subscription sweep complete");
  return result;
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

/** Boot hook — mirrors startPincodeSyncScheduler. No-op under test. */
export function startSubscriptionSweeper(): void {
  if (isTest) return;
  const run = () =>
    void sweepSubscriptions().catch((err) =>
      logger.warn({ err: (err as Error).message }, "subscription sweep failed"),
    );
  // First pass shortly after boot, then hourly.
  setTimeout(run, 20_000).unref();
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}
