import type {
  AssignUserRolesInput,
  CreateUserInput,
  ResetPasswordInput,
  RoleSummary,
  UpdateUserInput,
  UserSummary,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authKeys } from '../auth/use-auth.ts';
import { api } from '../../lib/api-client.ts';
import { PAGE_SIZE, useListQuery, type Paged } from '../../lib/paging.ts';

type UserList = Paged<UserSummary>;

export function useUsers(page: number, q: string, status: string) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q, status });
  return useListQuery(['users', page, q, status], () => api.get<UserList>(`/users?${query}`));
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

export function useResetUserPassword() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResetPasswordInput }) =>
      api.post<{ data: UserSummary }>(`/users/${id}/reset-password`, input),
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
