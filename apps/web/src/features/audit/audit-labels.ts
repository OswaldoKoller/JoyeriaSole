/**
 * Diccionarios de la pantalla de auditoría: acciones, tipos de entidad y campos en lenguaje
 * comprensible. Lo que no está en el diccionario se muestra con su código crudo (nunca se oculta).
 */

const ACTION_LABELS: Record<string, string> = {
  // Autenticación
  'auth.login': 'Inicio de sesión',
  'auth.login_failed': 'Intento de inicio de sesión fallido',
  'auth.logout': 'Cierre de sesión',
  // Usuarios
  'user.created': 'Usuario creado',
  'user.updated': 'Usuario modificado',
  'user.roles_updated': 'Roles del usuario modificados',
  'user.password_changed': 'Contraseña cambiada',
  'user.password_reset': 'Contraseña restablecida por el Administrador',
  'user.activated': 'Usuario activado',
  'user.deactivated': 'Usuario desactivado',
  // Catálogo
  'category.created': 'Categoría creada',
  'category.updated': 'Categoría modificada',
  'category.attributes_set': 'Atributos de la categoría definidos',
  'attribute.created': 'Atributo creado',
  'attribute.updated': 'Atributo modificado',
  'attribute_option.created': 'Opción de atributo creada',
  // Productos y variantes
  'product.created': 'Producto creado',
  'product.updated': 'Producto modificado',
  'product.activated': 'Producto activado',
  'product.deactivated': 'Producto desactivado',
  'product.deleted': 'Producto eliminado',
  'product.axes_configured': 'Ejes de variantes del producto configurados',
  'product.photo_added': 'Foto del producto agregada',
  'product.photo_removed': 'Foto del producto eliminada',
  'product.photo_cover_changed': 'Portada del producto cambiada',
  'product.photos_reordered': 'Fotos del producto reordenadas',
  'variant.created': 'Variante creada',
  'variant.activated': 'Variante activada',
  'variant.deactivated': 'Variante desactivada',
  'variant.min_stock_changed': 'Stock mínimo de la variante cambiado',
  'variant.price_changed': 'Precio de venta cambiado',
  'variant.barcode_assigned': 'Código de barras asignado',
  'variant.barcode_generated': 'Código de barras generado',
  // Precios
  'price.requested': 'Cambio de precio solicitado',
  'price.approved': 'Cambio de precio aprobado',
  'price.rejected': 'Cambio de precio rechazado',
  'price.cancelled': 'Cambio de precio cancelado',
  // Inventario: ajustes, stock inicial y cambios de pieza
  'inventory.initial_stock': 'Stock inicial registrado',
  'inventory.exchange': 'Cambio de pieza',
  'inventory.export_balances': 'Inventario exportado a CSV',
  'inventory.export_movements': 'Movimientos exportados a CSV',
  'inventory_adjustment.requested': 'Ajuste de inventario solicitado',
  'inventory_adjustment.approved': 'Ajuste de inventario aprobado',
  'inventory_adjustment.rejected': 'Ajuste de inventario rechazado',
  'inventory_adjustment.cancelled': 'Ajuste de inventario cancelado',
  // Conteos de inventario físico
  'inventory_count.created': 'Conteo físico creado',
  'inventory_count.started': 'Conteo físico iniciado',
  'inventory_count.taken': 'Conteo físico capturado',
  'inventory_count.first_closed': 'Primer conteo cerrado',
  'inventory_count.recount_closed': 'Reconteo cerrado',
  'inventory_count.finding_regularized': 'Diferencia del conteo regularizada',
  'inventory_count.approved': 'Conteo físico aprobado',
  'inventory_count.cancelled': 'Conteo físico cancelado',
  // Ingresos de mercadería
  'stock_entry.created': 'Ingreso de mercadería creado',
  'stock_entry.updated': 'Ingreso de mercadería modificado',
  'stock_entry.items_replaced': 'Ítems del ingreso reemplazados',
  'stock_entry.costs_replaced': 'Costos adicionales del ingreso reemplazados',
  'stock_entry.item_quick_created': 'Pieza nueva creada desde el ingreso',
  'stock_entry.confirmed': 'Ingreso de mercadería confirmado',
  'stock_entry.cancelled': 'Ingreso de mercadería anulado',
  'stock_entry_cost_type.created': 'Tipo de costo creado',
  // Proveedores
  'supplier.created': 'Proveedor creado',
  'supplier.updated': 'Proveedor modificado',
  'supplier.activated': 'Proveedor activado',
  'supplier.deactivated': 'Proveedor desactivado',
  // Caja y ventas (Fase 2). Una venta confirmada no se anula ni se modifica (DEC-V07).
  'cash_session.opened': 'Caja abierta',
  'cash_session.closed': 'Caja cerrada (arqueo)',
  'cash_session.corrected': 'Cierre de caja corregido',
  'sale.created': 'Venta registrada',
  'sale.receipt_printed': 'Comprobante interno impreso',
  'sale_incident.reported': 'Incidencia de venta reportada',
  'sale_incident.closed': 'Incidencia de venta cerrada',
  'business_settings.updated': 'Datos del negocio modificados',
  'business_logo.updated': 'Logo del negocio actualizado',
  'business_logo.removed': 'Logo del negocio quitado',
  'sale_exchange.created': 'Cambio de pieza de una venta registrado',
};

