import React from 'react';
import { Shield, Check, X } from 'lucide-react';
import PERMISSION_MATRIX from '../../config/permissions';

const ROLES = ['admin', 'manager', 'agent', 'user', 'viewer'];
const MODULES = [
  'crm', 'voiceAI', 'marketing', 'campaigns', 'analytics',
  'helpdesk', 'surveys', 'billing', 'tenants', 'whiteLabel',
  'userManagement', 'settings', 'appointments', 'automation', 'inbox', 'webhooks',
];
const ACTIONS = ['create', 'read', 'update', 'delete'];

const MODULE_LABELS = {
  crm: 'CRM',
  voiceAI: 'Voice AI',
  marketing: 'Marketing',
  campaigns: 'Campaigns',
  analytics: 'Analytics',
  helpdesk: 'Help Desk',
  surveys: 'Surveys',
  billing: 'Billing',
  tenants: 'Tenants',
  whiteLabel: 'White Label',
  userManagement: 'User Mgmt',
  settings: 'Settings',
  appointments: 'Appointments',
  automation: 'Automation',
  inbox: 'Inbox',
  webhooks: 'Webhooks',
};

export default function PermissionMatrix() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-indigo-500" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Permission Matrix</h2>
        <span className="text-xs text-slate-500 ml-2">(Read-only reference)</span>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2 text-left font-medium text-slate-500 sticky left-0 bg-slate-50 dark:bg-slate-800/50 z-10">Module</th>
              {ROLES.map(role => (
                <th key={role} colSpan={4} className="px-2 py-2 text-center font-medium text-slate-700 dark:text-slate-300 capitalize border-l border-slate-200 dark:border-slate-700">
                  {role}
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-700/50">
              <th className="sticky left-0 bg-slate-50 dark:bg-slate-800/50 z-10"></th>
              {ROLES.map(role => (
                <React.Fragment key={role}>
                  {ACTIONS.map(action => (
                    <th key={`${role}-${action}`} className="px-1 py-1 text-center font-normal text-slate-400 uppercase border-l border-slate-100 dark:border-slate-700/50 first:border-l-slate-200 dark:first:border-l-slate-700">
                      {action[0]}
                    </th>
                  ))}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
            {MODULES.map(module => (
              <tr key={module} className="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10 whitespace-nowrap">
                  {MODULE_LABELS[module] || module}
                </td>
                {ROLES.map(role => (
                  <React.Fragment key={`${module}-${role}`}>
                    {ACTIONS.map(action => {
                      const perms = PERMISSION_MATRIX[role]?.[module];
                      const hasIt = perms && perms.has(action);
                      return (
                        <td key={`${module}-${role}-${action}`} className="px-1 py-2 text-center border-l border-slate-50 dark:border-slate-700/30 first:border-l-slate-200 dark:first:border-l-slate-700">
                          {hasIt ? (
                            <Check className="w-3 h-3 text-green-500 mx-auto" />
                          ) : (
                            <span className="text-slate-200 dark:text-slate-700">-</span>
                          )}
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>C = Create</span>
        <span>R = Read</span>
        <span>U = Update</span>
        <span>D = Delete</span>
      </div>
    </div>
  );
}
