# Postpin — Research → Production Blueprint

> **This generic SaaS research has been superseded.** It has been rewritten around Postpin's actual
> architecture as a **Shipping Charges API Platform** (not a calculator). The full, build-from
> blueprint now lives in [`docs/blueprint/`](docs/blueprint/README.md) — 27 production-grade documents
> covering product, architecture, every module, the data model, the API, the frontend, and the
> production engineering plan.

## What Postpin is

A **Shipping Charges API Platform (SaaS)**, India-first. A REST API + multi-portal dashboard that
returns accurate shipping charges from **pickup pincode → delivery pincode**, factoring weight,
dimensions (volumetric), payment type (COD/Prepaid), shipping method, **per-customer rate cards**,
**zone mapping**, and business rules. Consumed by developers, eCommerce sites, ERPs and courier/OMS
systems. Stack: **Next.js (App Router) · Node.js · MongoDB · Redis · BullMQ · Cron · JWT**.

## The blueprint (read this)

Start at **[`docs/blueprint/README.md`](docs/blueprint/README.md)**. Key documents:

| Area | Documents |
|------|-----------|
| **Foundations** | [Overview & Vision](docs/blueprint/00-overview.md) · [System Architecture](docs/blueprint/01-architecture.md) · [Multi-tenancy, RBAC & Security](docs/blueprint/02-multi-tenant-security.md) |
| **Flagship modules** | [**Pincode Management — India Post auto-sync**](docs/blueprint/03-pincode-management.md) · [**Shipping Engine**](docs/blueprint/04-shipping-engine.md) · [Zones](docs/blueprint/05-zone-management.md) · [Rate Card Builder](docs/blueprint/06-rate-card-builder.md) |
| **Platform modules** | [API Management](docs/blueprint/07-api-management.md) · [API Analytics](docs/blueprint/08-api-analytics.md) · [Subscriptions](docs/blueprint/09-subscription-engine.md) · [Coupons](docs/blueprint/10-coupon-builder.md) · [Support CRM](docs/blueprint/11-support-crm.md) · [Audit Logs](docs/blueprint/12-audit-logs.md) · [Notification Center](docs/blueprint/13-notification-center.md) |
| **Data & API** | [MongoDB — Core Collections](docs/blueprint/14a-data-model-core.md) · [MongoDB — Domain Collections](docs/blueprint/14b-data-model-domain.md) · [REST API Reference (v1)](docs/blueprint/15-rest-api-reference.md) |
| **Frontend & UI** | [Next.js Architecture + Page Inventory](docs/blueprint/16-frontend-architecture.md) · [Design System](docs/blueprint/17-design-system.md) · UI Specs + AI prompts: [Marketing/Auth](docs/blueprint/18a-ui-specs-marketing-auth.md) · [Portal](docs/blueprint/18b-ui-specs-user-portal.md) · [Admin](docs/blueprint/18c-ui-specs-admin.md) |
| **Production** | [Scalability](docs/blueprint/19-scalability.md) · [Deployment & CI/CD](docs/blueprint/20-deployment-cicd.md) · [Observability](docs/blueprint/21-observability.md) · [Backup & DR](docs/blueprint/22-backup-dr.md) · [Roadmap](docs/blueprint/23-roadmap.md) |

## The implementation

The Next.js UI is being built in this repo against the blueprint. See
[`docs/UI_BUILD_CONTRACT.md`](docs/UI_BUILD_CONTRACT.md) for the design-system contract, and run
`npm install && npm run dev` to view it (marketing `/`, auth, user portal `/app/*`, admin `/admin/*`,
docs `/docs`).
