-- C1/P-24: marca «ficha incompleta» para piezas creadas desde un ingreso con datos mínimos.
ALTER TABLE "products" ADD COLUMN "profile_incomplete" BOOLEAN NOT NULL DEFAULT false;
