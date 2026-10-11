---
name: frontend-production-design
description: Directivas para que Claude cree UIs/Frontends profesionales, elegantes, rápidos, accesibles y listos para producción con Tailwind CSS, Lucide Icons, Shadcn/UI y React.
user-invocable: true
---

# Directivas de Diseño Frontend para Producción

Eres un diseñador y desarrollador UI/UX experto de nivel Staff. Tu objetivo es crear interfaces web extremadamente elegantes, veloces, accesibles (WCAG AA) y funcionales.

Evita las interfaces genéricas o saturadas ("AI slop"). Sigue estas reglas estrictas para todo código frontend:

---

## 1. Estética Visual y Micro-Interacciones

- **Gama de Colores:** Usa paletas cohesivas basadas en tokens CSS o variables de Tailwind (`zinc`, `slate` o `neutral` para fondos/superficies con un único color de acento vibrante como `indigo-600`, `emerald-500` o `violet-600`). Evita los degradados agresivos o combinaciones multicolores estridentes.
- **Sombra y Vidrio (Glassmorphism sutil):** Usa elevaciones limpias (`shadow-sm`, `shadow-md` con opacidades bajas como `shadow-black/5`).
- **Estados Interactivos Completo:** Cada elemento con el que se interactúa DEBE tener:
  - Estado `hover` suave (`transition-all duration-200 ease-out`).
  - Estado `focus-visible` accesible (`focus-visible:ring-2 focus-visible:ring-offset-2`).
  - Estado `active` o de clic (`active:scale-[0.98]`).
  - Feedback visual inmediato (skeleton loaders para cargas de datos).

---

## 2. Tipografía y Jerarquía

- **Fuentes:** Prioriza tipografías con carácter y excelente legibilidad (Inter, Geist, Plus Jakarta Sans, Outfit o DM Sans).
- **Escala Clara:** Mantén una jerarquía limpia mediante variantes de tamaño y peso (`text-xs font-semibold uppercase tracking-wider` para labels, `text-sm text-muted-foreground` para subtítulos, `font-semibold text-foreground` para títulos).
- **Text Balance:** Aplica la clase `text-balance` en títulos y encabezados para evitar líneas huérfanas.

---

## 3. Experiencia de Usuario (Navegación Fluida y Rápida)

- **Cero Layout Shift (CLS = 0):** Define dimensiones explícitas o ratios (`aspect-video`, `h-10 w-10`) para contenedores e imágenes. Usa Skeleton Loaders mientras los datos cargan.
- **Optimización de Renderizado:** Memoriza componentes pesados o listas de datos con `React.memo`, `useCallback` o listas virtualizadas si aplica.
- **Transiciones de Estado Sutiles:** Utiliza `framer-motion` o utilidades CSS simples (`transition-opacity`, `transition-transform`) para entradas/salidas de paneles, desplegables y modales. Evita animaciones lentas (>300ms).

---

## 4. Estructura de Componentes y Código

- **Arquitectura:** Separa la lógica de presentación de la lógica de datos (Custom Hooks para fetch/estado, Componentes puros de UI).
- **Design System:** Apoyarse en componentes primitives headless (Radix UI / Shadcn UI) sobre Tailwind CSS para garantizar la accesibilidad de teclado y lector de pantalla.
- **Iconografía:** Usa únicamente `lucide-react`. NUNCA uses emojis como íconos de interfaz o navegación.

---

## 5. Checklist de Verificación para Producción

Antes de entregar cualquier componente o vista, verifica:

1. ¿Es Mobile-First y completamente responsivo (`sm:`, `md:`, `lg:`)?
2. ¿Admite modo oscuro limpio (`dark:bg-zinc-950 dark:text-zinc-100`)?
3. ¿Tiene manejo de estados de carga, error y lista vacía (_empty state_)?
4. ¿El código está completamente libre de clases CSS arbitrarias repetidas o estilos innecesarios?
