# Fish ERP Backend

NestJS backend for managing fish feed, medicine, warehouse receipts, outbound invoices and inventory reports.

## Stack

- Node.js 24, pnpm 10 and TypeScript 5.9
- NestJS 11 with Fastify
- Prisma ORM 7 with PostgreSQL
- Swagger, Pino, Zod, Jest and Supertest

## Local setup

```bash
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm dev
```

The API runs at `http://localhost:8080/api/v1` and Swagger at `http://localhost:8080/docs`.

## Authentication API

| Method | Path                   | Description                              |
| ------ | ---------------------- | ---------------------------------------- |
| POST   | `/api/v1/auth/login`   | Login by email or Vietnamese phone number |
| POST   | `/api/v1/auth/refresh` | Rotate the current refresh token         |
| GET    | `/api/v1/auth/me`      | Return the authenticated identity        |
| POST   | `/api/v1/auth/logout`  | Revoke the current authenticated session |

## Users API

| Method | Path                | Description                       |
| ------ | ------------------- | --------------------------------- |
| POST   | `/api/v1/users`     | Create a user                     |
| GET    | `/api/v1/users`     | List users with pagination/search |
| GET    | `/api/v1/users/:id` | Get a user                        |
| PATCH  | `/api/v1/users/:id` | Update a user                     |
| DELETE | `/api/v1/users/:id` | Soft-delete a user                |

All Users endpoints require the `ADMIN` role. Password hashes are never returned by the API.

## Warehouse API

- CRUD and state transitions: `/api/v1/imports` and `/api/v1/exports`
- Inventory workbook: `/api/v1/reports/inventory.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD&includePrice=false`
- Sales workbook: `/api/v1/reports/sales.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD&includePrice=false`

Completing or cancelling a receipt/invoice updates `Product.remainingQuantity` and appends an `InventoryMovement` in one database transaction.

## Database migration

Back up the database, point `DATABASE_URL` to it and apply the checked-in migrations:

```bash
pnpm exec prisma migrate deploy
pnpm prisma:generate
```

The migration preserves Products and existing import receipts, backfills inventory movements and aborts if old stock cannot be reconciled. The PostgreSQL namespace is `fish_erp`. No account is seeded automatically.

Business reports use `APP_TIMEZONE=Asia/Ho_Chi_Minh` when calculating daily, weekly and monthly date ranges. PostgreSQL timestamps remain stored as `timestamptz`.

## Verification

```bash
pnpm prisma:validate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm test:e2e` only after migrating a dedicated test database.
