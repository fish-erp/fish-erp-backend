/*
  Warnings:

  - The values [USER,SUPER_ADMIN] on the enum `user_role` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "product_type" AS ENUM ('MEDICINE', 'FEED', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('SELLING', 'PAUSED', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "export_type" AS ENUM ('AT_HOME', 'DELIVERY');

-- CreateEnum
CREATE TYPE "export_status" AS ENUM ('EDITING', 'COMPLETED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "user_role_new" AS ENUM ('ADMIN');
ALTER TABLE "fish_erp"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_new" USING ("role"::text::"user_role_new");
ALTER TYPE "user_role" RENAME TO "user_role_old";
ALTER TYPE "user_role_new" RENAME TO "user_role";
DROP TYPE "fish_erp"."user_role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'ADMIN';
COMMIT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'ADMIN';

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "product_code" VARCHAR(50) NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "product_price" DECIMAL(18,2) NOT NULL,
    "remaining_quantity" DECIMAL(18,3) NOT NULL,
    "product_unit" VARCHAR(20) NOT NULL,
    "product_note" VARCHAR(1000),
    "type" "product_type" NOT NULL DEFAULT 'UNKNOWN',
    "status" "product_status" NOT NULL DEFAULT 'SELLING',
    "delete_at" TIMESTAMPTZ(3),
    "delete_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_product" (
    "id" UUID NOT NULL,
    "import_price" DECIMAL(18,2) NOT NULL,
    "import_quantity" INTEGER NOT NULL,
    "expire_date" TIMESTAMPTZ(3),
    "import_note" VARCHAR(1000),
    "status" "import_status" NOT NULL DEFAULT 'COMPLETED',
    "product_id" UUID NOT NULL,
    "delete_at" TIMESTAMPTZ(3),
    "delete_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "import_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_product" (
    "id" UUID NOT NULL,
    "export_quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2),
    "exportType" "export_type" NOT NULL DEFAULT 'AT_HOME',
    "exportStatus" "export_status" NOT NULL DEFAULT 'EDITING',
    "customer_name" VARCHAR(120),
    "customer_phone" VARCHAR(20),
    "delivery_address" VARCHAR(500),
    "export_note" VARCHAR(1000),
    "product_id" UUID NOT NULL,
    "delete_at" TIMESTAMPTZ(3),
    "delete_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "export_product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_product_code_key" ON "product"("product_code");

-- CreateIndex
CREATE INDEX "product_type_status_product_name_idx" ON "product"("type", "status", "product_name");

-- CreateIndex
CREATE INDEX "product_created_at_idx" ON "product"("created_at");

-- CreateIndex
CREATE INDEX "import_product_product_id_status_expire_date_idx" ON "import_product"("product_id", "status", "expire_date");

-- CreateIndex
CREATE INDEX "import_product_created_at_idx" ON "import_product"("created_at");

-- CreateIndex
CREATE INDEX "export_product_product_id_exportStatus_created_at_idx" ON "export_product"("product_id", "exportStatus", "created_at");

-- AddForeignKey
ALTER TABLE "import_product" ADD CONSTRAINT "import_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_product" ADD CONSTRAINT "export_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
