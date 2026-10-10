import type {
  AssignUserRolesInput,
  CreateUserInput,
  RoleSummary,
  UpdateUserInput,
  UserSummary,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authKeys } from '../auth/use-auth.ts';
import { api } from '../../lib/api-client.ts';

type UserList = {
  data: UserSummary[];
  meta: { page: number; pageSize: number; total: number };
};

export function useUsers(page: number, q: string, status: string) {
  const query = new URLSearchParams({ page: String(page), pageSize: '25', q, status });
  return useQuery({
    queryKey: ['users', page, q, status],
    queryFn: () => api.get<UserList>(`/users?${query}`),
  });
}

export function useAvailableRoles(enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'roles'],
    queryFn: () => api.get<{ data: RoleSummary[] }>('/users/roles'),
    enabled,
  });
}

function useRefreshUsers() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['users'] }),
      client.invalidateQueries({ queryKey: authKeys.me }),
    ]);
  };
}

export function useUpdateUser() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      api.patch<{ data: UserSummary }>(`/users/${id}`, input),
    onSuccess: refresh,
  });
}

export function useCreateUser() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<{ data: UserSummary }>('/users', input),
    onSuccess: refresh,
  });
}

export function useAssignUserRoles() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignUserRolesInput }) =>
      api.put<{ data: UserSummary }>(`/users/${id}/roles`, input),
    onSuccess: refresh,
  });
}
