import { useAuthStore } from '../stores/auth-store';

type Role = 'ADMIN' | 'MANAGER' | 'RECRUTEUR';

/**
 * Hook that derives granular permission flags from the authenticated user's role.
 *
 * Role hierarchy (highest → lowest): ADMIN > MANAGER > RECRUTEUR
 *
 * Permission matrix:
 *   RECRUTEUR — CRUD candidats/clients/entreprises/mandats, view team stats,
 *               import data, manage own activities/tasks, assign tasks
 *   MANAGER   — Everything RECRUTEUR (same permissions)
 *   ADMIN     — Everything + manage users, settings, delete anything
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const role: Role = (user?.role as Role) || 'RECRUTEUR';

  return {
    role,
    isAdmin: role === 'ADMIN',
    isManager: role === 'ADMIN' || role === 'MANAGER',
    isRecruteur: true, // everyone is at least a recruteur
    canCreateClient: true,
    canEditClient: true,
    canCreateEntreprise: true,
    canEditEntreprise: true,
    canCreateMandat: true,
    canDeleteEntity: role === 'ADMIN',
    canManageUsers: role === 'ADMIN',
    canViewTeamStats: true,
    canAssignTasks: true,
    canImport: true,
    canManageSettings: role === 'ADMIN',
  };
}
