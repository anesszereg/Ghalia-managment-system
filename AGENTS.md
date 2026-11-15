# Showroom Management System

Bathroom furniture showroom management — Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Prisma + SQLite.

## Run

```bash
npm install
npx prisma db push
npx tsx prisma/seed.ts   # seeds admin user + demo data
npm run dev            # or: npm run build && npm start
```

Login: `admin@showroom.com` / `admin123`

## Architecture

- `prisma/schema.prisma` — full data model (products, sales, purchases, payments, expenses, stock movements, audit log, users, settings).
- `src/lib/db.ts` — Prisma singleton.
- `src/lib/auth.ts` — HMAC-signed cookie session.
- `src/lib/utils.ts` — currency/date formatting, settings, unique ref generator, date-range helper.
- `src/lib/actions.ts` — ALL mutations as server actions, each wrapped in `prisma.$transaction` (stock movements, payments, audit log included).
- `src/app/(app)/` — authenticated app (sidebar + header with notifications).
- `src/app/print/` — standalone print views (A4 invoice, 80mm thermal, payment receipt, financial report). Print via browser dialog → Save as PDF.
- `src/app/api/export` — CSV exports; `src/app/api/backup` — full JSON backup.

## Business rules enforced

- Confirming a sale decrements stock (transaction, fails if insufficient); confirming a purchase increments stock and updates latest purchase cost.
- Payments increment `paid` on the parent transaction (capped at remaining balance); every payment gets its own printable receipt.
- Cancelling a sale/purchase restores stock and voids its payments.
- Profit = sales − COGS (item cost snapshot at sale time) − expenses. Unpaid balances never count as revenue received.
- All references are unique: `PREFIX-YEAR-NNNNN` (prefixes configurable in Settings).

## Notes

- Raw SQL date comparisons use `julianday()` — Prisma stores DateTime in SQLite as ISO strings; `datetime('now')` has a different separator and must not be used.
- DB file: `prisma/dev.db` (DATABASE_URL=file:./dev.db).
- Caisse is cash-only: initialize/import historical active payments and expenses from `/caisse` (admin), with a provisional 0 baseline, then open a daily session. New cash movements use posting time; imported entries retain historical dates. Closed sessions are corrected in a new session using reversals, never by rewriting movements.
- Cash movements store signed integer cents. Closing differences adjust the cash balance but do not count as profit/expense. Cancelling paid transactions, voiding payments, or deleting expenses requires confirmation that cash was returned or the original entry was incorrect.
- Verification: `npm run test:caisse` uses a temporary SQLite database and removes it afterward; `npx tsc --noEmit`; `npm run build`. The suite also verifies that simplified forms preserve omitted settings, product metadata, contact details, and expense dates/notes.
- New sales use vente comptoir: no customer picker or customer creation, `customerId` is null and the sale is labeled `Vente comptoir`. Preserve existing customer-linked sales; purchases still support suppliers.
- Customer UI is removed: no Customers navigation; `/customers` and `/customers/[id]` redirect to `/sales`. Keep existing customer records, relations, historical sales, and backups intact.
- Large-order entry uses a searchable, category-filtered catalog with 12 initial results, keyboard Enter quick-add, merged duplicate products, compact editable rows, sale stock limits, and a full-payment shortcut. Numeric form fields retain editable string state and submit numbers through the existing server-action JSON payload.
- UI preference: essential fields only, no optional/advanced panels; blue actions with green/violet/amber financial highlights. Keep required cash-count explanations and refund confirmations. `suppliedFields` in server actions preserves existing values for fields omitted from simplified forms.
- After Prisma schema changes, run `npx prisma generate` and fully restart the development server: hot reload retains the old global Prisma singleton. Do not run `npm run build` while `npm run dev` is running; both write `.next` and can cause missing chunks/client-manifest errors.

## Free hosting

