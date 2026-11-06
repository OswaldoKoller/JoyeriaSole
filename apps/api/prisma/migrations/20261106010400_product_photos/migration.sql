-- CreateTable
CREATE TABLE "product_photos" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "content_type" VARCHAR(50) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "position" INTEGER NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_photo_blobs" (
    "photo_id" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "product_photo_blobs_pkey" PRIMARY KEY ("photo_id")
);

-- CreateIndex
CREATE INDEX "product_photos_product_id_position_idx" ON "product_photos"("product_id", "position");

-- CreateIndex
CREATE INDEX "product_photos_created_by_id_idx" ON "product_photos"("created_by_id");

-- AddForeignKey
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_photo_blobs" ADD CONSTRAINT "product_photo_blobs_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "product_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones de integridad de las fotos (ADR-020).
ALTER TABLE "product_photos"
  ADD CONSTRAINT "product_photos_content_type_check"
    CHECK ("content_type" IN ('image/webp', 'image/jpeg', 'image/png')),
  ADD CONSTRAINT "product_photos_dimensions_check"
    CHECK ("width" > 0 AND "height" > 0 AND "size_bytes" > 0),
  ADD CONSTRAINT "product_photos_position_check" CHECK ("position" >= 0);

-- Como máximo una portada por producto.
CREATE UNIQUE INDEX "product_photos_one_cover_per_product"
  ON "product_photos" ("product_id") WHERE "is_cover";

-- Los bytes nunca quedan vacíos.
ALTER TABLE "product_photo_blobs"
  ADD CONSTRAINT "product_photo_blobs_bytes_check" CHECK (octet_length("bytes") > 0);
