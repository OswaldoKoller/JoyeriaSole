-- CreateTable
CREATE TABLE "product_photo_thumbnails" (
    "photo_id" UUID NOT NULL,
    "width" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "product_photo_thumbnails_pkey" PRIMARY KEY ("photo_id","width")
);

-- AddForeignKey
ALTER TABLE "product_photo_thumbnails" ADD CONSTRAINT "product_photo_thumbnails_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "product_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Miniaturas de fotos (DT-DAT-18, nota de ADR-020): solo anchos de la lista blanca y nunca vacías.
ALTER TABLE "product_photo_thumbnails"
  ADD CONSTRAINT "product_photo_thumbnails_width_check" CHECK ("width" IN (160, 320, 640)),
  ADD CONSTRAINT "product_photo_thumbnails_bytes_check" CHECK (octet_length("bytes") > 0);
