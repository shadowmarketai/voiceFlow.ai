/**
 * Frontend Permission Matrix — Voice AI SaaS
 * Simplified permissions for Voice AI platform
 */

const PERMISSION_MATRIX = {
  admin: {
    voiceAI: new Set(['create', 'read', 'update', 'delete']),
    campaigns: new Set(['create', 'read', 'update', 'delete']),
    analytics: new Set(['create', 'read', 'update', 'delete']),
    billing: new Set(['create', 'read', 'update', 'delete']),
    settings: new Set(['create', 'read', 'update', 'delete']),
    userManagement: new Set(['create', 'read', 'update', 'delete']),
  },
  manager: {
    voiceAI: new Set(['create', 'read', 'update', 'delete']),
    campaigns: new Set(['create', 'read', 'update', 'delete']),
    analytics: new Set(['read']),
    billing: new Set(['read']),
    settings: new Set(['read', 'update']),
    userManagement: new Set(['read']),
  },
  agent: {
    voiceAI: new Set(['create', 'read', 'update']),
    campaigns: new Set(['create', 'read', 'update']),
    analytics: new Set(['read']),
    billing: new Set([]),
    settings: new Set(['read']),
    userManagement: new Set([]),
  },
  user: {
    voiceAI: new Set(['read']),
    campaigns: new Set(['create', 'read', 'update']),
    analytics: new Set(['read']),
    billing: new Set([]),
    settings: new Set(['read']),
    userManagement: new Set([]),
  },
  viewer: {
    voiceAI: new Set(['read']),
    campaigns: new Set(['read']),
    analytics: new Set(['read']),
    billing: new Set([]),
    settings: new Set(['read']),
    userManagement: new Set([]),
  },
};

export function hasPermission(role, module, action) {
  const rolePerms = PERMISSION_MATRIX[role];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.has(action);
}

export function canAccessModule(role, module) {
  const rolePerms = PERMISSION_MATRIX[role];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.size > 0;
}

export function getAccessibleModules(role) {
  const rolePerms = PERMISSION_MATRIX[role];
  if (!rolePerms) return [];
  return Object.entries(rolePerms)
    .filter(([, actions]) => actions.size > 0)
    .map(([module]) => module);
}

export default PERMISSION_MATRIX;
