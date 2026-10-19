import React, { useState } from 'react';
import {
  Crosshair,
  Search,
  Folder,
  FileSpreadsheet,
  Layers,
  Table,
  CheckCircle2,
  ExternalLink,
  Maximize2,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { SearchMatchItem } from '../types';

interface SourceFinderViewProps {
  onViewRecord: (id: number) => void;
  onPreviewSheet: (fileId: string, sheetName: string) => void;
  onLookupCustomer?: (phone: string) => void;
}

export const SourceFinderView: React.FC<SourceFinderViewProps> = ({
  onViewRecord,
  onPreviewSheet,
  onLookupCustomer,
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<SearchMatchItem[]>([]);
  const [searched, setSearched] = useState(false);

  const handleTrace = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = (customQuery !== undefined ? customQuery : query).trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    try {
      // Determine if phone or name
      const isDigits = /^\+?[\d\s-]{7,}$/.test(q);
      const type = isDigits ? 'phone' : 'name';
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}&limit=20`);
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Crosshair className="w-5 h-5 text-emerald-400" />
          Row &amp; Source Tracker
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Trace any customer record back to its exact Google Drive folder, workbook, worksheet, Excel row, and original cell.
        </p>
      </div>

      {/* Input */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl max-w-2xl">
        <form onSubmit={handleTrace} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter phone number or customer name to trace origin..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
          >
            {loading ? 'Tracing...' : 'Trace Source'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-3 text-xs">
          <span className="text-slate-500 font-mono text-[11px]">Sample traces:</span>
          {['8096452615', '8657184019', 'SUMIT GARG', '9868368069'].map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => {
                setQuery(sample);
                handleTrace(undefined, sample);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono transition-colors cursor-pointer"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      {/* Traced Results */}
      {searched && (
        <div className="space-y-4">
          {matches.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
              No matching record found to trace.
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold tracking-wider block">
                        SOURCE TRACE RESULT #{idx + 1}
                      </span>
                      <h3 className="text-base font-bold text-white">
                        {item.customerName || 'Record'} ({item.phoneRaw || item.normPhone})
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => onViewRecord(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>View Full Row</span>
                      </button>
                      <button
                        onClick={() => onPreviewSheet(item.fileId, item.sheetName)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview Sheet</span>
                      </button>
                      {onLookupCustomer && (item.normPhone || item.phoneRaw || item.customerName) && (
                        <button
                          onClick={() => onLookupCustomer(item.normPhone || item.phoneRaw || item.customerName)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white rounded-lg text-xs font-semibold border border-indigo-500/40 transition-colors cursor-pointer"
                        >
                          <span>Customer Lookup &amp; Diff</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a
                        href={`https://drive.google.com/file/d/${item.fileId}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        <span>View in Drive</span>
                      </a>
                    </div>
                  </div>

                  {/* Step-by-step Visual Breadcrumb Lineage */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block mb-2">
                      Lineage Path (Source of Truth)
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                      {/* 1. Drive Root */}
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-mono uppercase block">1. Drive Root</span>
                        <div className="font-semibold text-slate-200 truncate mt-1 flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Main MIS Root</span>
                        </div>
                      </div>

                      {/* 2. Folder */}
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-mono uppercase block">2. Folder</span>
                        <div className="font-semibold text-slate-200 truncate mt-1 flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{item.folderPath}</span>
                        </div>
                      </div>

                      {/* 3. Workbook */}
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-mono uppercase block">3. Excel File</span>
                        <div className="font-semibold text-slate-100 truncate mt-1 flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>{item.fileName}</span>
                        </div>
                      </div>

                      {/* 4. Worksheet */}
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-mono uppercase block">4. Worksheet</span>
                        <div className="font-semibold text-purple-300 truncate mt-1 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>{item.sheetName}</span>
                        </div>
                      </div>

                      {/* 5. Row */}
                      <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40">
                        <span className="text-[10px] text-emerald-400 font-mono uppercase block">5. Exact Row</span>
                        <div className="font-mono font-bold text-emerald-300 text-sm mt-1">
                          Row {item.rowNum}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