- Target: Netlify Free plus Neon Free PostgreSQL. Free quotas can suspend service; neither provides unlimited production availability. Local SQLite data remains local; do not upload `.env`, database files, `node_modules`, or `.next`.
- Vercel uses `vercel.json` and `npm run build:hosted`; Netlify retains `netlify.toml` and the `npm run build:netlify` alias. Only production-context builds may migrate/initialize the database. Vercel preview/development and Netlify preview builds are blocked for shared-database safety. Verify the build configuration and preflight guards with `npx tsx prisma/deploy.test.ts`; it never connects to a database. Configure the hosting provider's Production environment variables separately from local `.env`.
- Set these private Netlify environment variables before deploying: `DATABASE_URL` (Neon pooled connection, SSL required), `DIRECT_URL` (Neon direct/unpooled connection), `AUTH_SECRET` (random, at least 32 characters), `ADMIN_EMAIL`, and `ADMIN_PASSWORD` (at least 16 characters, at most 72 UTF-8 bytes). DATABASE_URL and AUTH_SECRET must be available to builds and functions; DIRECT_URL and initial admin credentials are build-time variables. Set `TZ` to the business timezone for daily sessions.
- `prisma/prepare-postgres.ts` generates the hosted schema from the SQLite source models. Commit PostgreSQL migrations under `prisma/postgres/migrations`, not the generated schema. Hosting runs `migrate deploy`, never resets or demo-seeds data, and bootstraps only the first admin/settings/zero-baseline cashbook. Subsequent builds never replace admin credentials.
- Demo seeding is blocked for PostgreSQL/production. Production sessions require a strong signing secret and use Secure/HttpOnly/SameSite cookies with server-validated expiry. Admin-only mutations require an administrator; inventory/contact mutations require authentication. Interactive database transactions use Serializable isolation.
- `npm run test:postgres` requires local PostgreSQL CLI tools. It creates and removes an isolated loopback cluster, runs accounting and fresh-bootstrap tests, executes the Netlify build workflow, then smoke-tests production pages, exports, backup, login, cookies, and access control. It restores the SQLite client afterward. Do not run it alongside a dev server/build. Development, installation, and normal builds use `prisma/prepare-client.ts` to select SQLite for a `file:` DATABASE_URL or PostgreSQL for a `postgres:`/`postgresql:` URL, loading environment files through Next's environment loader. Client generation never migrates, seeds, or connects to the database. Restart the dev server after changing providers. Verify the selector with `npx tsx prisma/prepare-client.test.ts`.
- Dependency overrides patch PostCSS inside Next and deepmerge-ts inside Prisma without major framework upgrades. Revalidate overrides with both database test suites and `npm audit` when upgrading.

## Sale email notifications

- New confirmed sales create one `SaleEmailNotification` in the same transaction as stock/cash/audit changes. Historical sales are not backfilled. The snapshot preserves the original sale, items, totals, paid amount, currency, and showroom name; later installments do not rewrite it.
- Configure private `RESEND_API_KEY`, `SALE_NOTIFICATION_FROM` (plain verified sender email), and `SALE_NOTIFICATION_TO` (one separate owner/manager recipient). Do not use customer emails or add customer fields. Resend's test sender can only reach the account's approved testing recipient; other recipients require a verified sender domain.
- Delivery uses Resend's REST API without a new SDK dependency. `after()` submits only after the sale commits, with an 8-second timeout. Failures never undo a completed sale. Missing configuration leaves messages queued with an awaiting-setup indicator.
- Workers atomically claim a five-minute lease and use an immutable request body plus a stable Resend idempotency key. They retry with backoff, stop after eight attempts or 23 hours from the first attempt, and mark uncertain/expired messages REVIEW instead of risking duplicate submission beyond Resend's 24-hour idempotency window. Check Resend before manually resending REVIEW messages.
- Sale detail pages show email status and allow authenticated administrators to retry FAILED notifications. Cancelled sales are skipped before submission. Email payloads and statuses are included in authenticated backups; API keys are never stored in the database.
- `/api/cron/sale-emails` processes up to five due messages. Set `CRON_SECRET` to a random header-safe value of at least 32 characters in Vercel Production. The configured daily cron is compatible with Hobby scheduling limits; normal delivery is immediate after confirmation, while the daily job is only a fallback. Netlify requires its own external scheduler calling the protected endpoint.
- `npm run test:caisse` and `npm run test:postgres` include mocked email delivery, snapshot/HTML safety, atomic rollback, concurrency/lease recovery, cancellation, idempotency, retries, and cron authorization. Tests blank real email configuration and never send real emails. To generate a PostgreSQL migration against an isolated local cluster, run `PRISMA_CREATE_MIGRATION=your_migration_name npm run test:postgres` while the dev server is stopped. Never run migration development/reset commands against Neon.
