// Auth state for the whole app: who is logged in, their role, login/logout.
//
// The implementation lives in components/auth/AuthProvider.tsx (JWT in an
// httpOnly cookie, verified against Laravel on load / focus / every 5 min /
// any 401, synced across tabs). This module is the import path for pages:
//
//   import { useAuth } from "@/context/AuthContext";
//   const { user, status, logout } = useAuth();   // user.role.id, user.role.name
export { default as AuthProvider, useAuth } from "@/components/auth/AuthProvider";
export type { AuthUser } from "@/lib/api/types";
