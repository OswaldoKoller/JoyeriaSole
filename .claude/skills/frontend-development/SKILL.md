---
name: frontend-development
description: Cómo construir pantallas en el frontend React de Joyería Sole — estructura por features, TanStack Query, formularios con esquemas compartidos, permisos en la UI, componentes, accesibilidad, lector de códigos y tests. Usar al trabajar en apps/web.
---

# Desarrollo frontend

Stack: React 19, Vite 8, Tailwind 4 (tokens en `src/index.css`), TanStack Query 5, React Router 8.

## Estructura de una feature

```
src/features/suppliers/
├── suppliers-page.tsx        # página (ruta)
├── supplier-form.tsx         # componentes propios de la feature
├── use-suppliers.ts          # hooks de datos (queries/mutations)
└── suppliers-page.test.tsx
```

## Datos

```ts
export const supplierKeys = {
  all: ['suppliers'] as const,
  list: (q: string) => ['suppliers', 'list', q] as const,
};

export function useSuppliers(q: string) {
  return useQuery({
    queryKey: supplierKeys.list(q),
    queryFn: () => api.get<{ data: Supplier[] }>(`/suppliers?q=${encodeURIComponent(q)}`),
  });
}
export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => api.post<{ data: Supplier }>('/suppliers', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: supplierKeys.all }),
  });
}
```

- Nunca `fetch` directo: usar `src/lib/api-client.ts` (maneja cookie y `ApiError`).
- Mostrar `error.message` de `ApiError` (ya viene en español desde la API).

## Formularios

- Validar con el esquema de `@joyeria/shared` antes de enviar (`schema.safeParse`); mostrar errores por campo.
- Errores 400 de la API traen `details: [{ field, message }]` → mapear a los campos.
- Deshabilitar el botón mientras `isPending`.

## Rutas y permisos

```tsx
{ path: 'proveedores', element: <RequireAuth permissions={[PERMISSIONS.SUPPLIERS_READ]}><SuppliersPage /></RequireAuth> }
```

Ocultar acciones con `useHasPermission(PERMISSIONS.SUPPLIERS_MANAGE)`. Es solo UX: la API valida.

## Lector de códigos de barras

Los lectores USB/Bluetooth escriben el código y envían Enter. Patrón: input con `autoFocus`, al
`onKeyDown` Enter → buscar variante por código → limpiar y re-enfocar. No depender de marcas ni SDKs.

## Estilo y accesibilidad

- Tailwind con tokens `brand-*`; componentes base en `components/ui` (Button, Input, ...). Crear
  nuevos componentes ahí solo si son genéricos.
- Cada input con label (`Input` ya lo asocia); mensajes de error con `role="alert"`; foco visible.
- Estados: cargando, vacío, error, en cada vista.
- Formato: `Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })` (moneda P-10) y
  fechas en `America/La_Paz`.
- Responsive: debe usarse en tablet.

## Prohibido

- Lógica de negocio que la API no valide (precios, stock). P-03: no calcular precio = costo × 2.
- `dangerouslySetInnerHTML`, guardar datos sensibles en localStorage.
- Librerías UI pesadas sin aprobación.

## Tests

`renderWithProviders(<Page />, { route })` y `jsonResponse(status, body)` de `src/test/render.tsx`;
simular `fetch` con `vi.spyOn(globalThis, 'fetch')`. Consultar por rol/label, no por clases.
