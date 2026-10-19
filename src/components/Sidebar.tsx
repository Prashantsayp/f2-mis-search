import React from 'react';
import {
  LayoutDashboard,
  FolderTree,
  FileSpreadsheet,
  Layers,
  Search,
  Crosshair,
  CopyCheck,
  History,
  AlertTriangle,
  Settings,
  Database,
  Sliders,
  Sparkles,
  TableProperties,
  UserCheck,
  BookOpen,
} from 'lucide-react';
import { F2FintechLogo } from './F2FintechLogo';

export type TabType =
  | 'dashboard'
  | 'directory'
  | 'files'
  | 'sheets'
  | 'search'
  | 'mis-search-book'
  | 'batch-search'
  | 'mis'
  | 'source-finder'
  | 'duplicates'
  | 'customer-lookup'
  | 'google-sheets-sync'
  | 'f2-tickets'
  | 'history'
  | 'errors'
  | 'settings';

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenPriorityConfig?: () => void;
  stats: {
    totalRows: number;
    filesCount: number;
    sheetsCount: number;
    duplicateGroups: number;
    errorsCount: number;
  } | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenPriorityConfig,
  stats,
}) => {
  const navSections: {
    title: string;
    items: {
      id: TabType;
      label: string;
      icon: React.ElementType;
      badge?: string | number;
      badgeColor?: string;
    }[];
  }[] = [
    {
      title: 'Data & Directory',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'directory', label: 'Data Directory', icon: FolderTree },
        { id: 'files', label: 'Files & Workbooks', icon: FileSpreadsheet, badge: stats?.filesCount },
        { id: 'sheets', label: 'Sheets Manager', icon: Layers, badge: stats?.sheetsCount },
      ],
    },
    {
      title: 'Search & Matching',
      items: [
        {
          id: 'mis',
          label: 'MIS',
          icon: TableProperties,
          badge: 'Google & Excel',
          badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        },
        {
          id: 'search',
          label: 'Global Search',
          icon: Search,
          badge: stats?.totalRows ? `${Math.round(stats.totalRows / 1000)}k` : undefined,
          badgeColor: 'bg-blue-50 text-blue-700 border border-blue-200',
        },
        {
          id: 'mis-search-book',
          label: 'MIS Search Book',
          icon: BookOpen,
          badge: 'New',
          badgeColor: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        },
        {
          id: 'batch-search',
          label: 'Batch Excel Matcher',
          icon: FileSpreadsheet,
          badge: 'New',
          badgeColor: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        },
        { id: 'source-finder', label: 'Source Finder', icon: Crosshair },
      ],
    },
    {
      title: 'Customer Operations',
      items: [
        {
          id: 'f2-tickets',
          label: 'F2 Live Tickets API',
          icon: Database,
          badge: 'In-Memory',
          badgeColor: 'bg-sky-50 text-sky-700 border border-sky-200',
        },
        {
          id: 'customer-lookup',
          label: 'Customer Lookup & Diff',
          icon: UserCheck,
          badge: 'Verified',
          badgeColor: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        },
        {
          id: 'google-sheets-sync',
          label: 'Google Sheets MIS',
          icon: Layers,
          badge: 'Live Sync',
          badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        },
      ],
    },
    {
      title: 'Lead Intelligence',
      items: [
        {
          id: 'duplicates',
          label: 'Duplicate Finder',
          icon: CopyCheck,
          badge: stats?.duplicateGroups
            ? stats.duplicateGroups >= 100000
              ? `${(stats.duplicateGroups / 100000).toFixed(2)}L`
              : `${Math.round(stats.duplicateGroups / 1000)}k`
            : undefined,
          badgeColor: 'bg-amber-50 text-amber-700 border border-amber-200',
        },
      ],
    },
    {
      title: 'System & History',
      items: [
        { id: 'history', label: 'Sync History', icon: History },
        {
          id: 'errors',
          label: 'Errors / Logs',
          icon: AlertTriangle,
          badge: stats?.errorsCount || undefined,
          badgeColor: 'bg-rose-50 text-rose-700 border border-rose-200',
        },
        { id: 'settings', label: 'Directory Sources', icon: Settings },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/90 flex flex-col shrink-0 min-h-screen text-slate-700 shadow-xs z-20">
      {/* Top Brand Logo Section matching F2 Fintech HRMS style */}
      <div className="px-4 py-4 border-b border-slate-100 flex flex-col items-center justify-center bg-white">
        <F2FintechLogo variant="full" size="md" subtitleText="MIS & Lead Search" />
      </div>

      {/* Database Quick Status Badge */}
      <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          <span className="text-slate-600 font-medium truncate text-[11px]">
            {stats?.totalRows ? `${stats.totalRows.toLocaleString()} leads indexed` : 'Live SQLite Ready'}
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200/60">
          v2.4
        </span>
      </div>

      {/* Navigation Sections */}
      <nav className="p-3 space-y-4 flex-1 overflow-y-auto">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            <div className="px-3 pt-1 pb-1 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans">
                {section.title}
              </span>
              <div className="flex-1 h-px bg-slate-200/70"></div>
            </div>

            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-600'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : item.badgeColor || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Lead Priority Rules Access Button */}
      <div className="px-3 pb-3">
        <button
          onClick={onOpenPriorityConfig}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all shadow-sm cursor-pointer group"
          title="Change priority rank of all files in directory"
        >
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform" />
            <span>Lead Priorities</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-white/15 text-amber-300">
            #1 - #9
          </span>
        </button>
      </div>

      {/* Clean Footer info */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500 flex items-center justify-between font-mono">
        <span>F2 Fintech MIS</span>
        <span className="text-emerald-600 font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Online
        </span>
      </div>
    </aside>
  );
};
