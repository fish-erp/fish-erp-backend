-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "fish_erp";

-- CreateEnum
CREATE TYPE "fish_erp"."user_role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "fish_erp"."user_status" AS ENUM ('ACTIVE', 'DISABLED', 'DELETED');

-- CreateTable
CREATE TABLE "fish_erp"."users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(120),
    "full_name" VARCHAR(50),
    "role" "fish_erp"."user_role" NOT NULL DEFAULT 'USER',
    "status" "fish_erp"."user_status" NOT NULL DEFAULT 'ACTIVE',
    "delete_at" TIMESTAMPTZ(3),
    "delete_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fish_erp"."auth_sessions" (
    "id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "fish_erp"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "fish_erp"."users"("phone_number");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "fish_erp"."users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "fish_erp"."users"("created_at");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "fish_erp"."auth_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "fish_erp"."auth_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "fish_erp"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "fish_erp"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
