import type { Category } from '@joyeria/shared';

/** Ruta completa de cada categoría («Joyería › Anillos») para elegir el alcance. */
export function categoryOptions(categories: readonly Category[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const pathOf = (category: Category): string => {
    const names = [category.name];
    let parent = category.parentId ? byId.get(category.parentId) : undefined;
    for (let depth = 0; parent && depth < 20; depth += 1) {
      names.unshift(parent.name);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return names.join(' › ');
  };
  return categories
    .filter((category) => category.isActive)
    .map((category) => ({ id: category.id, label: pathOf(category) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
