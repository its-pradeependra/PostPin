# Postpin — Multi-Tenant Architecture

How Postpin keeps every tenant's data, billing, and access strictly isolated while sharing one
database and one API. This is the canonical reference; it reflects the **implemented** code in
`server/`, not just intent.

---

## 1. Tenant model

- A **tenant = a `Company`** (`server/src/models/company.model.ts`). It is the billing boundary
  and the data boundary. A company has one owner, many users, one active subscription, and owns
  all its keys/usage/rate-cards/tickets/webhooks.
- A **`User`** belongs to exactly one company (`companyId`), except **platform staff** whose
  `companyId` is `null` and who carry `isPlatformStaff: true`.
- The partition key is **`companyId`** (an `ObjectId`). It is **never** supplied by the client —
  it is resolved once, server-side, from the verified credential (JWT or API key).

Isolation strategy: **row-level (shared database, shared collections)**. Enterprise tenants can
later be escalated to a dedicated database (§8) without any front-end change.

---

## 2. The four enforcement layers (defense in depth)

Each layer is independently sufficient to stop a cross-tenant read; together they make a leak
require all four to fail.

| Layer | Where | What it guarantees |
|---|---|---|
| **1. Context** | `server/src/context/request-context.ts`, `server/src/middleware/authenticate.ts` (M1) | `companyId` is resolved ONCE from the verified token into an immutable `RequestContext` held in `AsyncLocalStorage`. Body/query `companyId` is ignored. |
| **2. Repository** | `server/src/tenancy/scoped-repo.ts` | Every query is auto-constrained to `ctx.companyId`. `create()` forces it (a client-sent `companyId` is stripped + tamper-audited). `update()` cannot change it. `findById` of a foreign id returns `null` (**404-before-403**). |
| **3. Index** | `server/src/models/index.ts` → `assertScoped()` | Every strictly-scoped collection MUST have a compound index whose **first key is `companyId`**. Enforced in code at boot and in CI — boot throws if any scoped model lost it. |
| **4. Schema** | `server/src/models/_base.ts` (`companyIdField`) | `companyId` is `required` + `immutable` on every scoped model — it can be set once and never reassigned. |

**Cross-tenant access** is allowed only through `server/src/tenancy/admin-repo.ts`, which requires
the explicit `tenant.read` permission and writes an `auditLogs` entry on every call. Platform
admins use it for the tenant directory, impersonation, and cross-tenant reports — nothing else
omits the `companyId` scope.

### Strictly-scoped collections (companyId required + immutable, in `SCOPED_MODELS`)
`subscriptions, apiKeys, apiLogs, rateCards, shippingRules, tickets, ticketReplies, webhooks,
webhookDeliveries`. (`notifications` and `auditLogs` carry `companyId` but allow `null` for
platform-wide records, so they are scoped-by-index but not in the strict set.)

---

## 3. RBAC (permission-based)

Source of truth: `server/src/shared/permissions.ts` (catalog) and `roles.ts` (bundles).

- Permissions are `resource:action` keys (dotted sub-actions allowed, e.g. `apikey:revoke.any`,
  `tenant.read`). **Checks are always against a permission key, never a role name**, so roles can
  be edited without code changes.
- **Platform roles** (companyId `null`): `super_admin` (all platform perms), `support_admin`,
  `billing_admin`, `read_only`.
- **Tenant roles** (cloned per company on signup): `owner` (all tenant perms), `developer`,
  `member` (default for invitees: `usage:read, ratecard:read, invoice:read, ticket:create`).
- Dangerous permissions are flagged `isDangerous` (e.g. `tenant:suspend`, `pincode:rollback`,
  `apikey:revoke.any`, `company:delete`) and gate step-up-sensitive routes.

Enforcement order on a protected route (M1): `rate-limit → authenticate (build context) →
tenant (assert companyId, reject body companyId) → requirePermission(key) → handler`. Function-
level permission is checked at the preHandler; object-level tenancy is enforced at data-access
time by the scoped repo.

---

## 4. Auth & session (custom, no OAuth)

