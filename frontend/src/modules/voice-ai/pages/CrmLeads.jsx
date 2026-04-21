/**
 * CRM Leads Pipeline Page
 * Kanban-style view: New → Contacted → Nurturing → Converted → Lost
 * With lead cards showing score, source, last contact
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  TrendingUp, Phone, Mail, MapPin, Star, Loader2, RefreshCw,
  ArrowRight, Building2, Clock, ChevronRight, User, Filter,
} from 'lucide-react';
import { crmLeadsAPI } from '../../../services/api';

const STAGES = [
  { id: 'new',       label: 'New',       color: 'border-blue-400',    bg: 'bg-blue-50',    dot: 'bg-blue-500' },
  { id: 'contacted', label: 'Contacted', color: 'border-amber-400',   bg: 'bg-amber-50',   dot: 'bg-amber-500' },
  { id: 'nurturing', label: 'Nurturing', color: 'border-purple-400',  bg: 'bg-purple-50',  dot: 'bg-purple-500' },
  { id: 'converted', label: 'Converted', color: 'border-emerald-400', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  { id: 'lost',      label: 'Lost',      color: 'border-red-400',     bg: 'bg-red-50',     dot: 'bg-red-500' },
];

const QUAL_COLORS = {
  cold: 'bg-slate-200 text-slate-600',
  warm: 'bg-amber-200 text-amber-700',
  hot: 'bg-red-200 text-red-700',
  qualified: 'bg-emerald-200 text-emerald-700',
};

function LeadCard({ lead, onMove }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{lead.name || 'Unknown'}</p>
          {lead.business_name && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" />{lead.business_name}
            </p>
          )}
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${QUAL_COLORS[lead.qualification] || 'bg-slate-100'}`}>
          {lead.lead_score}
        </span>
      </div>

      <div className="space-y-1 text-xs text-slate-500">
        {lead.phone && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</p>}
        {lead.email && <p className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{lead.email}</p>}
        {lead.location_city && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.location_city}</p>}
      </div>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-50 rounded">{lead.source}</span>
        {lead.status !== 'converted' && lead.status !== 'lost' && (
          <div className="flex gap-1">
            {lead.status === 'new' && (
              <button onClick={() => onMove(lead.id, 'contacted')}
                className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 font-medium">
                Contacted
              </button>
            )}
            {lead.status === 'contacted' && (
              <button onClick={() => onMove(lead.id, 'nurturing')}
                className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 font-medium">
                Nurture
              </button>
            )}
            {(lead.status === 'contacted' || lead.status === 'nurturing') && (
              <button onClick={() => onMove(lead.id, 'converted')}
                className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 font-medium">
                Won
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CrmLeadsPage() {
  const [leadsByStage, setLeadsByStage] = useState({});
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pipeRes, ...stageResults] = await Promise.all([
        crmLeadsAPI.pipeline(),
        ...STAGES.map(s => crmLeadsAPI.list({ status: s.id, per_page: 50 })),
      ]);
      setPipeline(pipeRes.data);
      const byStage = {};
      STAGES.forEach((s, i) => {
        byStage[s.id] = stageResults[i].data?.leads || [];
      });
      setLeadsByStage(byStage);
    } catch {
      toast.error('Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleMove = async (leadId, newStatus) => {
    try {
      await crmLeadsAPI.update(leadId, { status: newStatus });
      toast.success(`Moved to ${newStatus}`);
      loadAll();
    } catch {
      toast.error('Failed to update');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-500" /> Leads Pipeline
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track and manage your sales pipeline
          </p>
        </div>
        <button onClick={loadAll}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Pipeline summary */}
      {pipeline && (
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-4 py-3">
          {STAGES.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className="text-sm font-semibold text-slate-700">{pipeline[s.id] || 0}</span>
                <span className="text-xs text-slate-400">{s.label}</span>
              </div>
              {i < STAGES.length - 1 && <ChevronRight className="w-4 h-4 text-slate-300" />}
            </React.Fragment>
          ))}
          <div className="ml-auto text-sm font-bold text-slate-800">
            {pipeline.total || 0} total
          </div>
        </div>
      )}

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4 min-h-[500px]">
          {STAGES.map(stage => {
            const leads = leadsByStage[stage.id] || [];
            return (
              <div key={stage.id} className={`rounded-2xl border-t-4 ${stage.color} bg-slate-50 p-3`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                    <h3 className="text-sm font-semibold text-slate-700">{stage.label}</h3>
                  </div>
                  <span className="text-xs font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full">
                    {leads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {leads.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8 italic">No leads</p>
                  ) : (
                    leads.map(lead => (
                      <LeadCard key={lead.id} lead={lead} onMove={handleMove} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
