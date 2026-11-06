import type {
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  LoginResult,
  Permission,
} from '@joyeria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api-client.ts';

export const authKeys = { me: ['auth', 'me'] as const };

async function fetchMe(): Promise<AuthUser | null> {
  try {
    const { data } = await api.get<{ data: AuthUser }>('/auth/me');
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Usuario actual (null = sin sesión). Fuente única de verdad del estado de autenticación. */
export function useCurrentUser() {
  return useQuery({ queryKey: authKeys.me, queryFn: fetchMe, staleTime: 5 * 60 * 1000 });
}

export function useHasPermission(...required: Permission[]): boolean {
  const { data: user } = useCurrentUser();
  return !!user && required.every((p) => user.permissions.includes(p));
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<{ data: LoginResult }>('/auth/login', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>('/auth/logout'),
    onSettled: () => {
      queryClient.setQueryData(authKeys.me, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post<undefined>('/auth/change-password', input),
    onSuccess: () => {
      queryClient.setQueryData(authKeys.me, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
  });
}
