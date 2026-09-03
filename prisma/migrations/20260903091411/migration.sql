/*
  Warnings:

  - You are about to drop the column `customer_name` on the `export_product` table. All the data in the column will be lost.
  - You are about to drop the column `customer_phone` on the `export_product` table. All the data in the column will be lost.
  - You are about to drop the column `delete_at` on the `export_product` table. All the data in the column will be lost.
  - You are about to drop the column `delete_by` on the `export_product` table. All the data in the column will be lost.
  - You are about to drop the column `delivery_address` on the `export_product` table. All the data in the column will be lost.
  - You are about to drop the column `exportStatus` on the `export_product` table. All the data in the column will be lost.
  - You are about to drop the column `exportType` on the `export_product` table. All the data in the column will be lost.
  - You are about to drop the column `export_note` on the `export_product` table. All the data in the column will be lost.
  - You are about to alter the column `export_quantity` on the `export_product` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,3)` to `Integer`.
  - You are about to alter the column `remaining_quantity` on the `product` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,3)` to `Integer`.
  - A unique constraint covering the columns `[export_invoice_id,product_id]` on the table `export_product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[import_code]` on the table `import_product` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `export_invoice_id` to the `export_product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `import_code` to the `import_product` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "export_product_product_id_exportStatus_created_at_idx";

-- AlterTable
ALTER TABLE "export_product" DROP COLUMN "customer_name",
DROP COLUMN "customer_phone",
DROP COLUMN "delete_at",
DROP COLUMN "delete_by",
DROP COLUMN "delivery_address",
DROP COLUMN "exportStatus",
DROP COLUMN "exportType",
DROP COLUMN "export_note",
ADD COLUMN     "export_invoice_id" UUID NOT NULL,
ADD COLUMN     "line_note" VARCHAR(500),
ALTER COLUMN "export_quantity" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "import_product" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "import_code" VARCHAR(50) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "product" ALTER COLUMN "remaining_quantity" SET DEFAULT 0,
ALTER COLUMN "remaining_quantity" SET DATA TYPE INTEGER;

-- CreateTable
CREATE TABLE "export_invoice" (
    "id" UUID NOT NULL,
    "invoice_code" VARCHAR(50) NOT NULL,
    "exportType" "export_type" NOT NULL DEFAULT 'AT_HOME',
    "exportStatus" "export_status" NOT NULL DEFAULT 'EDITING',
    "customer_name" VARCHAR(120),
    "customer_phone" VARCHAR(20),
    "delivery_address" VARCHAR(500),
    "export_note" VARCHAR(1000),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "delete_at" TIMESTAMPTZ(3),
    "delete_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "export_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "export_invoice_invoice_code_key" ON "export_invoice"("invoice_code");

-- CreateIndex
CREATE INDEX "export_invoice_exportStatus_completed_at_idx" ON "export_invoice"("exportStatus", "completed_at");

-- CreateIndex
CREATE INDEX "export_invoice_created_at_idx" ON "export_invoice"("created_at");

-- CreateIndex
CREATE INDEX "export_product_product_id_idx" ON "export_product"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "export_product_export_invoice_id_product_id_key" ON "export_product"("export_invoice_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_product_import_code_key" ON "import_product"("import_code");

-- CreateIndex
CREATE INDEX "import_product_status_completed_at_idx" ON "import_product"("status", "completed_at");

-- AddForeignKey
ALTER TABLE "export_product" ADD CONSTRAINT "export_product_export_invoice_id_fkey" FOREIGN KEY ("export_invoice_id") REFERENCES "export_invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
