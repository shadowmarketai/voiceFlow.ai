import React from 'react';
import { usePermissions } from '../hooks/usePermissions';
import AccessDenied from './AccessDenied';

/**
 * Wraps children and checks if the current user can access the given module.
 * Shows AccessDenied page if the user lacks permission.
 *
 * Usage:
 *   <RoleGatedRoute module="crm">
 *     <CRMDashboard />
 *   </RoleGatedRoute>
 */
export default function RoleGatedRoute({ module, children }) {
  const { canAccess } = usePermissions();

  if (!canAccess(module)) {
    return <AccessDenied module={module} />;
  }

  return <>{children}</>;
}
