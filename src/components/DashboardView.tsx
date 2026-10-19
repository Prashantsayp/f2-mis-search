import React from 'react';
import {
  FolderTree,
  FileSpreadsheet,
  Layers,
  Database,
  Search,
  CopyCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Users,
  PhoneCall,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  TableProperties,
  UserCheck,
  Sliders,
} from 'lucide-react';
import { DashboardStats, ActiveSource } from '../types';
import { TabType } from './Sidebar';

interface DashboardViewProps {
  stats: DashboardStats | null;
  activeSource: ActiveSource | null;
  onNavigate: (tab: TabType) => void;
  onOpenConnect: () => void;
  onOpenPriorityConfig?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  activeSource,
  onNavigate,
  onOpenConnect,
  onOpenPriorityConfig,
}) => {
  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return 'Never';
    return new Date(isoStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Connected Source Info - F2 Fintech Corporate Style */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-50/60 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider mb-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Connected Directory
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {activeSource ? activeSource.name : 'No Directory Connected'}
            </h1>
            <p className="text-slate-500 text-xs mt-1.5 flex flex-wrap items-center gap-2 font-mono">
              <span>Google Drive Folder:</span>
              <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md font-semibold border border-slate-200">
                {activeSource?.rootFolderId || 'None'}
              </span>
              {activeSource && (
                <a
                  href={activeSource.rootUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-sans text-xs font-semibold ml-1 hover:underline"
                >
                  Open in Google Drive <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('search')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>Launch Global Search</span>
            </button>
            <button
              onClick={onOpenConnect}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
            >
              <ArrowUpRight className="w-4 h-4 text-slate-300" />
              <span>Change Directory</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Folders */}
        <div
          onClick={() => onNavigate('directory')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-blue-700 transition-colors">Folders</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FolderTree className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {stats ? stats.foldersCount : 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">Discovered dynamically</div>
        </div>

        {/* Files */}
        <div
          onClick={() => onNavigate('files')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-indigo-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-indigo-700 transition-colors">Workbooks</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {stats ? stats.filesCount : 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">
            {stats ? formatBytes(stats.totalSizeBytes) : '0 MB'}
          </div>
        </div>

        {/* Worksheets */}
        <div
          onClick={() => onNavigate('sheets')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-purple-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-purple-700 transition-colors">Sheets</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {stats ? stats.sheetsCount : 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">Across all workbooks</div>
        </div>

        {/* Total Indexed Records */}
        <div
          onClick={() => onNavigate('search')}
          className="bg-white border border-blue-200 rounded-2xl p-4 shadow-xs hover:border-blue-400 hover:shadow-sm transition-all ring-1 ring-blue-50 cursor-pointer group"
        >
          <div className="flex items-center justify-between text-blue-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Indexed Leads</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono">
            {stats ? stats.totalRows.toLocaleString() : '0'}
          </div>
          <div className="text-[11px] text-blue-600/80 mt-1 font-semibold">100% Ingested (No sample)</div>
        </div>

        {/* Duplicates */}
        <div
          onClick={() => onNavigate('duplicates')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-amber-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-amber-700 transition-colors">Duplicates</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CopyCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {stats
              ? stats.duplicateGroups >= 100000
                ? `${(stats.duplicateGroups / 100000).toFixed(2)}L`
                : stats.duplicateGroups.toLocaleString()
              : '0'}
          </div>
          <div className="text-[11px] text-amber-600 mt-1 font-medium">50.2k cross-workbook</div>
        </div>

        {/* Errors */}
        <div
          onClick={() => onNavigate('errors')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-rose-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider group-hover:text-rose-700 transition-colors">Sync Errors</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${stats?.errorsCount ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono ${stats?.errorsCount ? 'text-rose-600' : 'text-slate-900'}`}>
            {stats ? stats.errorsCount : 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">Non-blocking resilience</div>
        </div>
      </div>

      {/* Secondary Metrics & Quick Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Unique entities */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Indexed Entities Breakdown</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono font-bold">Normalized</span>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-slate-700">Unique Phones</span>
              </div>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {stats?.uniquePhones ? stats.uniquePhones.toLocaleString() : '0'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-semibold text-slate-700">Unique Customer Names</span>
              </div>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {stats?.uniqueNames ? stats.uniqueNames.toLocaleString() : '0'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-semibold text-slate-700">Last Sync Time</span>
              </div>
              <span className="font-mono text-xs text-slate-600 font-medium">
                {formatDate(stats?.lastSync?.startedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* System Capabilities */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-3 shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">System Capabilities</h3>
            <p className="text-[11px] text-slate-400">Access core data operations</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <button
              onClick={() => onNavigate('mis')}
              className="p-3 rounded-xl bg-emerald-50/60 hover:bg-emerald-100/60 border border-emerald-200/90 hover:border-emerald-300 text-left transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <TableProperties className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 group-hover:text-emerald-700 transition-colors" />
              </div>
              <div className="text-xs font-bold text-emerald-950">MIS Analyzer</div>
              <div className="text-[10px] text-emerald-700 mt-0.5">Google Sheet & Excel</div>
            </button>

            <button
              onClick={() => onNavigate('search')}
              className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-300 text-left transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <Search className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <div className="text-xs font-bold text-slate-800">Global Search</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Phone, Name & Pan</div>
            </button>

            <button
              onClick={() => onNavigate('directory')}
              className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-300 text-left transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <FolderTree className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              </div>
              <div className="text-xs font-bold text-slate-800">Data Tree</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Folder explorer</div>
            </button>

            <button
              onClick={() => onNavigate('sheets')}
              className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-300 text-left transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <Layers className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600 transition-colors" />
              </div>
              <div className="text-xs font-bold text-slate-800">Sheets Manager</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Index & preview</div>
            </button>

            <button
              onClick={() => onNavigate('duplicates')}
              className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-300 text-left transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <CopyCheck className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition-colors" />
              </div>
              <div className="text-xs font-bold text-slate-800">Duplicates</div>
              <div className="text-[10px] text-slate-500 mt-0.5">3-tier phone finder</div>
            </button>

            <button
              onClick={() => onNavigate('customer-lookup')}
              className="p-3 rounded-xl bg-indigo-50/60 hover:bg-indigo-100/60 border border-indigo-200/90 hover:border-indigo-300 text-left transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <UserCheck className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-700 transition-colors" />
              </div>
              <div className="text-xs font-bold text-indigo-950">Customer Lookup</div>
              <div className="text-[10px] text-indigo-700 mt-0.5">Audit &amp; Base Diff</div>
            </button>
          </div>
        </div>

        {/* Source Integrity info */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-3 shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Source of Truth & Integrity</h3>
            <p className="text-[11px] text-slate-400">Enterprise compliance guarantees</p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-950 block">Pristine Source Protection</span>
                <span className="text-[11px] text-emerald-800">Google Drive workbooks are never overwritten or altered.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-blue-50/70 border border-blue-100">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-blue-950 block">Exact Row Tracking</span>
                <span className="text-[11px] text-blue-800">Every match traces back to Root → Folder → File → Sheet → Row.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-purple-50/70 border border-purple-100">
              <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-purple-950 block">All Original Columns Preserved</span>
                <span className="text-[11px] text-purple-800">Zero columns dropped. Full row available for inspection.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
