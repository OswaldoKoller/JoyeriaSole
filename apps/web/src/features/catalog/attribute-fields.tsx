import type { Attribute } from '@joyeria/shared';
import { attributeLabel, type AttributeDraft } from './attribute-values.ts';

const field =
  'block min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none';

/**
 * Campos de las características descriptivas del producto (texto, número, lista o sí/no).
 * Sin lógica de negocio: solo edita el borrador; la validación real la hace la API.
 */
export function AttributeFields({
  attributes,
  draft,
  requiredIds,
  idPrefix,
  onChange,
}: {
  attributes: Attribute[];
  draft: AttributeDraft;
  requiredIds: ReadonlySet<string>;
  idPrefix: string;
  onChange: (attributeId: string, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {attributes.map((attribute) => {
        const id = `${idPrefix}-${attribute.id}`;
        const required = requiredIds.has(attribute.id);
        const value = draft[attribute.id] ?? '';
        return (
          <div key={attribute.id} className="space-y-1">
            <label htmlFor={id} className="block text-sm font-medium text-stone-700">
              {attributeLabel(attribute, required)}
            </label>
            {attribute.dataType === 'OPTION' ? (
              <select
                id={id}
                value={value}
                onChange={(event) => {
                  onChange(attribute.id, event.target.value);
                }}
                className={field}
              >
                <option value="">Sin definir</option>
                {attribute.options
                  .filter((option) => option.isActive || option.id === value)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.value}
                    </option>
                  ))}
              </select>
            ) : attribute.dataType === 'BOOLEAN' ? (
              <select
                id={id}
                value={value}
                onChange={(event) => {
                  onChange(attribute.id, event.target.value);
                }}
                className={field}
              >
                <option value="">Sin definir</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                id={id}
                value={value}
                inputMode={attribute.dataType === 'NUMBER' ? 'decimal' : undefined}
                maxLength={attribute.dataType === 'TEXT' ? 500 : 14}
                onChange={(event) => {
                  onChange(attribute.id, event.target.value);
                }}
                className={field}
              />
            )}
            {attribute.dataType === 'OPTION' &&
              attribute.options.every((option) => !option.isActive) && (
                <p className="text-xs text-stone-500">
                  Aún no hay valores cargados para {attribute.name}.
                </p>
              )}
          </div>
        );
      })}
    </div>
  );
}
