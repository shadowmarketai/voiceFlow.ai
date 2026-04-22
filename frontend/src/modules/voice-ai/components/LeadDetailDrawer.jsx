/**
 * Lead Detail Drawer — slides out when clicking a lead row
 * Shows full lead info, FB form data, contact buttons, disposition, notes, interactions
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  X, Phone, Mail, MessageCircle, MapPin, Building2, Globe,
  Calendar, Tag, Clock, User, FileText, ChevronDown, Save,
  Loader2, ExternalLink, Send, PhoneCall, Star,
} from 'lucide-react';
import { crmLeadsAPI } from '../../../services/api';

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Contacted', color: 'bg-amber-100 text-amber-700' },
  { value: 'nurturing', label: 'Nurturing', color: 'bg-purple-100 text-purple-700' },
  { value: 'converted', label: 'Converted', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-700' },
];

const DISPOSITION_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'wrong_enquiry', label: 'Wrong Enquiry' },
  { value: 'callback', label: 'Callback Requested' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'quotation_sent', label: 'Quotation Sent' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'booked', label: 'Booked' },
  { value: 'dnc', label: 'Do Not Contact' },
];

const DISPOSITION_COLORS = {
  follow_up: 'bg-blue-100 text-blue-700',
  not_interested: 'bg-red-100 text-red-700',
  wrong_enquiry: 'bg-orange-100 text-orange-700',
  callback: 'bg-amber-100 text-amber-700',
  site_visit: 'bg-teal-100 text-teal-700',
  quotation_sent: 'bg-indigo-100 text-indigo-700',
  negotiation: 'bg-purple-100 text-purple-700',
  booked: 'bg-emerald-100 text-emerald-700',
  dnc: 'bg-gray-100 text-gray-600',
};

export default function LeadDetailDrawer({ leadId, onClose, onUpdate }) {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [interactions, setInteractions] = useState([]);
  const [editFields, setEditFields] = useState({});
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    loadLead();
    loadInteractions();
  }, [leadId]);

  const loadLead = async () => {
    setLoading(true);
    try {
      const { data } = await crmLeadsAPI.get(leadId);
      setLead(data);
      setEditFields({
        status: data.status,
        disposition: data.disposition || '',
        notes: data.notes || '',
        assigned_to: data.assigned_to || '',
        next_followup_at: data.next_followup_at ? data.next_followup_at.slice(0, 16) : '',
      });
    } catch (err) {
      toast.error('Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const loadInteractions = async () => {
    try {
      const { data } = await crmLeadsAPI.getInteractions(leadId);
      setInteractions(data || []);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = { ...editFields };
      if (updates.next_followup_at) {
        updates.next_followup_at = new Date(updates.next_followup_at).toISOString();
      } else {
        updates.next_followup_at = null;
      }
      await crmLeadsAPI.update(leadId, updates);
      toast.success('Lead updated');
      onUpdate?.();
      loadLead();
    } catch (err) {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await crmLeadsAPI.addInteraction({
        lead_id: leadId,
        channel: 'note',
        direction: 'outbound',
        content: noteText,
      });
      setNoteText('');
      loadInteractions();
      toast.success('Note added');
    } catch {
      toast.error('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  if (!leadId) return null;

  const fbFields = lead?.custom_fields ? Object.entries(lead.custom_fields).filter(([k]) => k.startsWith('fb_')) : [];
  const formFields = lead?.custom_fields ? Object.entries(lead.custom_fields).filter(([k]) => !k.startsWith('fb_')) : [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-50 flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : lead ? (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 z-10">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{lead.name || 'Unknown'}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Lead ID: {lead.id.slice(0, 8)} &middot; {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                {/* Contact Buttons */}
                <div className="flex gap-2 mt-3">
                  {lead.phone && (
                    <>
                      <a href={`tel:${lead.phone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                        <PhoneCall className="w-3.5 h-3.5" /> Call
                      </a>
                      <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors">
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    </>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-100 transition-colors">
                      <Mail className="w-3.5 h-3.5" /> Email
                    </a>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 px-6 py-4 space-y-5">

                {/* Contact Info */}
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Contact Info</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Phone</p>
                        <p className="text-slate-700 font-medium">{lead.phone || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Email</p>
                        <p className="text-slate-700 font-medium break-all">{lead.email || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Business</p>
                        <p className="text-slate-700 font-medium">{lead.business_name || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Location</p>
                        <p className="text-slate-700 font-medium">
                          {[lead.location_city, lead.location_state, lead.location_country].filter(Boolean).join(', ') || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Status & Disposition */}
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Status & Disposition</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Status</label>
                      <select value={editFields.status} onChange={e => setEditFields(f => ({ ...f, status: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Disposition</label>
                      <select value={editFields.disposition} onChange={e => setEditFields(f => ({ ...f, disposition: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white">
                        {DISPOSITION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Assigned To</label>
                      <input type="text" value={editFields.assigned_to}
                        onChange={e => setEditFields(f => ({ ...f, assigned_to: e.target.value }))}
                        placeholder="Agent name"
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Next Follow-up</label>
                      <input type="datetime-local" value={editFields.next_followup_at}
                        onChange={e => setEditFields(f => ({ ...f, next_followup_at: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs text-slate-400 mb-1">Notes</label>
                    <textarea value={editFields.notes}
                      onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))}
                      rows={2} placeholder="Add notes about this lead..."
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white resize-none" />
                  </div>
                  <button onClick={handleSave} disabled={saving}
                    className="mt-2 flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </section>

                {/* Source & Campaign */}
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Source Attribution</h3>
                  <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Source</span>
                      <span className="font-medium text-slate-700 capitalize">{lead.source}</span>
                    </div>
                    {lead.source_campaign && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Campaign</span>
                        <span className="font-medium text-slate-700">{lead.source_campaign}</span>
                      </div>
                    )}
                    {lead.source_medium && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Medium</span>
                        <span className="font-medium text-slate-700">{lead.source_medium}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Score</span>
                      <span className="font-medium text-slate-700">{lead.lead_score}/100</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Qualification</span>
                      <span className="font-medium text-slate-700 capitalize">{lead.qualification}</span>
                    </div>
                  </div>
                </section>

                {/* Facebook Details */}
                {fbFields.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Facebook Lead Details</h3>
                    <div className="bg-blue-50/50 rounded-xl p-3 space-y-1.5 text-sm">
                      {fbFields.map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-slate-400">{key.replace('fb_', '').replace(/_/g, ' ')}</span>
                          <span className="font-medium text-slate-700 text-right max-w-[60%] break-all">{value}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Custom Form Fields */}
                {formFields.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Form Responses</h3>
                    <div className="bg-amber-50/50 rounded-xl p-3 space-y-1.5 text-sm">
                      {formFields.map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-slate-400">{key.replace(/_/g, ' ')}</span>
                          <span className="font-medium text-slate-700 text-right max-w-[60%] break-all">{value}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Tags */}
                {lead.tags?.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.tags.map(t => (
                        <span key={t} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-xs font-medium">{t}</span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Add Note / Interaction */}
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Add Note</h3>
                  <div className="flex gap-2">
                    <input type="text" value={noteText} onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                      placeholder="Type a note..."
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
                    <button onClick={handleAddNote} disabled={addingNote || !noteText.trim()}
                      className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900 disabled:opacity-50">
                      {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </section>

                {/* Interaction History */}
                {interactions.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Activity ({interactions.length})</h3>
                    <div className="space-y-2">
                      {interactions.slice(0, 20).map(i => (
                        <div key={i.id} className="flex gap-2 p-2 bg-slate-50 rounded-lg">
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                            {i.channel === 'note' ? <FileText className="w-3 h-3 text-slate-500" /> :
                             i.channel === 'call' ? <Phone className="w-3 h-3 text-slate-500" /> :
                             i.channel === 'whatsapp' ? <MessageCircle className="w-3 h-3 text-slate-500" /> :
                             <Globe className="w-3 h-3 text-slate-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-600 capitalize">{i.channel}</span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(i.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {i.content && <p className="text-xs text-slate-600 mt-0.5">{i.content}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Lead not found
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
