import { logger } from "@/lib/logger.js";
import { SettingsModel } from "@/models/index.js";
import { sendMail } from "@/services/email.service.js";
import { writeAudit } from "@/services/audit.service.js";
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";

/** Platform alert delivery — email + Slack channels for critical operational
 * events (sync failures, dunning, security). Config lives in the platform
 * settings collection so it's editable from the admin Notifications page. */

const SEVERITY_ORDER = { info: 0, notice: 1, warning: 2, critical: 3 } as const;
export type AlertSeverity = keyof typeof SEVERITY_ORDER;
const SEVERITIES = Object.keys(SEVERITY_ORDER) as AlertSeverity[];

export interface ChannelConfig {
  enabled: boolean;
  minSeverity: AlertSeverity;
}
export interface NotificationConfig {
  email: ChannelConfig & { recipients: string[] };
  slack: ChannelConfig & { webhookUrl: string };
  events: Record<string, boolean>;
}

const DEFAULT_CONFIG: NotificationConfig = {
  email: { enabled: false, recipients: [], minSeverity: "critical" },
  slack: { enabled: false, webhookUrl: "", minSeverity: "warning" },
  events: {
    "pincode.sync.failed": true,
    "billing.payment.failed": true,
    "security.alert": true,
  },
};

const SETTINGS_KEY = "notifications.channels";

export async function getNotificationConfig(): Promise<NotificationConfig> {
  const s = await SettingsModel.findOne({ scope: "platform", key: SETTINGS_KEY }).lean();
  const v = (s?.value ?? {}) as Partial<NotificationConfig>;
  return {
    email: { ...DEFAULT_CONFIG.email, ...(v.email ?? {}) },
    slack: { ...DEFAULT_CONFIG.slack, ...(v.slack ?? {}) },
    events: { ...DEFAULT_CONFIG.events, ...(v.events ?? {}) },
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NotificationConfigPatch {
  email?: Partial<ChannelConfig> & { recipients?: string[] };
  slack?: Partial<ChannelConfig> & { webhookUrl?: string };
  events?: Record<string, boolean>;
}

export async function updateNotificationConfig(patch: NotificationConfigPatch): Promise<NotificationConfig> {
  const ctx = getContext();
  const current = await getNotificationConfig();

  const next: NotificationConfig = {
    email: { ...current.email, ...(patch.email ?? {}) },
    slack: { ...current.slack, ...(patch.slack ?? {}) },
    events: { ...current.events, ...(patch.events ?? {}) },
  };

  // Validation
  next.email.recipients = (next.email.recipients ?? []).map((r) => r.trim()).filter(Boolean);
  const badEmail = next.email.recipients.find((r) => !EMAIL_RE.test(r));
  if (badEmail) throw AppError.badRequest(`"${badEmail}" is not a valid email`, "invalid_recipient");
  if (!SEVERITIES.includes(next.email.minSeverity)) throw AppError.badRequest("Invalid email severity", "invalid_severity");
  if (!SEVERITIES.includes(next.slack.minSeverity)) throw AppError.badRequest("Invalid Slack severity", "invalid_severity");
  if (next.slack.webhookUrl && !/^https?:\/\//.test(next.slack.webhookUrl)) {
    throw AppError.badRequest("Slack webhook must be an http(s) URL", "invalid_webhook");
  }
  if (next.email.enabled && next.email.recipients.length === 0) {
    throw AppError.badRequest("Add at least one recipient to enable email alerts", "no_recipients");
  }
  if (next.slack.enabled && !next.slack.webhookUrl) {
    throw AppError.badRequest("Add a webhook URL to enable Slack alerts", "no_webhook");
  }

  await SettingsModel.findOneAndUpdate(
    { scope: "platform", key: SETTINGS_KEY },
    { $set: { value: next, editableBy: "super_admin" }, $setOnInsert: { scope: "platform", companyId: null, key: SETTINGS_KEY } },
    { upsert: true, new: true },
  );
  await writeAudit({
    action: "notifications.config_updated",
    category: "config",
    severity: "notice",
    actorId: ctx.userId,
    resource: { kind: "settings", name: SETTINGS_KEY },
  });
  return next;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface AlertInput {
  severity: AlertSeverity;
  event?: string;
  title: string;
  body: string;
}

export interface AlertResult {
  email: boolean;
  slack: boolean;
  skipped: string[];
}

/** Deliver an alert to every enabled channel that meets its min-severity gate.
 * Never throws — channel failures are captured in `skipped`. */
export async function dispatchPlatformAlert(input: AlertInput): Promise<AlertResult> {
  const cfg = await getNotificationConfig();
  const level = SEVERITY_ORDER[input.severity] ?? 0;
  const result: AlertResult = { email: false, slack: false, skipped: [] };

  if (input.event && cfg.events[input.event] === false) {
    result.skipped.push("event_muted");
    return result;
  }

  if (cfg.email.enabled && cfg.email.recipients.length > 0) {
    if (level >= SEVERITY_ORDER[cfg.email.minSeverity]) {
      try {
        await Promise.all(
          cfg.email.recipients.map((to) =>
            sendMail({
              to,
              subject: `[Postpin · ${input.severity.toUpperCase()}] ${input.title}`,
              html: `<p><strong>${escapeHtml(input.title)}</strong></p><p>${escapeHtml(input.body)}</p>`,
              text: `${input.title}\n\n${input.body}`,
            }),
          ),
        );
        result.email = true;
      } catch (e) {
        logger.warn({ err: (e as Error).message }, "platform alert: email delivery failed");
        result.skipped.push("email_error");
      }
    } else {
      result.skipped.push("email_below_severity");
    }
  }

  if (cfg.slack.enabled && cfg.slack.webhookUrl) {
    if (level >= SEVERITY_ORDER[cfg.slack.minSeverity]) {
      try {
        const res = await fetch(cfg.slack.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: `*[${input.severity.toUpperCase()}] ${input.title}*\n${input.body}` }),
          signal: AbortSignal.timeout(8000),
        });
        result.slack = res.ok;
        if (!res.ok) result.skipped.push(`slack_http_${res.status}`);
      } catch (e) {
        logger.warn({ err: (e as Error).message }, "platform alert: slack delivery failed");
        result.skipped.push("slack_error");
      }
    } else {
      result.skipped.push("slack_below_severity");
    }
  }

  return result;
}

/** Fire a test alert through the current config (used by the admin test button). */
export async function sendTestAlert(): Promise<AlertResult> {
  return dispatchPlatformAlert({
    severity: "critical",
    event: undefined,
    title: "Test alert",
    body: "This is a test platform alert triggered from the admin Notifications page. If you received it, your channel is wired correctly.",
  });
}
