# Fish ERP Backend

NestJS backend for managing fish feed and medicine ERP operations. The initial scope contains JWT authentication, role-based authorization, and administrator-only Users CRUD.

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
| POST   | `/api/v1/auth/login`   | Issue access and refresh tokens          |
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

All Users endpoints require the `ADMIN` or `SUPER_ADMIN` role. Password hashes are never returned by the API.

## Fresh database initialization

This repository intentionally contains no migration history. Point `DATABASE_URL` to the new database, then create the initial migration:

```bash
pnpm exec prisma migrate dev --name init
pnpm prisma:generate
```

The PostgreSQL namespace is `fish_erp`. Create the first `SUPER_ADMIN` manually with an Argon2 password hash before using the administrator portal. No account is seeded automatically.

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
