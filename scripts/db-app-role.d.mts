/** Tipos del usuario de PostgreSQL de la aplicación (`scripts/db-app-role.mjs`), para sus pruebas. */
export const DEFAULT_APP_DB_USER: string;
export function assertAppRole(role: unknown, superuser?: string): string;
export function assertAppPassword(password: unknown): string;
export function appDatabaseUrl(options: {
  role: string;
  password: string;
  host: string;
  port: number | string;
  database: string;
}): string;
export function scramVerifier(
  password: string,
  options?: { salt?: Buffer; iterations?: number },
): string;
export function appRoleSql(options: { role: string; verifier: string }): string;
export function appOwnershipSql(options: { role: string }): string;
export function protectionStatusSql(options: { role: string }): string;
export interface ProtectionStatus {
  active: boolean;
  reasons: string[];
  superuser?: boolean;
  ownsDatabase?: boolean;
  tables?: number;
  notOwned?: number;
  withTruncate?: number;
}
export function parseProtectionStatus(output: unknown): ProtectionStatus;
