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

  app.post("/mark-all-read", { preHandler: auth }, async () => notifications.markAllRead());

  app.post(
    "/:id/read",
    { preHandler: auth, schema: { params: z.object({ id: objectId }) } },
    async (req) => notifications.markRead(req.params.id),
  );
}
