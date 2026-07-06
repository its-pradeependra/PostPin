import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate.js";
import * as notifications from "@/services/notification.service.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export async function notificationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Per-user resource: any authenticated user reads/manages their OWN notifications.
  const auth = [authenticate];

  app.get(
    "/",
    {
      preHandler: auth,
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
          unread_only: z.coerce.boolean().default(false),
        }),
      },
    },
    async (req) => notifications.listNotifications(req.query.limit, req.query.offset, req.query.unread_only),
  );

  app.get("/unread-count", { preHandler: auth }, async () => notifications.unreadCount());

  // Per-user channel preferences (in-app / email, per event kind).
  app.get("/preferences", { preHandler: auth }, async () => notifications.getNotificationPrefs());

  const kindPrefs = z.object({ in_app: z.boolean().optional(), email: z.boolean().optional() });
  app.patch(
    "/preferences",
    {
      preHandler: auth,
      schema: {
        body: z.object({
          email_enabled: z.boolean().optional(),
          kinds: z
            .object({
              usage: kindPrefs.optional(),
              billing: kindPrefs.optional(),
              key: kindPrefs.optional(),
              sync: kindPrefs.optional(),
              ticket: kindPrefs.optional(),
              system: kindPrefs.optional(),
            })
            .optional(),
        }),
      },
    },
    async (req) => notifications.updateNotificationPrefs(req.body),
  );

  app.post("/mark-all-read", { preHandler: auth }, async () => notifications.markAllRead());

  app.post(
    "/:id/read",
    { preHandler: auth, schema: { params: z.object({ id: objectId }) } },
    async (req) => notifications.markRead(req.params.id),
  );
}