const ENTITY_LABELS: Record<string, string> = {
  Attribute: 'Atributo',
  AttributeOption: 'Opción de atributo',
  BusinessLogo: 'Logo del negocio',
  BusinessSettings: 'Datos del negocio',
  CashSession: 'Sesión de caja',
  Category: 'Categoría',
  Sale: 'Venta',
  SaleExchange: 'Cambio de pieza de una venta',
  SaleIncident: 'Incidencia de venta',
  InventoryAdjustment: 'Ajuste de inventario',
  InventoryCount: 'Conteo físico',
  InventoryExchange: 'Cambio de pieza',
  PriceChange: 'Cambio de precio',
  Product: 'Producto',
  ProductVariant: 'Variante',
  StockEntry: 'Ingreso de mercadería',
  StockEntryCostType: 'Tipo de costo',
  Supplier: 'Proveedor',
  User: 'Usuario',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  email: 'Correo',
  status: 'Estado',
  isActive: 'Activo',
  roles: 'Roles',
  mustChangePassword: 'Debe cambiar la contraseña',
  sku: 'SKU',
  barcode: 'Código de barras',
  salePrice: 'Precio de venta',
  previousPrice: 'Precio anterior',
  newPrice: 'Precio nuevo',
  minStock: 'Stock mínimo',
  quantity: 'Cantidad',
  reason: 'Motivo',
  notes: 'Observación',
  number: 'Número',
  currency: 'Moneda',
  exchangeRate: 'Tipo de cambio',
  variants: 'Variantes',
  adjustments: 'Ajustes',
  requestedById: 'Solicitado por (ID)',
  description: 'Descripción',
  categoryId: 'Categoría (ID)',
  supplierId: 'Proveedor (ID)',
  type: 'Tipo',
  country: 'País',
  taxId: 'NIT o identificador',
  contactName: 'Persona de contacto',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
  address: 'Dirección',
  defaultCurrency: 'Moneda habitual de compra',
  paymentTerms: 'Condiciones de pago',
  updatedAt: 'Actualizado',
  receiptFooterNote: 'Leyenda al pie del comprobante',
  receiptShowSeller: 'Imprimir quién atendió',
  difference: 'Diferencia cobrada',
  returned: 'Pieza devuelta',
  delivered: 'Pieza entregada',
  sha256: 'Huella del archivo',
};

/** Etiqueta en español de una acción; si no está en el diccionario, el código crudo. */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Etiqueta en español de un tipo de entidad; si no está en el diccionario, el código crudo. */
export function entityTypeLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

/** Etiqueta en español de un campo del antes/después; si no está, el nombre del campo. */
export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** ¿La acción tiene etiqueta propia? (la pantalla muestra además el código si es distinto). */
export function hasActionLabel(action: string): boolean {
  return action in ACTION_LABELS;
}
