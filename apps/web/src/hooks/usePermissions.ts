import { useAuthStore } from '../stores/auth-store';

type Role = 'ADMIN' | 'MANAGER' | 'RECRUTEUR';

/**
 * Hook that derives granular permission flags from the authenticated user's role.
 *
 * Role hierarchy (highest → lowest): ADMIN > MANAGER > RECRUTEUR
 *
 * Permission matrix:
 *   RECRUTEUR — CRUD candidats, view clients/entreprises (not create/edit),
 *               view own mandats, manage own activities/tasks
 *   MANAGER   — Everything RECRUTEUR + CRUD clients/entreprises, create mandats,
 *               view team stats, assign tasks
 *   ADMIN     — Everything + manage users, settings, import, delete anything
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const role: Role = (user?.role as Role) || 'RECRUTEUR';

  return {
    role,
    isAdmin: role === 'ADMIN',
    isManager: role === 'ADMIN' || role === 'MANAGER',
    isRecruteur: true, // everyone is at least a recruteur
    canCreateClient: role !== 'RECRUTEUR',
    canEditClient: role !== 'RECRUTEUR',
    canCreateEntreprise: role !== 'RECRUTEUR',
    canEditEntreprise: role !== 'RECRUTEUR',
    canCreateMandat: role !== 'RECRUTEUR',
    canDeleteEntity: role === 'ADMIN',
    canManageUsers: role === 'ADMIN',
    canViewTeamStats: role !== 'RECRUTEUR',
    canAssignTasks: role !== 'RECRUTEUR',
    canImport: role === 'ADMIN',
    canManageSettings: role === 'ADMIN',
  };
}
