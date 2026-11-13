-- Idempotencia de operaciones críticas (E0, autorizada el 2026-11-10). Ver docs/api/API.md «Idempotencia».
-- Tabla de claves Idempotency-Key: usuario + ruta + hash del cuerpo + respuesta guardada.
-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_user_id_idx" ON "idempotency_keys"("user_id");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

