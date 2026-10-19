import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  Search,
  X,
  FileSpreadsheet,
  Maximize2,
  Folder,
  Layers,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  GitCompare,
  FileText,
  Files,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Info,
  Download,
  Loader2,
  Eye,
  UserCheck,
} from 'lucide-react';
import { DuplicateGroupItem, DuplicateFullStats } from '../types';

interface DuplicatesViewProps {
  onViewRecord: (id: number) => void;
  onPreviewSheet: (fileId: string, sheetName: string) => void;
  onLookupCustomer?: (phone: string) => void;
}

export type DuplicateSection = 'cross' | 'within' | 'both';
export type CountFilter = 'all' | '2' | '3' | '4' | '5' | 'gt5';

export const DuplicatesView: React.FC<DuplicatesViewProps> = ({
  onViewRecord,
  onPreviewSheet,
  onLookupCustomer,
}) => {
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [activeSection, setActiveSection] = useState<DuplicateSection>('cross');
  const [countFilter, setCountFilter] = useState<CountFilter>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(60);
  const [totalGroups, setTotalGroups] = useState<number>(50218);
  const [totalPages, setTotalPages] = useState<number>(837);
  const [groups, setGroups] = useState<DuplicateGroupItem[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroupItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Export State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFilter, setExportFilter] = useState<CountFilter>('all');
  const [exportLimit, setExportLimit] = useState<number>(5000);

  const [stats, setStats] = useState<DuplicateFullStats>({
    both: { total: 228269, c2: 170359, c3: 45594, c4: 9692, c5: 2181, gt5: 443 },
    cross: { total: 50218, c2: 33441, c3: 10677, c4: 4306, c5: 1431, gt5: 363 },
    within: { total: 178051, c2: 136918, c3: 34917, c4: 5386, c5: 750, gt5: 80 },
  });

  const [singleRecord, setSingleRecord] = useState<{
    id: number;
    customerName: string;
    phone: string;
    fileName: string;
    sheetName: string;
    rowNum: number;
    folderPath: string;
  } | null>(null);

  const fetchDuplicates = async (
    search: string,
    section: DuplicateSection,
    filter: CountFilter,
    pageNum: number,
    limitNum: number
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      params.append('section', section);
      params.append('countFilter', filter);
      params.append('page', pageNum.toString());
      params.append('limit', limitNum.toString());

      const res = await fetch(`/api/duplicates?${params.toString()}`);
      if (!res.ok) {
        setGroups([]);
        return;
      }
      const data = await res.json();
      const loadedGroups = data.duplicateGroups || [];
      setGroups(loadedGroups);
      setSelectedGroup(loadedGroups[0] || null);

      if (data.totalGroups !== undefined) {
        setTotalGroups(data.totalGroups);
      }
      if (data.totalPages !== undefined) {
        setTotalPages(data.totalPages);
      }

      if (data.stats) {
        setStats(data.stats);
      }

      if (data.exactSingleOccurrence && data.singleOccurrenceRecord) {
        setSingleRecord(data.singleOccurrenceRecord);
      } else {
        setSingleRecord(null);
      }
    } catch (err) {
      console.error('Failed to fetch duplicates:', err);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  // Reset page when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [activeSearch, activeSection, countFilter]);

  // Fetch when page, pageSize, search, section, or filter changes
  useEffect(() => {
    fetchDuplicates(activeSearch, activeSection, countFilter, page, pageSize);
  }, [activeSearch, activeSection, countFilter, page, pageSize]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery.trim());
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearch('');
  };

  const handleOpenExport = () => {
    setExportFilter(countFilter);
    setIsExportModalOpen(true);
  };

  const handleDownloadExcel = async (filterToUse: CountFilter, limitPerSheet: number) => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('countFilter', filterToUse);
      params.append('limit', limitPerSheet.toString());
      if (activeSearch.trim()) params.append('search', activeSearch.trim());

      const url = `/api/export-duplicates?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const dateStr = new Date().toISOString().slice(0, 10);
      const tag = filterToUse === 'all' ? 'All_Duplicates' : `Repetitions_${filterToUse}`;
      a.download = `F2_Duplicates_Cross_and_Within_${tag}_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setIsExportModalOpen(false);
    } catch (err) {
      console.error('Failed to export duplicates Excel:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const currentSectionStats = stats[activeSection];

  const getFilterCount = (f: CountFilter) => {
    if (!currentSectionStats) return 0;
    switch (f) {
      case 'all':
        return currentSectionStats.total;
      case '2':
        return currentSectionStats.c2;
      case '3':
        return currentSectionStats.c3;
      case '4':
        return currentSectionStats.c4;
      case '5':
        return currentSectionStats.c5;
      case 'gt5':
        return currentSectionStats.gt5;
    }
  };

  const effectiveTotal = activeSearch ? totalGroups : getFilterCount(countFilter);
  const fromRecord = groups.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const toRecord = groups.length > 0 ? (page - 1) * pageSize + groups.length : 0;

  return (
    <div className="space-y-6">
      {/* 3 Main Sections Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-blue-600" />
              <span>Phone Number Duplicate Finder</span>
            </h2>
            <p className="text-xs text-slate-500">
              Select a duplicate category below to view cross-file repetitions or internal file duplicates.
            </p>
          </div>

          {/* Download Duplicates Excel Button */}
          <button
            type="button"
            onClick={handleOpenExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
            title="Download Excel file with 2 sheets: Cross-File & Within-File duplicates"
          >
            <Download className="w-4 h-4" />
            <span>Download Duplicates Excel (2 Sheets)</span>
          </button>
        </div>

        {/* 3 Distinct Section Tabs with Total Duplicates on Each */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Section 1: Cross Files */}
          <button
            type="button"
            onClick={() => setActiveSection('cross')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden shadow-xs ${
              activeSection === 'cross'
                ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20'
                : 'bg-white hover:bg-slate-50/80 border-slate-200/90 text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    activeSection === 'cross'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <GitCompare className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold tracking-wide uppercase text-slate-900">
                  Cross-File Duplicates
                </span>
              </div>
              <span
                className={`px-3 py-1 rounded-full font-mono text-xs font-bold ${
                  activeSection === 'cross'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                {stats.cross.total.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 font-medium">
              Repeats in <strong>2 or more different files</strong> across the directory.
            </p>
          </button>

          {/* Section 2: Within Files */}
          <button
            type="button"
            onClick={() => setActiveSection('within')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden shadow-xs ${
              activeSection === 'within'
                ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/20'
                : 'bg-white hover:bg-slate-50/80 border-slate-200/90 text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    activeSection === 'within'
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold tracking-wide uppercase text-slate-900">
                  Within-File Duplicates
                </span>
              </div>
              <span
                className={`px-3 py-1 rounded-full font-mono text-xs font-bold ${
                  activeSection === 'within'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                }`}
              >
                {stats.within.total.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 font-medium">
              Repeats strictly within the <strong>same single file</strong> (e.g. NEET rounds).
            </p>
          </button>

          {/* Section 3: Both (All Duplicates) */}
          <button
            type="button"
            onClick={() => setActiveSection('both')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden shadow-xs ${
              activeSection === 'both'
                ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20'
                : 'bg-white hover:bg-slate-50/80 border-slate-200/90 text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    activeSection === 'both'
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Files className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold tracking-wide uppercase text-slate-900">
                  Both (All Duplicates)
                </span>
              </div>
              <span
                className={`px-3 py-1 rounded-full font-mono text-xs font-bold ${
                  activeSection === 'both'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {stats.both.total.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 font-medium">
              Entire dataset: all phone numbers repeating 2+ times anywhere.
            </p>
          </button>
        </div>
      </div>

      {/* Filter Row: Frequency Buttons (2, 3, 4, 5, more than 5) & Search Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        {/* Frequency Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
            <span>Occurrence Filter:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all' as CountFilter, label: 'All', count: getFilterCount('all') },
              { id: '2' as CountFilter, label: '2', count: getFilterCount('2') },
              { id: '3' as CountFilter, label: '3', count: getFilterCount('3') },
              { id: '4' as CountFilter, label: '4', count: getFilterCount('4') },
              { id: '5' as CountFilter, label: '5', count: getFilterCount('5') },
              { id: 'gt5' as CountFilter, label: 'More than 5', count: getFilterCount('gt5') },
            ].map((btn) => {
              const isSelected = countFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  onClick={() => setCountFilter(btn.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80'
                  }`}
                >
                  <span>{btn.label}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {btn.count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in this duplicate section by phone (e.g. 9167910828, 9167...) or customer name..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-9 py-2.5 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm shadow-blue-500/20 cursor-pointer shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search Duplicates</span>
            </button>

            {activeSearch && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0 border border-slate-200"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </form>

        {/* Active Search & Filter Indicators */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <span className="text-slate-400">Current Scope:</span>
            <span className="font-bold text-blue-700 uppercase tracking-wider text-[11px] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
              {activeSection === 'cross'
                ? 'Cross-File Duplicates'
                : activeSection === 'within'
                ? 'Within-File Duplicates'
                : 'Both (All Duplicates)'}
            </span>

            <span className="text-slate-400">• Filter:</span>
            <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
              {countFilter === 'all'
                ? 'All Occurrences'
                : countFilter === 'gt5'
                ? 'More than 5 Times'
                : `${countFilter} Times`}
            </span>

            <span className="text-slate-500 font-mono text-[11px]">
              (Total in category: <strong className="text-slate-900 font-bold">{getFilterCount(countFilter).toLocaleString()}</strong>)
            </span>
          </div>

          {activeSearch && (
            <div className="flex items-center gap-2">
              <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold">
                Matching "{activeSearch}"
              </span>
              <button
                onClick={handleClearSearch}
                className="text-[11px] text-blue-600 hover:underline cursor-pointer font-semibold"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Unique Record Notice (When a searched 10-digit number has NO duplicates) */}
      {singleRecord && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-emerald-950 flex items-center gap-2">
                <span>Unique Phone Number (0 Duplicates)</span>
                <span className="font-mono bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                  {singleRecord.phone}
                </span>
              </div>
              <p className="text-emerald-800 text-xs mt-0.5">
                This number appears only <strong>1 time</strong> in your dataset ({singleRecord.fileName} &gt; {singleRecord.sheetName}, Row {singleRecord.rowNum}). It is unique with no duplicate records.
              </p>
            </div>
          </div>
          <button
            onClick={() => onViewRecord(singleRecord.id)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>View Record</span>
          </button>
        </div>
      )}

      {/* Main Split View: Left List / Right Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Duplicate Groups List */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            {/* List Header with Clear Scope & Range Indicator */}
            <div className="flex flex-col gap-1 border-b border-slate-100 pb-2.5 px-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-900 font-bold text-xs uppercase tracking-wider">
                  <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {activeSection === 'cross'
                      ? 'Cross-File Numbers'
                      : activeSection === 'within'
                      ? 'Within-File Numbers'
                      : 'All Duplicate Numbers'}
                  </span>
                </span>
                <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                  Page {page} of {totalPages.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  Showing <strong>{fromRecord.toLocaleString()} – {toRecord.toLocaleString()}</strong> of{' '}
                  <strong className="text-slate-900 font-bold">{effectiveTotal.toLocaleString()}</strong> duplicate phone numbers
                </span>
                <span className="text-[10px] text-slate-400 font-medium">click to inspect</span>
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-xs text-slate-400 font-mono flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-slate-600 font-medium">Loading duplicate records...</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500 space-y-2">
                <AlertCircle className="w-6 h-6 mx-auto text-slate-300" />
                <p>No duplicate numbers found {activeSearch ? `matching "${activeSearch}"` : ''} in this selection.</p>
                {activeSearch && (
                  <button
                    onClick={handleClearSearch}
                    className="text-blue-600 hover:underline text-xs font-bold"
                  >
                    Show all in this section
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                {groups.map((grp) => {
                  const isSelected = selectedGroup?.key === grp.key;
                  const distinctFiles = Array.from(new Set(grp.records.map((r) => r.fileName)));
                  const firstName = grp.records.find((r) => r.customerName)?.customerName || 'No Name Provided';
                  const fileCount = grp.distinctFilesCount || distinctFiles.length;

                  return (
                    <div
                      key={grp.key}
                      onClick={() => setSelectedGroup(grp)}
                      className={`p-3.5 rounded-xl cursor-pointer transition-all border flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-blue-50/80 border-blue-400 text-blue-950 shadow-xs ring-1 ring-blue-400'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-700'
                      }`}
                    >
                      <div className="truncate min-w-0">
                        <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-900">
                          <span>{grp.key}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(grp.key);
                            }}
                            className="text-slate-400 hover:text-blue-600 transition-colors p-0.5 rounded cursor-pointer"
                            title="Copy phone number"
                          >
                            {copiedKey === grp.key ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          {fileCount > 1 ? (
                            <span className="text-[10px] font-sans px-1.5 py-0.2 bg-blue-100 text-blue-800 border border-blue-200 rounded font-bold">
                              {fileCount} files
                            </span>
                          ) : (
                            <span className="text-[10px] font-sans px-1.5 py-0.2 bg-slate-100 text-slate-600 border border-slate-200 rounded font-medium">
                              Same file
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 truncate font-medium">
                          {firstName}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 truncate font-sans">
                          <FileSpreadsheet className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span className="truncate">
                            {distinctFiles.length > 1
                              ? `${distinctFiles.slice(0, 2).join(', ')}${distinctFiles.length > 2 ? '...' : ''}`
                              : distinctFiles[0]}
                          </span>
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 shadow-2xs">
                        {grp.count} records
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {effectiveTotal > 0 && (
            <div className="pt-3 mt-3 border-t border-slate-100 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="text-slate-500 text-[11px]">Show:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value={30}>30 per page</option>
                    <option value={60}>60 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={200}>200 per page</option>
                  </select>
                </div>

                <span className="text-[11px] font-mono text-slate-500">
                  {fromRecord.toLocaleString()}–{toRecord.toLocaleString()} of {effectiveTotal.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={page <= 1 || loading}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 text-xs font-semibold cursor-pointer transition-colors"
                  title="First Page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <div className="flex items-center gap-1 text-xs font-mono font-bold text-slate-800">
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg">
                    {page}
                  </span>
                  <span className="text-slate-400">/</span>
                  <span className="text-slate-600">
                    {totalPages.toLocaleString()}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages || loading}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 text-xs font-semibold cursor-pointer transition-colors"
                  title="Last Page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>

              {/* Informative performance notice */}
              <div className="p-2 rounded-lg bg-blue-50/60 border border-blue-100 text-[10px] text-blue-900 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  All <strong>{effectiveTotal.toLocaleString()}</strong> duplicate phone numbers are indexed. Displaying in fast batches of {pageSize} ensures instant rendering without freezing.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Records in Selected Group */}
        <div className="lg:col-span-7 space-y-4">
          {selectedGroup ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                      PHONE DUPLICATE GROUP
                    </span>
                    <span className="text-xs text-slate-500 font-mono font-medium">
                      {selectedGroup.count} total occurrences
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 mt-1.5">
                    <h3 className="text-xl font-black text-slate-900 font-mono tracking-wide">
                      {selectedGroup.key}
                    </h3>
                    <button
                      onClick={() => copyToClipboard(selectedGroup.key)}
                      className="text-xs font-mono text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer border border-slate-200"
                    >
                      {copiedKey === selectedGroup.key ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    {onLookupCustomer && (
                      <button
                        onClick={() => onLookupCustomer(selectedGroup.key)}
                        className="text-xs font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-200"
                        title="Compare all duplicate occurrences with Base Record Diff"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Compare in Customer Lookup &amp; Diff</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    Found across {Array.from(new Set(selectedGroup.records.map((r) => r.fileName))).length} workbook(s) and {Array.from(new Set(selectedGroup.records.map((r) => `${r.fileName}::${r.sheetName}`))).length} sheet(s):
                  </p>
                </div>
              </div>

              {/* Occurrences List */}
              <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
                {selectedGroup.records.map((rec, rIdx) => (
                  <div
                    key={rIdx}
                    className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/40 border border-slate-200/80 hover:border-blue-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">
                          {rec.customerName || 'Name not provided'}
                        </span>
                        <span className="font-mono text-xs text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded border border-blue-200 font-semibold">
                          {rec.phone || selectedGroup.key}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-slate-600 flex flex-wrap items-center gap-1.5">
                        <span className="flex items-center gap-1 text-emerald-700 font-medium">
                          <Folder className="w-3 h-3 text-emerald-600" />
                          {rec.folderPath}
                        </span>
                        <span className="text-slate-300">/</span>
                        <span className="flex items-center gap-1 text-blue-700 font-bold">
                          <FileSpreadsheet className="w-3 h-3 text-blue-600" />
                          {rec.fileName}
                        </span>
                        <span className="text-slate-300">/</span>
                        <span className="text-purple-700 font-medium">
                          {rec.sheetName}
                        </span>
                        <span className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          Row {rec.rowNum}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onPreviewSheet(rec.fileName, rec.sheetName)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-all cursor-pointer"
                        title="Preview worksheet"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>Sheet</span>
                      </button>
                      <button
                        onClick={() => onViewRecord(rec.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>View Full Row</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2 shadow-xs">
              <Layers className="w-8 h-8 text-slate-300" />
              <p className="text-slate-500 font-medium">Select a duplicate phone number on the left to inspect its individual occurrences.</p>
            </div>
          )}
        </div>
      </div>

      {/* Export Duplicates Excel Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Download Duplicates Excel Workbook
                  </h3>
                  <p className="text-xs text-slate-500">
                    Generates an organized .xlsx workbook with 2 separate sheets
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Sheets Breakdown Info Box */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-2">
                <p className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>The downloaded Excel file contains 2 dedicated worksheets:</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200/60 shadow-2xs">
                    <p className="font-bold text-emerald-900 flex items-center gap-1">
                      <Files className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Sheet 1: Cross-File</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Phone numbers that appear across 2 or more different workbooks.
                    </p>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200/60 shadow-2xs">
                    <p className="font-bold text-emerald-900 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Sheet 2: Within-File</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Duplicate phone numbers that repeat inside the same workbook/sheets.
                    </p>
                  </div>
                </div>
              </div>

              {/* Formatted Columns Overview */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Columns included in each sheet:</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">Phone Number</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">Customer Name</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">Repetitions</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">Distinct Files</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">Files Present</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">Sheets Present</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">Row Numbers</span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">Locations Breakdown</span>
                </div>
              </div>

              {/* Duplicate Occurrence Filter Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Filter Occurrence Frequency:</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {(['all', '2', '3', '4', '5', 'gt5'] as CountFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setExportFilter(f)}
                      className={`px-2.5 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                        exportFilter === f
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {f === 'all' ? 'All (2+)' : f === 'gt5' ? '> 5 times' : `${f} times`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Records Limit per sheet */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Max Records Per Sheet:</label>
                  <span className="text-[11px] text-slate-400">Keeps Excel fast & easy to navigate</span>
                </div>
                <select
                  value={exportLimit}
                  onChange={(e) => setExportLimit(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value={1000}>Top 1,000 duplicate keys per sheet (Super fast)</option>
                  <option value={5000}>Top 5,000 duplicate keys per sheet (Recommended)</option>
                  <option value={10000}>Top 10,000 duplicate keys per sheet</option>
                  <option value={25000}>Top 25,000 duplicate keys per sheet</option>
                  <option value={50000}>Top 50,000 duplicate keys per sheet (Comprehensive)</option>
                </select>
              </div>

              {/* Active search filter warning if active */}
              {activeSearch && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Your active search filter (<strong>"{activeSearch}"</strong>) will be applied to the export.
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                disabled={exportLoading}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDownloadExcel(exportFilter, exportLimit)}
                disabled={exportLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {exportLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating 2-Sheet Excel...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Generate & Download Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
