import { getContext } from "@/context/request-context.js";
import { logger } from "@/lib/logger.js";
import { UserModel } from "@/models/index.js";
import { sendMail } from "@/services/email.service.js";
import { writeAudit } from "@/services/audit.service.js";
import { AppError } from "@/lib/errors.js";

/** Platform product-update broadcasts to users who explicitly opted in
 * (marketingConsent === true). Honors the consent we now record at signup /
 * in Settings — non-consenting users are never contacted. */

const CONSENTED = { marketingConsent: true, status: "active", deletedAt: null } as const;

export async function broadcastAudience(): Promise<{ recipients: number }> {
  const recipients = await UserModel.countDocuments(CONSENTED);
  return { recipients };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const BATCH = 40;

export async function sendBroadcast(input: { subject: string; body: string }): Promise<{ sent: number; failed: number }> {
  const ctx = getContext();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 3) throw AppError.badRequest("Subject is too short", "invalid_subject");
  if (body.length < 10) throw AppError.badRequest("Message is too short", "invalid_body");

  const users = await UserModel.find(CONSENTED).select("email name").lean();
  if (users.length === 0) throw AppError.badRequest("No users have opted in to product updates yet", "no_audience");

  const footer =
    "\n\n—\nYou're receiving this because you opted in to Postpin product updates. " +
    "Manage your preferences in Settings → Communication.";
  const htmlBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const htmlFooter =
    '<hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>' +
    '<p style="font-size:12px;color:#888">You\'re receiving this because you opted in to Postpin product updates. ' +
    "Manage your preferences in Settings → Communication.</p>";

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < users.length; i += BATCH) {
    const chunk = users.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      chunk.map((u) =>
        sendMail({
          to: u.email,
          subject,
          text: `${body}${footer}`,
          html: `<p>${htmlBody}</p>${htmlFooter}`,
        }),
      ),
    );
    for (const r of results) r.status === "fulfilled" ? sent++ : failed++;
  }

  await writeAudit({
    action: "broadcast.sent",
    category: "config",
    severity: "notice",
    actorId: ctx.userId,
    resource: { kind: "broadcast", name: subject },
    metadata: { audience: users.length, sent, failed },
  });
  logger.info({ audience: users.length, sent, failed }, "product-update broadcast dispatched");
  return { sent, failed };
}
