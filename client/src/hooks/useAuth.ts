import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { getQueryFn, isTransientQueryError, queryClient, transientQueryRetryDelay } from "@/lib/queryClient";

export function useAuth() {
  const { data: user, isPending } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async (context) => {
      if (!navigator.onLine) {
        const cached = queryClient.getQueryData<User | null>(["/api/auth/user"]);
        if (cached !== undefined) return cached;
        return null;
      }
      return getQueryFn<User | null>({ on401: "returnNull" })(context);
    },
    retry: (failureCount, error) => failureCount < 2 && isTransientQueryError(error),
    retryDelay: transientQueryRetryDelay,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: Infinity,
    networkMode: "offlineFirst",
  });

  return {
    user: user ?? undefined,
    isLoading: isPending && user === undefined,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin || false,
    requiresRoleSelection: user?.requiresRoleSelection ?? false,
    hasActiveSubscription: user ? (user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) > new Date() : false) : false,
  };
}
