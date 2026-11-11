# Resolución del 2026-11-10: autorización de implementación

Registro de la autorización dada por el responsable del proyecto en el chat de trabajo el 2026-11-10.

## Texto literal

> «idempotencia, garantias nuevas en las bases de datos: autorizadas, pantalla de roles, miniaturas y
> todo el modulo de ventas: autorizado. al completar realiza un informe de software completo y lanza el
> proyecto para que yo vea los cambios y revise»

## Qué queda autorizado

| Tema              | Alcance autorizado                                                                                                                        | Antes                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Idempotencia      | Mecanismo genérico con cabecera `Idempotency-Key` y su uso en las operaciones que mueven stock o confirman documentos                     | No autorizado (2026-11-09)              |
| Garantías de BD   | El conjunto D3: I-01 (saldo = libro), I-02 (unicidad por documento y variante) y quitar `TRUNCATE` al usuario de la app en producción     | Aprobado como conjunto, sin implementar |
| Pantalla de roles | API y pantalla de gestión de roles (P-46)                                                                                                 | No autorizado                           |
| Miniaturas        | Miniaturas de fotos de producto (OD-04, DT-DAT-17/18)                                                                                     | No autorizado                           |
| Módulo de Ventas  | E1 venta de mostrador con comprobante interno y E3 caja única, según el plan `docs/propuestas/fase-2-ventas/11-plan-de-implementacion.md` | Solo análisis (resolución 2026-11-07)   |
| Entrega           | Informe de software completo y el proyecto levantado en local para revisión                                                               | —                                       |

## Qué sigue vigente

- **DEC-V07:** no se anulan ventas confirmadas, ni con mecanismos equivalentes o encubiertos. La autorización
  de «todo el módulo de ventas» no la levanta: E2 (anulaciones) sigue excluida.
- Los valores marcados «POR DEFECTO — PENDIENTE DE CONFIRMACIÓN» en el plan 11 (§2.2) son propuestas
  conservadoras para poder construir; el responsable debe revisarlos y no son reglas de negocio.
- Fuera de alcance: facturación fiscal (Q-V02), créditos y apartados (Q-V05), descuentos, clientes,
  gastos y retiros de caja (B6), reapertura de caja (B7), cambios de pieza ligados a ventas (E4).
- Push, PR y despliegue requieren indicación aparte; el CI de GitHub Actions está bloqueado (F2).