- **Passwords:** Argon2id (`server/src/lib/crypto.ts`). **API keys:** HMAC-SHA256 + pepper, stored
  as hash + prefix + last4 (`pp_live_`/`pp_test_`). **Refresh tokens:** SHA-256 (high entropy).
- **Access token:** EdDSA (Ed25519) JWT (`server/src/lib/jwt.ts`), ~15 min, claims
  `{ sub, companyId, role, permVersion, isPlatformStaff, sid, amr }`. Public key at
  `/.well-known/jwks.json`.
- **Refresh:** rotating, 30 days, stored hashed in the Mongo `sessions` collection. Reuse of a
  rotated token revokes the entire `family` (theft defense).
- **`permVersion`:** bumping a user's `permVersion` invalidates outstanding access tokens
  (`token_stale` → forced refresh) so permission/role changes propagate without waiting for expiry.
- **Cross-origin cookies:** web (`:3000`/`app.postpin.dev`) ↔ api (`:4000`/`api.postpin.dev`).
  Refresh + CSRF cookies are issued by the API; prod uses a shared registrable domain
  (`Domain=.postpin.dev`, `SameSite=Strict`); dev uses `localhost` ports (`SameSite=Lax`,
  `Secure=false`). Access token is NOT a cookie — it is held in JS memory and sent as a Bearer.
  CORS allows the exact `WEB_ORIGIN` with credentials (never `*`). CSRF = double-submit on cookie-
  bearing endpoints. Admin accounts require **TOTP** 2FA.

---

## 5. Request lifecycle

```mermaid
flowchart LR
  C[Browser / dashboard] -->|Bearer access JWT + credentials| MW[Next middleware.ts<br/>(edge: jose verify, gate /app /admin)]
  MW --> API[Fastify /v1/*]
  API --> AUTH[authenticate<br/>verify JWT, resolve permissions]
  AUTH --> CTX[RequestContext<br/>companyId frozen]
  CTX --> PERM[requirePermission key]
  PERM --> H[handler]
  H --> REPO[scopedRepo model<br/>auto-inject companyId]
  REPO --> DB[(MongoDB: postpin db<br/>companyId-leading indexes)]
  H --> RES[response + meta.request_id]
```

The public rate API (`/v1/rates/*`) takes the same path but `authenticate` resolves the context
from the **API key** record instead of a JWT; `companyId` comes from the key.

---

## 6. Data partitioning & money

- One `postpin` MongoDB database; all tenant rows carry `companyId`. Queries are tenant-scoped via
  the repo; the `companyId`-leading indexes keep them fast.
- **Money is integer paise** everywhere (`*Paise`); weights are integer grams; percentages are
  basis points. Rupees appear only at the DTO boundary.

---

## 7. Database reality (important)

The MongoDB is **standalone** (reached via an SSH tunnel to a remote host), so **multi-document
transactions are unavailable**. Signup onboarding therefore writes sequentially and performs
**compensating cleanup** on failure instead of a transaction. The shared server also hosts an
unrelated production database — Postpin only ever uses its **dedicated `postpin` database**.

---

## 8. Enterprise isolation escalation (future)

A tenant can graduate from shared row-level isolation to a **dedicated database**
(`postpin_tenant_<id>`) or cluster. Routing chooses the connection by `tenantId`; the scoped repo
and all application code are unchanged because they already go through `companyId` + the repo
abstraction. Only the connection resolver changes. No front-end change beyond a possible per-tenant
API host.

---

## 9. Testing isolation

Automated proof lives in `server/src/tenancy/tenancy.test.ts` (vitest + in-memory Mongo):

- `assertScoped()` passes — every scoped model has a `companyId`-leading index.
- `create()` **injection-wins**: a client-supplied `companyId` is overridden by the context's, and
  a `tenant.body_injection` audit row is written.
- `findById` of another tenant's `_id` returns `null` (404-before-403).
- `find()` / `aggregate()` return only the caller's rows.
- A `null` companyId throws `scoped_repo_requires_tenant` (platform actors must use the admin repo).

M1 adds an end-to-end isolation gate: log in as tenant A, attempt to read tenant B's seeded data
via the API → 404; body-injected `companyId` → overridden + audited; verified with Playwright.
