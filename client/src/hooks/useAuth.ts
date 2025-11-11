import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  // If we get a 401 error, treat it as "not authenticated" (not loading)
  const isAuthLoading = isLoading && !error;

  return {
    user,
    isLoading: isAuthLoading,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin || false,
    hasActiveSubscription: user ? (user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) > new Date() : false) : false,
  };
}
