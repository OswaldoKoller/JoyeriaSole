/*
  Warnings:

  - You are about to drop the column `difference_reason` on the `inventory_count_items` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "inventory_count_scan_source" AS ENUM ('SCAN', 'MANUAL');

-- CreateEnum
CREATE TYPE "inventory_count_finding_type" AS ENUM ('NOT_FOUND', 'OUT_OF_SCOPE');

-- AlterEnum
ALTER TYPE "inventory_count_status" ADD VALUE 'RECOUNT';

-- AlterTable
ALTER TABLE "inventory_count_items" DROP COLUMN "difference_reason",
ADD COLUMN     "balance_after" INTEGER,
ADD COLUMN     "balance_before" INTEGER,
ADD COLUMN     "counted_cursor" BIGINT,
ADD COLUMN     "difference" INTEGER,
ADD COLUMN     "expected_qty" INTEGER,
ADD COLUMN     "final_qty" INTEGER,
ADD COLUMN     "movement_id" BIGINT,
ADD COLUMN     "needs_recount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reconciled_movements" INTEGER,
ADD COLUMN     "recount_cursor" BIGINT,
ADD COLUMN     "recount_qty" INTEGER,
ADD COLUMN     "recounted_at" TIMESTAMPTZ(3),
ADD COLUMN     "snapshot_cursor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "unit_cost" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "inventory_counts" ADD COLUMN     "category_id" UUID,
ADD COLUMN     "first_closed_at" TIMESTAMPTZ(3),
ADD COLUMN     "operator_id" UUID,
ADD COLUMN     "resolution_notes" TEXT,
ADD COLUMN     "review_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "inventory_count_scans" (
    "id" BIGSERIAL NOT NULL,
    "inventory_count_id" UUID NOT NULL,
    "round" SMALLINT NOT NULL,
    "variant_id" UUID,
    "finding_id" UUID,
    "code" VARCHAR(100) NOT NULL,
    "source" "inventory_count_scan_source" NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "movement_cursor" BIGINT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMPTZ(3),

    CONSTRAINT "inventory_count_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_findings" (
    "id" UUID NOT NULL,
    "inventory_count_id" UUID NOT NULL,
    "round" SMALLINT NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "type" "inventory_count_finding_type" NOT NULL,
    "variant_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "regularized_at" TIMESTAMPTZ(3),
    "regularized_by_id" UUID,
    "regularization_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_count_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_count_scans_inventory_count_id_round_id_idx" ON "inventory_count_scans"("inventory_count_id", "round", "id");

-- CreateIndex
CREATE INDEX "inventory_count_scans_variant_id_idx" ON "inventory_count_scans"("variant_id");

-- CreateIndex
CREATE INDEX "inventory_count_scans_finding_id_idx" ON "inventory_count_scans"("finding_id");

-- CreateIndex
CREATE INDEX "inventory_count_findings_variant_id_idx" ON "inventory_count_findings"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_findings_inventory_count_id_round_code_key" ON "inventory_count_findings"("inventory_count_id", "round", "code");

-- CreateIndex
CREATE INDEX "inventory_counts_category_id_idx" ON "inventory_counts"("category_id");

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_scans" ADD CONSTRAINT "inventory_count_scans_inventory_count_id_fkey" FOREIGN KEY ("inventory_count_id") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_scans" ADD CONSTRAINT "inventory_count_scans_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_scans" ADD CONSTRAINT "inventory_count_scans_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "inventory_count_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_scans" ADD CONSTRAINT "inventory_count_scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_findings" ADD CONSTRAINT "inventory_count_findings_inventory_count_id_fkey" FOREIGN KEY ("inventory_count_id") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_findings" ADD CONSTRAINT "inventory_count_findings_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_findings" ADD CONSTRAINT "inventory_count_findings_regularized_by_id_fkey" FOREIGN KEY ("regularized_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
