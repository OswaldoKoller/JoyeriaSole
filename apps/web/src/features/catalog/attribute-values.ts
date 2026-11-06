import type { Attribute, Product, ProductAttributeInput } from '@joyeria/shared';

/** Valores en edición de las características de un producto: id de atributo → texto del campo. */
export type AttributeDraft = Record<string, string>;

/**
 * Convierte lo escrito en el formulario al formato de la API. Los campos vacíos se omiten
 * (C1: una ficha puede quedar sin características). Para listas el valor es el id de la opción;
 * para sí/no, «true» o «false».
 */
export function buildAttributeInputs(
  attributes: Attribute[],
  draft: AttributeDraft,
): ProductAttributeInput[] {
  const inputs: ProductAttributeInput[] = [];
  for (const attribute of attributes) {
    const raw = (draft[attribute.id] ?? '').trim();
    if (!raw) continue;
    switch (attribute.dataType) {
      case 'OPTION':
        inputs.push({ attributeId: attribute.id, optionId: raw });
        break;
      case 'TEXT':
        inputs.push({ attributeId: attribute.id, valueText: raw });
        break;
      case 'NUMBER':
        inputs.push({ attributeId: attribute.id, valueNumber: raw.replace(',', '.') });
        break;
      case 'BOOLEAN':
        inputs.push({ attributeId: attribute.id, valueBoolean: raw === 'true' });
        break;
    }
  }
  return inputs;
}

/** Valores actuales de la ficha, listos para editar. */
export function draftFromProduct(product: Product): AttributeDraft {
  const draft: AttributeDraft = {};
  for (const value of product.attributes) {
    draft[value.attributeId] =
      value.dataType === 'OPTION'
        ? (value.optionId ?? '')
        : value.dataType === 'TEXT'
          ? (value.valueText ?? '')
          : value.dataType === 'NUMBER'
            ? (value.valueNumber ?? '')
            : value.valueBoolean === null
              ? ''
              : String(value.valueBoolean);
  }
  return draft;
}

/** Nombres de los atributos obligatorios (según la categoría) que siguen vacíos. */
export function missingRequired(
  attributes: Attribute[],
  requiredIds: ReadonlySet<string>,
  draft: AttributeDraft,
): string[] {
  return attributes
    .filter((attribute) => requiredIds.has(attribute.id) && !(draft[attribute.id] ?? '').trim())
    .map((attribute) => attribute.name);
}

/**
 * Ordena para el formulario: primero el uso sugerido que se pide, luego el otro. Dentro de cada
 * grupo se respeta el orden de la definición. Así los sugeridos como eje aparecen primero en
 * «Variantes» y los descriptivos primero en «Características» (B2), sin impedir cambiar de lugar.
 */
export function sortBySuggestedUse(attributes: Attribute[], first: Attribute['suggestedUse']) {
  return [...attributes].sort(
    (a, b) => Number(b.suggestedUse === first) - Number(a.suggestedUse === first),
  );
}

/** Etiqueta del campo: nombre, unidad y marca de obligatorio. */
export function attributeLabel(attribute: Attribute, required: boolean) {
  return `${attribute.name}${attribute.unit ? ` (${attribute.unit})` : ''}${required ? ' (obligatorio)' : ''}`;
}
