/**
 * CRM Deals Page
 * Revenue tracking — shows converted leads with deal values
 * Filterable by source, date range
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  IndianRupee, TrendingUp, Loader2, RefreshCw, Users, Phone,
  Mail, Building2, Calendar, Star, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { crmLeadsAPI } from '../../../services/api';

export default function CrmDealsPage() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_value: 0, count: 0, avg_score: 0 });

  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await crmLeadsAPI.list({ status: 'converted', per_page: 100 });
      const leads = data.leads || [];
      setDeals(leads);

      // Calculate stats
      const totalValue = leads.reduce((sum, l) => sum + (l.deal_value || 0), 0);
      const avgScore = leads.length > 0
        ? Math.round(leads.reduce((sum, l) => sum + l.lead_score, 0) / leads.length)
        : 0;
      setStats({ total_value: totalValue, count: leads.length, avg_score: avgScore });
    } catch {
      toast.error('Failed to load deals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  const formatCurrency = (val) => {
    if (!val) return '—';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <IndianRupee className="w-6 h-6 text-emerald-500" /> Deals
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track revenue from converted leads
          </p>
        </div>
        <button onClick={loadDeals}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats.total_value)}</p>
              <p className="text-xs text-slate-400">Total Revenue</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.count}</p>
              <p className="text-xs text-slate-400">Deals Won</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Star className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.avg_score}</p>
              <p className="text-xs text-slate-400">Avg Lead Score</p>
            </div>
          </div>
        </div>
      </div>

      {/* Deals table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
            <span className="text-sm text-slate-500">Loading deals...</span>
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <IndianRupee className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">No deals yet</p>
            <p className="text-xs mt-1">Deals appear when leads are marked as converted</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Business</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Score</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Deal Value</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Converted</th>
              </tr>
            </thead>
            <tbody>
              {deals.map(deal => (
                <tr key={deal.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{deal.name || '—'}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                      {deal.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{deal.phone}</span>}
                      {deal.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{deal.email}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-600">{deal.business_name || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">{deal.source}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${deal.lead_score}%` }} />
                      </div>
                      <span className="text-xs font-medium text-slate-600">{deal.lead_score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-emerald-600">
                      {deal.deal_value ? formatCurrency(deal.deal_value) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-400">
                      {deal.converted_at ? new Date(deal.converted_at).toLocaleDateString('en-IN') : deal.updated_at ? new Date(deal.updated_at).toLocaleDateString('en-IN') : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
