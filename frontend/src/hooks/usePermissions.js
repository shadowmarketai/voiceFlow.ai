import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, canAccessModule, getAccessibleModules } from '../config/permissions';

/**
 * Hook for checking user permissions throughout the app.
 *
 * Usage:
 *   const { can, canAccess, canWrite, isAdmin, accessibleModules } = usePermissions();
 *   if (can('crm', 'delete')) { ... }
 *   if (canAccess('billing')) { ... }
 */
export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role || 'viewer';

  const permissions = useMemo(() => {
    const can = (module, action) => hasPermission(role, module, action);
    const canAccess = (module) => canAccessModule(role, module);
    const canWrite = (module) => hasPermission(role, module, 'create') || hasPermission(role, module, 'update');
    const accessibleModules = getAccessibleModules(role);
    const isAdmin = role === 'admin';
    const isManager = role === 'manager';

    return { can, canAccess, canWrite, isAdmin, isManager, role, accessibleModules };
  }, [role]);

  return permissions;
}
