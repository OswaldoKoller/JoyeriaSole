-- Uso sugerido de cada atributo (B2, RESOLUCIONES-2026-11-05 §2) y marca de definiciones del sistema.
-- CreateEnum
CREATE TYPE "attribute_usage" AS ENUM ('VARIANT_AXIS', 'DESCRIPTIVE');

-- AlterTable
ALTER TABLE "attributes" ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suggested_use" "attribute_usage" NOT NULL DEFAULT 'DESCRIPTIVE';

-- Las 12 definiciones base (si el seed ya las creó). Variante: material, color, talla, tamaño y
-- longitud; el resto es descriptivo (el valor por defecto). El seed idempotente hace lo mismo en
-- bases nuevas.
UPDATE "attributes"
SET "is_system" = true
WHERE "code" IN ('material', 'color', 'tono', 'talla', 'tamano', 'longitud', 'dimensiones',
                 'acabado', 'piedra', 'tipo_cierre', 'genero', 'coleccion');

UPDATE "attributes"
SET "suggested_use" = 'VARIANT_AXIS'
WHERE "code" IN ('material', 'color', 'talla', 'tamano', 'longitud');
