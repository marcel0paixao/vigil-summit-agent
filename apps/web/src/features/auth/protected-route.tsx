import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/features/auth/auth-provider";
import { Skeleton } from "@/shared/ui/skeleton";

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (auth.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    );
  }

  return <Outlet />;
}
