-- CreateEnum
CREATE TYPE "supplier_type" AS ENUM ('NATIONAL', 'FOREIGN');

-- CreateEnum
CREATE TYPE "supplier_currency" AS ENUM ('BOB', 'USD');

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "country" VARCHAR(80),
ADD COLUMN     "default_currency" "supplier_currency" NOT NULL DEFAULT 'BOB',
ADD COLUMN     "payment_terms" VARCHAR(300),
ADD COLUMN     "type" "supplier_type" NOT NULL DEFAULT 'NATIONAL',
ADD COLUMN     "whatsapp" VARCHAR(40);

-- CreateIndex
CREATE INDEX "suppliers_type_idx" ON "suppliers"("type");
