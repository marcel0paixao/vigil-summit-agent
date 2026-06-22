import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getCurrentUser } from "@/shared/api/auth";
import {
  ApiError,
  SESSION_EXPIRED_EVENT,
  clearAccessToken,
  clearSessionExpiredNotification,
  getAccessToken,
  setAccessToken
} from "@/shared/api/http";
import { queryKeys } from "@/shared/api/query-keys";
import type { CurrentUser } from "@/shared/api/types";

interface AuthContextValue {
  token: string | null;
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => getAccessToken());

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: getCurrentUser,
    enabled: Boolean(token),
    retry: false
  });

  const expireSession = useCallback(() => {
    clearAccessToken();
    setToken(null);
    queryClient.clear();

    if (location.pathname !== "/login") {
      navigate("/login", {
        replace: true,
        state: {
          from: location,
          sessionExpired: true
        }
      });
    }
  }, [location, navigate, queryClient]);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
    };
  }, [expireSession]);

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      expireSession();
    }
  }, [expireSession, meQuery.error]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user: meQuery.data?.user ?? null,
      isAuthenticated: Boolean(token),
      isLoading: Boolean(token) && meQuery.isLoading,
      signIn: (nextToken) => {
        clearSessionExpiredNotification();
        setAccessToken(nextToken);
        setToken(nextToken);
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      },
      signOut: () => {
        clearAccessToken();
        clearSessionExpiredNotification();
        setToken(null);
        queryClient.clear();
      }
    }),
    [meQuery.data?.user, meQuery.isLoading, queryClient, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
