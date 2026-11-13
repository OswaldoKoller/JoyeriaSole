import type {
  CreateRoleInput,
  PermissionCatalog,
  RoleDetail,
  UpdateRoleInput,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { authKeys } from '../auth/use-auth.ts';

export const roleKeys = {
  all: ['roles'] as const,
  list: ['roles', 'list'] as const,
  permissions: ['roles', 'permissions'] as const,
};

export function useRoles() {
  return useQuery({
    queryKey: roleKeys.list,
    queryFn: () => api.get<{ data: RoleDetail[] }>('/roles'),
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: roleKeys.permissions,
    queryFn: () => api.get<{ data: PermissionCatalog }>('/roles/permissions'),
    staleTime: Infinity,
  });
}

/**
 * Tras cambiar un rol se refrescan los roles, la gestión de usuarios (su selector de roles y la
 * columna «Roles») y la sesión propia, por si cambiaron los permisos de quien edita.
 */
function useRefreshRoles() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: roleKeys.all }),
      client.invalidateQueries({ queryKey: ['users'] }),
      client.invalidateQueries({ queryKey: authKeys.me }),
    ]);
  };
}

export function useCreateRole() {
  const refresh = useRefreshRoles();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => api.post<{ data: RoleDetail }>('/roles', input),
    onSuccess: refresh,
  });
}

export function useUpdateRole() {
  const refresh = useRefreshRoles();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleInput }) =>
      api.patch<{ data: RoleDetail }>(`/roles/${id}`, input),
    onSuccess: refresh,
  });
}

export function useDeleteRole() {
  const refresh = useRefreshRoles();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/roles/${id}`),
    onSuccess: refresh,
  });
}
