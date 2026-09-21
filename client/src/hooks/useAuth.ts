import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { getQueryFn, isTransientQueryError, queryClient, transientQueryRetryDelay } from "@/lib/queryClient";

export type AuthUser = User & {
  isPlatformAdmin?: boolean;
  authType?: string;
  hasPassword?: boolean;
};

export function useAuth() {
  const { data: user, isPending } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async (context) => {
      if (!navigator.onLine) {
        const cached = queryClient.getQueryData<AuthUser | null>(["/api/auth/user"]);
        if (cached !== undefined) return cached;
        return null;
      }
      return getQueryFn<AuthUser | null>({ on401: "returnNull" })(context);
    },
    retry: (failureCount, error) => failureCount < 2 && isTransientQueryError(error),
    retryDelay: transientQueryRetryDelay,
    // Auth response can gain fields (e.g. isPlatformAdmin); do not keep a forever-fresh cache.
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: "offlineFirst",
  });

  return {
    user: user ?? undefined,
    isLoading: isPending && user === undefined,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin || false,
    isPlatformAdmin: user?.isPlatformAdmin || false,
    requiresRoleSelection: user?.requiresRoleSelection ?? false,
    hasActiveSubscription: user ? (user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) > new Date() : false) : false,
  };
}
