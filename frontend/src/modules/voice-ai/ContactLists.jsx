import React, { useState, useMemo, useEffect } from 'react';
import {
 Search, Upload, Plus, Download, Trash2, Merge, Edit3, MoreHorizontal,
 Users, FileSpreadsheet, Globe, Database, ChevronLeft, ChevronRight,
 ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square, MinusSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import { leadsAPI } from '../../services/api';
import DialectBadge from './components/DialectBadge';
import { usePermissions } from '../../hooks/usePermissions';

// ── Mock Data ────────────────────────────────────────────────────────────────
const mockLists = [
 {
 id: 'list-001',
 name: 'Tamil Nadu Enterprise Leads',
 icon: 'users',
 contacts: 2450,
 source: 'CSV Import',
 languageDist: { tamil: 65, hindi: 15, english: 20 },
 dialectBreakdown: { Kongu: 30, Chennai: 20, Madurai: 10, Tirunelveli: 5 },
 created: '2026-02-18',
 lastUsed: '2026-02-23',
 status: 'active',
 },
 {
 id: 'list-002',
 name: 'Chennai Metro Prospects',
 icon: 'globe',
 contacts: 1820,
 source: 'CRM Sync',
 languageDist: { tamil: 45, hindi: 25, english: 30 },
 dialectBreakdown: { Chennai: 35, Kongu: 5, Madurai: 3, Tirunelveli: 2 },
 created: '2026-02-10',
 lastUsed: '2026-02-22',
 status: 'active',
 },
 {
 id: 'list-003',
 name: 'Hindi Belt Outreach',
 icon: 'database',
 contacts: 3100,
 source: 'API Import',
 languageDist: { tamil: 5, hindi: 80, english: 15 },
 dialectBreakdown: {},
 created: '2026-02-05',
 lastUsed: '2026-02-20',
 status: 'active',
 },
 {
 id: 'list-004',
 name: 'GenZ Student Campaign',
 icon: 'users',
 contacts: 980,
 source: 'CSV Import',
 languageDist: { tamil: 30, hindi: 20, english: 50 },
 dialectBreakdown: { Chennai: 15, Kongu: 8, Madurai: 5, Tirunelveli: 2 },
 created: '2026-01-28',
 lastUsed: '2026-02-19',
 status: 'active',
 },
 {
 id: 'list-005',
 name: 'Madurai Regional Dealers',
 icon: 'globe',
 contacts: 560,
 source: 'Manual Entry',
 languageDist: { tamil: 85, hindi: 5, english: 10 },
 dialectBreakdown: { Madurai: 60, Tirunelveli: 15, Kongu: 5, Chennai: 5 },
 created: '2026-01-15',
 lastUsed: '2026-02-15',
 status: 'archived',
 },
 {
 id: 'list-006',
 name: 'Q1 Re-engagement Pool',
 icon: 'database',
 contacts: 4200,
 source: 'CRM Sync',
 languageDist: { tamil: 50, hindi: 30, english: 20 },
 dialectBreakdown: { Kongu: 20, Chennai: 15, Madurai: 10, Tirunelveli: 5 },
 created: '2026-01-02',
 lastUsed: '2026-02-10',
 status: 'archived',
 },
];

const sourceIcons = {
'CSV Import': FileSpreadsheet,
'CRM Sync': Database,
'API Import': Database,
'Manual Entry': Edit3,
};

const ITEMS_PER_PAGE = 10;

export default function ContactListsPage() {
 const [search, setSearch] = useState('');
 const [selectedIds, setSelectedIds] = useState(new Set());
 const [sortField, setSortField] = useState(null);
 const [sortDir, setSortDir] = useState('asc');
 const [currentPage, setCurrentPage] = useState(1);
 const [apiLists, setApiLists] = useState([]);

 // Load contact lists from CRM leads API
 useEffect(() => {
 let cancelled = false;
 leadsAPI.getAll({ limit: 1 })
 .then(({ data }) => {
 if (cancelled) return;
 // If backend returns lead list metadata, use it
 if (data?.lists && Array.isArray(data.lists)) {
 const mapped = data.lists.map(l => ({
 id: `api-${l.id}`,
 name: l.name || 'Imported List',
 icon: 'database',
 contacts: l.count || 0,
 source: l.source || 'CRM Sync',
 languageDist: l.language_dist || { tamil: 50, hindi: 25, english: 25 },
 dialectBreakdown: l.dialect_breakdown || {},
 created: l.created_at ? new Date(l.created_at).toISOString().split('T')[0] : '',
 lastUsed: l.updated_at ? new Date(l.updated_at).toISOString().split('T')[0] : '',
 status: 'active',
 }));
 setApiLists(mapped);
 }
 })
 .catch(() => {}); // keep mock data
 return () => { cancelled = true; };
 }, []);

 const allLists = useMemo(() => [...apiLists, ...mockLists], [apiLists]);

 // ── Filtering ──────────────────────────────────────────────────────────
 const filtered = useMemo(() => {
 let result = [...allLists];
 if (search.trim()) {
 const q = search.toLowerCase();
 result = result.filter(
 l => l.name.toLowerCase().includes(q) || l.source.toLowerCase().includes(q)
 );
 }
 if (sortField) {
 result.sort((a, b) => {
 let va = a[sortField] ?? '';
 let vb = b[sortField] ?? '';
 if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
 va = String(va).toLowerCase();
 vb = String(vb).toLowerCase();
 return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
 });
 }
 return result;
 }, [allLists, search, sortField, sortDir]);

 // ── Pagination ─────────────────────────────────────────────────────────
 const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
 const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

 // ── Selection ──────────────────────────────────────────────────────────
 const allSelected = paginated.length > 0 && paginated.every(l => selectedIds.has(l.id));
 const someSelected = paginated.some(l => selectedIds.has(l.id));

 const toggleAll = () => {
 if (allSelected) {
 setSelectedIds(new Set());
 } else {
 setSelectedIds(new Set(paginated.map(l => l.id)));
 }
 };

 const toggleOne = (id) => {
 setSelectedIds(prev => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 // ── Sort toggle ────────────────────────────────────────────────────────
 const toggleSort = (field) => {
 if (sortField === field) setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
 else { setSortField(field); setSortDir('asc'); }
 };

 const SortIcon = ({ field }) => {
 if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
 return sortDir === 'asc'
 ? <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
 : <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />;
 };

 // ── Actions ────────────────────────────────────────────────────────────
 const handleImportCSV = () => toast.success('Opening CSV import dialog...');
 const handleCreateList = () => toast.success('Opening create list dialog...');
 const handleDeleteSelected = () => {
 toast.success(`Deleting ${selectedIds.size} list(s)...`);
 setSelectedIds(new Set());
 };
 const handleExportSelected = () => toast.success(`Exporting ${selectedIds.size} list(s)...`);
 const handleMerge = () => toast.success(`Merging ${selectedIds.size} lists...`);
 const handleEdit = (list) => toast.success(`Editing"${list.name}"...`);
 const handleDownload = (list) => toast.success(`Downloading"${list.name}"...`);
 const handleDelete = (list) => toast.success(`Deleting"${list.name}"...`);

 // ── Language bar renderer ──────────────────────────────────────────────
 const LanguageBar = ({ dist }) => {
 const total = (dist.tamil || 0) + (dist.hindi || 0) + (dist.english || 0);
 if (total === 0) return <span className="text-xs text-slate-400">--</span>;
 const tamilPct = Math.round(((dist.tamil || 0) / total) * 100);
 const hindiPct = Math.round(((dist.hindi || 0) / total) * 100);
 const englishPct = 100 - tamilPct - hindiPct;

 return (
 <div className="flex flex-col gap-1.5 min-w-[160px]">
 {/* Stacked bar */}
 <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
 {tamilPct > 0 && (
 <div
 className="bg-orange-400 transition-all"
 style={{ width: `${tamilPct}%` }}
 title={`Tamil ${tamilPct}%`}
 />
 )}
 {hindiPct > 0 && (
 <div
 className="bg-rose-400 transition-all"
 style={{ width: `${hindiPct}%` }}
 title={`Hindi ${hindiPct}%`}
 />
 )}
 {englishPct > 0 && (
 <div
 className="bg-sky-400 transition-all"
 style={{ width: `${englishPct}%` }}
 title={`English ${englishPct}%`}
 />
 )}
 </div>
 {/* Labels */}
 <div className="flex items-center gap-1 flex-wrap">
 {tamilPct > 0 && <DialectBadge dialect="Kongu" confidence={null} />}
 {hindiPct > 0 && <DialectBadge dialect="Hindi" confidence={null} />}
 {englishPct > 0 && <DialectBadge dialect="English" confidence={null} />}
 </div>
 </div>
 );
 };

 // ── Icon resolver ──────────────────────────────────────────────────────
 const { can } = usePermissions();
 const canCreate = can('voiceAI','create');
 const canUpdate = can('voiceAI','update');
 const canDelete = can('voiceAI','delete');

 const listIconMap = { users: Users, globe: Globe, database: Database };

 return (
 <div className="flex flex-col h-full">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-white">
 <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
 <Users className="w-5 h-5 text-indigo-500" />
 Contact Lists
 </h1>
 <div className="flex items-center gap-2">
 {canCreate && (
 <button
 onClick={handleImportCSV}
 className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
 >
 <Upload className="w-4 h-4" />
 Import CSV
 </button>
 )}
 {canCreate && (
 <button
 onClick={handleCreateList}
 className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
 >
 <Plus className="w-4 h-4" />
 Create List
 </button>
 )}
 </div>
 </div>

 {/* Bulk select banner */}
 {selectedIds.size > 0 && (
 <div className="flex items-center justify-between px-6 py-2.5 bg-indigo-50 border-b border-indigo-100">
 <span className="text-sm font-medium text-indigo-700">
 {selectedIds.size} selected
 </span>
 <div className="flex items-center gap-2">
 {canDelete && (
 <button
 onClick={handleDeleteSelected}
 className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
 >
 <Trash2 className="w-3.5 h-3.5" />
 Delete Selected
 </button>
 )}
 <button
 onClick={handleExportSelected}
 className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors"
 >
 <Download className="w-3.5 h-3.5" />
 Export Selected
 </button>
 {canUpdate && (
 <button
 onClick={handleMerge}
 className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors"
 >
 <Merge className="w-3.5 h-3.5" />
 Merge Lists
 </button>
 )}
 </div>
 </div>
 )}

 {/* Search */}
 <div className="px-6 py-3 border-b border-slate-100">
 <div className="relative max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search by name or source..."
 value={search}
 onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
 className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
 />
 </div>
 </div>

 {/* Table */}
 <div className="flex-1 overflow-auto px-6 py-4">
 <div className="overflow-x-auto rounded-xl border border-slate-200">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-slate-50 text-left">
 {/* Checkbox header */}
 <th className="px-4 py-3 w-10">
 <button onClick={toggleAll} className="text-slate-400 hover:text-indigo-600">
 {allSelected
 ? <CheckSquare className="w-4.5 h-4.5" />
 : someSelected
 ? <MinusSquare className="w-4.5 h-4.5" />
 : <Square className="w-4.5 h-4.5" />
 }
 </button>
 </th>
 {[
 { label: 'List Name', field: 'name' },
 { label: 'Contacts', field: 'contacts' },
 { label: 'Source', field: 'source' },
 { label: 'Language Distribution', field: null },
 { label: 'Created', field: 'created' },
 { label: 'Last Used', field: 'lastUsed' },
 { label: 'Status', field: 'status' },
 { label: 'Actions', field: null },
 ].map(col => (
 <th
 key={col.label}
 className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap ${col.field ? 'cursor-pointer select-none hover:text-indigo-600' : ''}`}
 onClick={() => col.field && toggleSort(col.field)}
 >
 <span className="inline-flex items-center gap-1">
 {col.label}
 {col.field && <SortIcon field={col.field} />}
 </span>
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {paginated.map(list => {
 const ListIcon = listIconMap[list.icon] || Users;
 const SourceIcon = sourceIcons[list.source] || Database;
 const isSelected = selectedIds.has(list.id);

 return (
 <tr
 key={list.id}
 className={`transition-colors ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}
 >
 {/* Checkbox */}
 <td className="px-4 py-3">
 <button onClick={() => toggleOne(list.id)} className="text-slate-400 hover:text-indigo-600">
 {isSelected
 ? <CheckSquare className="w-4.5 h-4.5 text-indigo-600" />
 : <Square className="w-4.5 h-4.5" />
 }
 </button>
 </td>

 {/* List Name */}
 <td className="px-4 py-3">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
 <ListIcon className="w-4 h-4 text-indigo-600" />
 </div>
 <span className="font-medium text-slate-900 truncate max-w-[200px]">{list.name}</span>
 </div>
 </td>

 {/* Contacts */}
 <td className="px-4 py-3">
 <span className="font-semibold text-slate-700">{list.contacts.toLocaleString()}</span>
 </td>

 {/* Source */}
 <td className="px-4 py-3">
 <span className="inline-flex items-center gap-1.5 text-slate-600">
 <SourceIcon className="w-3.5 h-3.5" />
 {list.source}
 </span>
 </td>

 {/* Language Distribution */}
 <td className="px-4 py-3">
 <LanguageBar dist={list.languageDist} />
 </td>

 {/* Created */}
 <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{list.created}</td>

 {/* Last Used */}
 <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{list.lastUsed}</td>

 {/* Status */}
 <td className="px-4 py-3">
 {list.status === 'active' ? (
 <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
 Active
 </span>
 ) : (
 <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
 Archived
 </span>
 )}
 </td>

 {/* Actions */}
 <td className="px-4 py-3">
 <div className="flex items-center gap-1">
 {canUpdate && (
 <button
 onClick={() => handleEdit(list)}
 className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
 title="Edit"
 >
 <Edit3 className="w-4 h-4" />
 </button>
 )}
 <button
 onClick={() => handleDownload(list)}
 className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
 title="Download"
 >
 <Download className="w-4 h-4" />
 </button>
 {canDelete && (
 <button
 onClick={() => handleDelete(list)}
 className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
 title="Delete"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 )}
 </div>
 </td>
 </tr>
 );
 })}

 {paginated.length === 0 && (
 <tr>
 <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">
 No contact lists found matching your search.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>

 {/* Pagination */}
 <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white">
 <p className="text-sm text-slate-500">
 Showing <span className="font-medium text-slate-700">
 {filtered.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}
 </span>
 -
 <span className="font-medium text-slate-700">
 {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
 </span>{''}
 of <span className="font-medium text-slate-700">{filtered.length}</span>
 </p>
 <div className="flex items-center gap-1">
 <button
 disabled={currentPage === 1}
 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
 className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
 >
 <ChevronLeft className="w-4 h-4" />
 </button>
 {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
 <button
 key={page}
 onClick={() => setCurrentPage(page)}
 className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
 currentPage === page
 ? 'bg-indigo-600 text-white'
 : 'text-slate-600 hover:bg-slate-50'
 }`}
 >
 {page}
 </button>
 ))}
 <button
 disabled={currentPage === totalPages}
 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
 className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
 >
 <ChevronRight className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>
 );
}
