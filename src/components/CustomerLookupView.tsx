import React, { useState, useEffect } from 'react';
import {
  Search,
  Phone,
  CreditCard,
  FileText,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  MessageSquare,
  Maximize2,
  Trash2,
  Sparkles,
  Layers,
  Copy,
  Check,
  ShieldCheck,
  RotateCcw,
  Calendar,
  Building,
  ArrowRight,
  Filter,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Shield,
  Plus,
  Send,
  Folder,
  ExternalLink,
  FileSpreadsheet,
  X,
  Ticket,
  Crown,
} from 'lucide-react';
import { CustomerLookupRecord, CustomerSearchResult, AuthUser, DriveOccurrence } from '../types';
import { LeadAuditModal } from './LeadAuditModal';

interface CustomerLookupViewProps {
  currentUser?: AuthUser | null;
  onOpenRowModal: (id: number) => void;
  onNavigateToMIS?: () => void;
  onPreviewSheet?: (fileId: string, sheetName: string) => void;
  onNavigateToTicket?: (ticketId: string | number) => void;
  initialQuery?: string;
}

interface CachedLookupSession {
  searchField: 'phone' | 'pan' | 'aadhar' | 'all';
  query: string;
  result: CustomerSearchResult | null;
  baseRecordId: number | null;
}

// Module-level in-memory cache to preserve state across unmounts/tab switching
let globalLookupCache: CachedLookupSession | null = null;

function loadStoredLookupCache(): CachedLookupSession | null {
  if (globalLookupCache) return globalLookupCache;
  try {
    const raw = sessionStorage.getItem('f2_customer_lookup_cache');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.query === 'string') {
        globalLookupCache = parsed;
        return parsed;
      }
    }
  } catch {}
  return null;
}

function saveStoredLookupCache(data: CachedLookupSession | null) {
  globalLookupCache = data;
  try {
    if (data && data.query) {
      sessionStorage.setItem('f2_customer_lookup_cache', JSON.stringify(data));
    } else {
      sessionStorage.removeItem('f2_customer_lookup_cache');
    }
  } catch {}
}

export const CustomerLookupView: React.FC<CustomerLookupViewProps> = ({
  currentUser = { id: 'usr_admin', username: 'admin', name: 'Administrator', role: 'admin', status: 'active' },
  onOpenRowModal,
  onNavigateToMIS,
  onPreviewSheet,
  onNavigateToTicket,
  initialQuery,
}) => {
  const initialCache = loadStoredLookupCache();
  const [searchField, setSearchField] = useState<'phone' | 'pan' | 'aadhar' | 'all'>(
    initialCache?.searchField || 'phone'
  );
  const [query, setQuery] = useState(initialCache?.query || '');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CustomerSearchResult | null>(
    initialCache?.result || null
  );
  const [baseRecordId, setBaseRecordId] = useState<number | null>(
    initialCache?.baseRecordId ?? null
  );
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Persist search results and state whenever they update
  useEffect(() => {
    if (query || result) {
      saveStoredLookupCache({
        searchField,
        query,
        result,
        baseRecordId,
      });
    }
  }, [searchField, query, result, baseRecordId]);

  // Masking & Parameter UI state
  const [revealedPanIds, setRevealedPanIds] = useState<Set<number>>(new Set());
  const [revealedAadharIds, setRevealedAadharIds] = useState<Set<number>>(new Set());
  const [expandedDetailsIds, setExpandedDetailsIds] = useState<Set<number>>(new Set());
  const [expandedOtherMatches, setExpandedOtherMatches] = useState<Record<number, boolean>>({});
  const [driveModalOccurrences, setDriveModalOccurrences] = useState<DriveOccurrence[] | null>(null);

  // Status Filter State (ALL, APPROVED, REJECTED, ACTIVE, DISBURSED, etc.)
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const toggleExpandOtherMatches = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedOtherMatches((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleRevealPan = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedPanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleRevealAadhar = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedAadharIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandedDetails = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDetailsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatMaskedPan = (pan: string | undefined, isRevealed: boolean) => {
    if (!pan || pan === '—') return '—';
    if (isRevealed) return pan;
    if (pan.length >= 10) {
      return `${pan.slice(0, 5)}••••${pan.slice(-1)}`;
    }
    return '••••••••••';
  };

  const formatMaskedAadhar = (aadhar: string | undefined, isRevealed: boolean) => {
    if (!aadhar || aadhar === '—') return '—';
    if (isRevealed) return aadhar;
    const digits = aadhar.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `•••• •••• ${digits.slice(-4)}`;
    }
    return '•••• •••• ••••';
  };

  const formatPhoneDisplay = (phone: string | undefined) => {
    if (!phone) return '+91';
    const clean = String(phone).replace(/\D/g, '');
    if (clean.length === 10) {
      return `+91 ${clean}`;
    }
    if (clean.length > 10 && clean.startsWith('91')) {
      return `+91 ${clean.slice(2)}`;
    }
    return `+91 ${phone}`;
  };

  // ================= STATUS ANALYSIS & CATEGORIZATION (FROM ALL SHEET DATA) =================
  // Canonical Status Categories analyzed across all MIS sheets:
  // APPROVED, REJECTED, ACTIVE, DISBURSED, HOLD, DROP, LOGIN, IN PROCESS, CANCELLED
  const getStatusCategory = (rawStatus: string | undefined): string => {
    if (!rawStatus) return 'ACTIVE';
    const s = rawStatus.trim().toUpperCase();
    if (s.includes('APPROV') || s.includes('SANCTION')) return 'APPROVED';
    if (s.includes('REJECT') || s.includes('REJETC')) return 'REJECTED';
    if (s.includes('DISBURS')) return 'DISBURSED';
    if (s.includes('HOLD')) return 'HOLD';
    if (s.includes('DROP')) return 'DROP';
    if (s.includes('CANCEL')) return 'CANCELLED';
    if (s.includes('LOGIN') || s.includes('LOGGED') || s.includes('TO BE LOGIN')) return 'LOGIN';
    if (
      s.includes('PROCESS') ||
      s.includes('PEND') ||
      s.includes('RELOOK') ||
      s.includes('RE-LOOK') ||
      s.includes('FORWARD') ||
      s.includes('DISCUSSION')
    ) {
      return 'IN PROCESS';
    }
    if (s.includes('ACTIV')) return 'ACTIVE';
    return s;
  };

  const STANDARD_STATUS_CATEGORIES = [
    'ALL',
    'APPROVED',
    'REJECTED',
    'ACTIVE',
    'DISBURSED',
    'LOGIN',
    'HOLD',
    'DROP',
    'IN PROCESS',
    'CANCELLED',
  ] as const;

  // Real-time status breakdown across current search records
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { ALL: result?.records.length || 0 };
    STANDARD_STATUS_CATEGORIES.slice(1).forEach((cat) => {
      counts[cat] = 0;
    });

    result?.records.forEach((rec) => {
      const cat = getStatusCategory(rec.status);
      counts[cat] = (counts[cat] || 0) + 1;
      const raw = (rec.status || 'Active').trim().toUpperCase();
      if (raw && !STANDARD_STATUS_CATEGORIES.includes(raw as any)) {
        counts[raw] = (counts[raw] || 0) + 1;
      }
    });

    return counts;
  }, [result?.records]);

  // Dynamic filter tabs: Always show ALL + Core statuses, plus any status with counts > 0
  const availableStatusFilters = React.useMemo(() => {
    const primary = [
      'ALL',
      'APPROVED',
      'REJECTED',
      'ACTIVE',
      'DISBURSED',
      'HOLD',
      'DROP',
      'LOGIN',
      'IN PROCESS',
      'CANCELLED',
    ];
    const extras: string[] = [];
    if (result?.records) {
      result.records.forEach((r) => {
        const cat = getStatusCategory(r.status);
        if (!primary.includes(cat) && !extras.includes(cat)) {
          extras.push(cat);
        }
      });
    }
    return [...primary, ...extras];
  }, [result?.records]);

  // Records filtered by the active status filter pill
  const filteredRecords = React.useMemo(() => {
    if (!result?.records) return [];
    if (statusFilter === 'ALL') return result.records;
    return result.records.filter((rec) => {
      const cat = getStatusCategory(rec.status);
      const raw = (rec.status || 'Active').trim().toUpperCase();
      return cat === statusFilter || raw === statusFilter.toUpperCase();
    });
  }, [result?.records, statusFilter]);

  const renderStatusBadge = (status: string | undefined) => {
    const cat = getStatusCategory(status);
    const raw = (status || 'Active').trim();
    if (cat === 'APPROVED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-300">
          APPROVED
        </span>
      );
    }
    if (cat === 'REJECTED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-rose-50 text-rose-700 border border-rose-300">
          REJECTED
        </span>
      );
    }
    if (cat === 'DISBURSED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-teal-50 text-teal-800 border border-teal-300">
          DISBURSED
        </span>
      );
    }
    if (cat === 'HOLD') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-amber-50 text-amber-800 border border-amber-300">
          HOLD
        </span>
      );
    }
    if (cat === 'DROP') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-orange-50 text-orange-800 border border-orange-300">
          DROP
        </span>
      );
    }
    if (cat === 'LOGIN') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-300">
          LOGIN
        </span>
      );
    }
    if (cat === 'IN PROCESS') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-purple-50 text-purple-700 border border-purple-300">
          {raw.length <= 15 ? raw.toUpperCase() : 'IN PROCESS'}
        </span>
      );
    }
    if (cat === 'CANCELLED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-slate-100 text-slate-700 border border-slate-300">
          CANCELLED
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-blue-50 text-blue-700 border border-blue-200">
        {raw || 'ACTIVE'}
      </span>
    );
  };

  // Modals
  const [auditRecord, setAuditRecord] = useState<CustomerLookupRecord | null>(null);

  // Batch selection
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);

  // Quick preset queries from real indexed leads
  const sampleSearches = [
    { label: 'MIS + LOGIN Match', field: 'phone' as const, val: '9542688841' },
    { label: 'Multi-Sheet MIS', field: 'phone' as const, val: '7398920831' },
    { label: 'Sample Phone', field: 'phone' as const, val: '8750648418' },
    { label: 'Dr. Query', field: 'all' as const, val: 'Ashwani' },
  ];

  const handleSearch = async (overrideQuery?: string, overrideField?: 'phone' | 'pan' | 'aadhar' | 'all') => {
    const q = (overrideQuery !== undefined ? overrideQuery : query).trim();
    const f = overrideField || searchField;
    if (!q) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/records/search?field=${f}&q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data: CustomerSearchResult = await res.json();
        setResult(data);
        // Default base record to first record if multiple
        if (data.records && data.records.length > 0) {
          setBaseRecordId(data.records[0].id);

          // Asynchronously query live ticket matches for any records that need updates
          const missingMatches = data.records.some((r) => !r.liveTicketMatch);
          if (missingMatches) {
            fetch('/api/f2-tickets/check-matches', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ records: data.records }),
            })
              .then((mRes) => (mRes.ok ? mRes.json() : null))
              .then((mJson) => {
                if (mJson?.matches && Object.keys(mJson.matches).length > 0) {
                  setResult((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      records: prev.records.map((r) => {
                        const match =
                          mJson.matches[String(r.id)] ||
                          mJson.matches[String(r.phoneNumber)];
                        return match ? { ...r, liveTicketMatch: match } : r;
                      }),
                    };
                  });
                }
              })
              .catch(() => {});
          }
        } else {
          setBaseRecordId(null);
        }
        setSelectedRecordIds([]);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearSearch = () => {
    setQuery('');
    setResult(null);
    setBaseRecordId(null);
    setSelectedRecordIds([]);
    saveStoredLookupCache(null);
  };

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      const clean = initialQuery.trim();
      if (clean !== query || !result) {
        const digits = clean.replace(/\D/g, '');
        const detectedField: 'phone' | 'pan' | 'aadhar' | 'all' =
          digits.length === 10
            ? 'phone'
            : digits.length === 12
            ? 'aadhar'
            : /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(clean)
            ? 'pan'
            : 'all';
        setSearchField(detectedField);
        setQuery(clean);
        handleSearch(clean, detectedField);
      }
    }
  }, [initialQuery]);

  const handleCopy = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Record an audit lead check and open audit modal
  const handleOpenAudit = async (record: CustomerLookupRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/records/${record.id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName: currentUser?.name || 'Administrator' }),
      });
      if (res.ok) {
        const data = await res.json();
        const updatedRecord = {
          ...record,
          checkCount: data.checkCount,
          checkHistory: data.checkHistory,
        };
        setAuditRecord(updatedRecord);
        // Update in current results
        if (result) {
          setResult({
            ...result,
            records: result.records.map((r) => (r.id === record.id ? updatedRecord : r)),
          });
        }
        return;
      }
    } catch (err) {
      console.error('Audit check failed:', err);
    }
    setAuditRecord(record);
  };

  // Delete Single Record
  const handleDeleteRecord = async (recordId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const res = await fetch(`/api/admin/records/${recordId}`, { method: 'DELETE' });
      if (res.ok) {
        if (result) {
          const updated = result.records.filter((r) => r.id !== recordId);
          setResult({ ...result, records: updated });
          if (baseRecordId === recordId) {
            setBaseRecordId(updated.length > 0 ? updated[0].id : null);
          }
        }
      }
    } catch (err) {
      console.error('Delete record failed:', err);
    }
  };

  // Batch Delete Records
  const handleBatchDelete = async () => {
    if (selectedRecordIds.length === 0) return;

    try {
      const res = await fetch('/api/admin/records/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedRecordIds }),
      });
      if (res.ok) {
        if (result) {
          const updated = result.records.filter((r) => !selectedRecordIds.includes(r.id));
          setResult({ ...result, records: updated });
          setSelectedRecordIds([]);
          if (baseRecordId && selectedRecordIds.includes(baseRecordId)) {
            setBaseRecordId(updated.length > 0 ? updated[0].id : null);
          }
        }
      }
    } catch (err) {
      console.error('Batch delete failed:', err);
    }
  };

  // Find base record
  const baseRecord = result?.records.find((r) => r.id === baseRecordId) || null;

  // Comparison helper: returns tick or cross
  const renderDiffIndicator = (fieldVal: string | undefined, baseVal: string | undefined, fieldLabel: string) => {
    if (!baseRecord || baseRecord.id === undefined) return null;

    const valClean = String(fieldVal || '').trim().toLowerCase();
    const baseClean = String(baseVal || '').trim().toLowerCase();

    if (!valClean && !baseClean) {
      return (
        <span className="text-[10px] text-slate-400 font-mono shrink-0" title="Both empty">
          —
        </span>
      );
    }

    if (valClean === baseClean) {
      return (
        <span
          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0"
          title={`✅ Matches Base Record (${fieldLabel})`}
        >
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
          <span>match</span>
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 shrink-0"
        title={`❌ Differs from Base Record: "${baseVal || 'Empty'}"`}
      >
        <XCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
        <span>diff</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Banner matching Shubhi Project style */}
      <div className="bg-gradient-to-r from-[#0A2540] via-slate-900 to-indigo-950 rounded-2xl text-white p-6 shadow-md border border-slate-700/60 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30">
                F2 Fintech Customer Lookup & Verification
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-300 flex items-center gap-1 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Live Verification Suite
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
              Customer Lookup, Audit Trail & Base Record Diff
            </h1>
            <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-2xl">
              Instant multi-identifier search across PAN, Aadhaar, and Mobile numbers. Compare filing conflicts against a selected Base Record with tick/cross indicators.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {onNavigateToMIS && (
              <button
                type="button"
                onClick={onNavigateToMIS}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Google Sheet Sync</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search Input Box */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
        {/* Identifier Field Selection Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setSearchField('phone')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              searchField === 'phone'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Mobile Phone (10-digit)</span>
          </button>

          <button
            type="button"
            onClick={() => setSearchField('pan')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              searchField === 'pan'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>PAN Card (ABCDE1234F)</span>
          </button>

          <button
            type="button"
            onClick={() => setSearchField('aadhar')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              searchField === 'aadhar'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Aadhaar Number (12-digit)</span>
          </button>

          <button
            type="button"
            onClick={() => setSearchField('all')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              searchField === 'all'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Customer Name / All Fields</span>
          </button>
        </div>

        {/* Input & Search Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchField === 'phone'
                  ? 'Enter 10-digit mobile number (e.g. 9868368069)...'
                  : searchField === 'pan'
                  ? 'Enter 10-character PAN number (e.g. ABCDE1234F)...'
                  : searchField === 'aadhar'
                  ? 'Enter 12-digit Aadhaar UID...'
                  : 'Search by Customer or Doctor Name, Phone, or PAN...'
              }
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all font-mono font-medium"
            />
            {query && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Clear Search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-md shadow-blue-500/20 cursor-pointer flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            <span>{isLoading ? 'Searching...' : 'Search Registry'}</span>
          </button>
        </form>

        {/* Quick Sample Queries */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Quick Test Leads:
          </span>
          {sampleSearches.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setSearchField(s.field);
                setQuery(s.val);
                handleSearch(s.val, s.field);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-xs font-mono border border-slate-200/80 transition-colors cursor-pointer"
            >
              {s.label}: <strong>{s.val}</strong>
            </button>
          ))}
        </div>
      </div>

      {/* Search Results Area */}
      {result && (
        <div className="space-y-4">
          {/* Result Header & Multi-Record Warning */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-xl text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                {result.records.length} Record{result.records.length === 1 ? '' : 's'} Found
              </span>
              <span className="text-xs text-slate-500">
                Query: <strong className="font-mono text-slate-800 font-bold">{result.searchQuery}</strong>
              </span>
            </div>

            {/* Base Record Comparison Controller */}
            {result.records.length > 1 && (
              <div className="flex items-center gap-2">
                {baseRecord ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">
                      Comparing against base: <strong className="text-amber-800 font-bold">{baseRecord.customerName}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setBaseRecordId(null)}
                      className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Clear Base
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">
                    💡 Click any record card to set as Base Record for tick/cross (✅/❌) comparison
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Drive Directory Presence Banner */}
          {result.variantDetails?.driveOccurrences && result.variantDetails.driveOccurrences.length > 0 && (
            <div className="bg-gradient-to-r from-indigo-50/95 via-sky-50/90 to-blue-50/90 border border-indigo-200/90 rounded-2xl p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-600/10 text-indigo-700 shrink-0 border border-indigo-200/80">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">Also Present in Drive Directory Data:</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                      {result.variantDetails.driveOccurrences.length} Sheet File{result.variantDetails.driveOccurrences.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 font-mono">
                    <span className="text-[11px] font-medium text-slate-600">Present in:</span>
                    {result.variantDetails.driveOccurrences.map((d, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-[11px] text-slate-800 font-bold"
                      >
                        <span className="text-indigo-600">Sheet:</span> {d.sheetName}
                        <span className="text-slate-400 font-normal">({d.fileName})</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDriveModalOccurrences(result.variantDetails?.driveOccurrences || null)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1.5 shadow-xs"
              >
                <span>View Sheet Pop-up</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Multi-Record Phone & Duplicate Conflict Alert Banner */}
          {result.variantDetails?.isMultiRecord && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-black tracking-wider uppercase text-amber-900">
                      MULTI-RECORD CONTACT / DUPLICATE ENTRIES
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 text-amber-800">
                      Conflict Notice
                    </span>
                  </div>
                  <p className="text-xs text-amber-800/90 mt-0.5">
                    This phone number is associated with multiple customer filings or variations across workbooks. Verify whether applicants are related parties or repeated logins.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold">
                  {result.variantDetails.distinctPanCount} Distinct PAN{result.variantDetails.distinctPanCount === 1 ? '' : 's'}
                </span>
                {result.variantDetails.distinctAadharCount > 0 && (
                  <span className="px-3 py-1 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold">
                    {result.variantDetails.distinctAadharCount} Distinct Aadhaar{result.variantDetails.distinctAadharCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Batch Actions Bar */}
          {selectedRecordIds.length > 0 && (
            <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl flex items-center justify-between shadow-lg">
              <span className="text-xs font-bold">
                {selectedRecordIds.length} Record{selectedRecordIds.length === 1 ? '' : 's'} Selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRecordIds([])}
                  className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white text-xs font-medium cursor-pointer"
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected</span>
                </button>
              </div>
            </div>
          )}

          {/* Status Filter Bar (Placed Above Entries) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                  <Filter className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black tracking-wider uppercase text-slate-800 flex items-center gap-2">
                    <span>Filter Entries by Application Status</span>
                    <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                      From Sheet Data
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Filter matching customer entries by status: Approved, Rejected, Active, Disbursed, Login, Hold, etc.
                  </p>
                </div>
              </div>

              {statusFilter !== 'ALL' && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">
                    Showing <strong className="text-slate-900 font-bold">{filteredRecords.length}</strong> of{' '}
                    <strong className="text-slate-900 font-bold">{result.records.length}</strong> entries
                  </span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                  >
                    Reset to ALL
                  </button>
                </div>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              {availableStatusFilters.map((st) => {
                const count = statusCounts[st] || 0;
                const isSelected = statusFilter === st;
                const hasMatches = count > 0;

                // Color mappings for active state and badge
                let activeClass = 'bg-slate-900 text-white shadow-xs';
                let inactiveBadgeClass = 'bg-slate-100 text-slate-600';

                if (st === 'APPROVED') {
                  activeClass = 'bg-emerald-600 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400';
                } else if (st === 'REJECTED') {
                  activeClass = 'bg-rose-600 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-400';
                } else if (st === 'DISBURSED') {
                  activeClass = 'bg-teal-600 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-400';
                } else if (st === 'ACTIVE') {
                  activeClass = 'bg-blue-600 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-400';
                } else if (st === 'HOLD') {
                  activeClass = 'bg-amber-600 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400';
                } else if (st === 'DROP') {
                  activeClass = 'bg-orange-600 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-400';
                } else if (st === 'LOGIN') {
                  activeClass = 'bg-indigo-600 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-400';
                } else if (st === 'IN PROCESS') {
                  activeClass = 'bg-purple-600 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-400';
                } else if (st === 'CANCELLED') {
                  activeClass = 'bg-slate-700 text-white shadow-xs';
                  inactiveBadgeClass = hasMatches ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-400';
                }

                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                      isSelected
                        ? `${activeClass} border-transparent ring-2 ring-offset-1 ring-blue-400/50`
                        : hasMatches
                        ? 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                        : 'bg-slate-50/50 hover:bg-slate-50 text-slate-400 border-slate-100'
                    }`}
                  >
                    <span>{st}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                        isSelected ? 'bg-white/20 text-white' : inactiveBadgeClass
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Records Grid / List */}
          {result.records.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
              <Search className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-sm text-slate-700">No matching records found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                No customer or loan application matched the query "{result.searchQuery}" in the selected field.
              </p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 space-y-3">
              <Filter className="w-9 h-9 mx-auto text-slate-300" />
              <div>
                <p className="font-bold text-sm text-slate-800">
                  No records match status &quot;{statusFilter}&quot;
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  There are {result.records.length} total entries available under this search query.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer shadow-xs"
              >
                Show All Entries ({result.records.length})
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRecords.map((record) => {
                const isBase = baseRecordId === record.id;
                const isSelected = selectedRecordIds.includes(record.id);

                return (
                  <div
                    key={record.id}
                    onClick={() => {
                      if (result.records.length > 1) {
                        setBaseRecordId(record.id);
                      }
                    }}
                    className={`rounded-2xl border transition-all p-5 relative cursor-pointer overflow-hidden ${
                      isBase
                        ? 'bg-amber-50/40 border-amber-400 shadow-md ring-2 ring-amber-400/30'
                        : 'bg-white border-slate-200/90 hover:border-blue-400 hover:shadow-sm'
                    }`}
                  >
                    {/* Base Record Indicator Banner (in-flow so it never overlaps status badges) */}
                    {isBase && (
                      <div className="mb-2.5 flex items-center justify-between bg-amber-400/90 text-slate-900 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-2xs">
                        <div className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Comparison Base Record</span>
                        </div>
                        <span className="text-[9px] font-bold opacity-80">Primary Reference</span>
                      </div>
                    )}

                    {/* Card Top Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.checked) {
                              setSelectedRecordIds([...selectedRecordIds, record.id]);
                            } else {
                              setSelectedRecordIds(selectedRecordIds.filter((id) => id !== record.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-blue-600 mt-1 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-base font-black text-[#0A2540] uppercase tracking-tight break-words">
                              {record.customerName || record.doctorName || 'Customer Record'}
                            </h3>
                            {!isBase &&
                              renderDiffIndicator(record.customerName, baseRecord?.customerName, 'Customer Name')}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-mono flex-wrap">
                            <span>ID: {record.formattedId || `REC-${record.id}`}</span>
                            <button
                              type="button"
                              onClick={(e) => handleCopy(record.formattedId || `REC-${record.id}`, e)}
                              className="p-0.5 hover:text-slate-700 cursor-pointer"
                              title="Copy Record ID"
                            >
                              {copiedText === (record.formattedId || `REC-${record.id}`) ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {record.doctorName && record.doctorName !== record.customerName && (
                              <span className="text-slate-500 font-sans">Dr. {record.doctorName}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Clean Live Ticket Button: Only shown if data is present in live API */}
                        {record.liveTicketMatch && onNavigateToTicket && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToTicket(record.liveTicketMatch!.ticketId);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer shrink-0"
                            title={`Open Live Ticket #${record.liveTicketMatch.ticketId} in Live Tickets API`}
                          >
                            <Ticket className="w-3.5 h-3.5 text-amber-300" />
                            <span>Live Ticket #{record.liveTicketMatch.ticketId}</span>
                            <ArrowRight className="w-3 h-3 text-blue-200" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Clean Primary Entries Grid - Balanced 2-column layout to prevent any squishing/overlapping */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs my-2.5">
                      {/* 1. Status */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          STATUS
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {renderStatusBadge(record.status)}
                          {record.isHighestPriority && (
                            <span
                              className="px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide uppercase bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-2xs flex items-center gap-1 shrink-0"
                              title={record.chosenPriorityReason || 'Selected as primary record from the highest priority MIS sheet.'}
                            >
                              <Crown className="w-3 h-3 text-amber-200 shrink-0" />
                              <span>Priority #{record.misPriorityRank || 1}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 2. Phone Number */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          PHONE NUMBER
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap font-bold font-mono text-slate-900 text-[13px]">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="whitespace-nowrap">{formatPhoneDisplay(record.phoneNumber)}</span>
                          {record.phoneNumber && (
                            <button
                              type="button"
                              onClick={(e) => handleCopy(record.phoneNumber, e)}
                              className="p-1 hover:bg-slate-200/70 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer shrink-0"
                              title="Copy Phone"
                            >
                              {copiedText === record.phoneNumber ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                          {!isBase && renderDiffIndicator(record.phoneNumber, baseRecord?.phoneNumber, 'Phone Number')}
                        </div>
                      </div>

                      {/* 3. Lender Name (Full visibility, no truncation) */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          LENDER NAME
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap font-bold text-slate-900 text-[13px]">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="break-words font-extrabold text-slate-900 leading-snug">
                            {record.lenderName || '—'}
                          </span>
                          {!isBase && renderDiffIndicator(record.lenderName, baseRecord?.lenderName, 'Lender')}
                        </div>
                      </div>

                      {/* 4. Login Date (Kept cleanly on single line) */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          LOGIN DATE
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap font-bold font-mono text-slate-800 text-[13px]">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="whitespace-nowrap">
                            {record.loginDate || record.dateLogged || '—'}
                          </span>
                          {!isBase && renderDiffIndicator(record.loginDate, baseRecord?.loginDate, 'Login Date')}
                        </div>
                      </div>

                      {/* 5. Login By */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          LOGIN BY
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap font-bold text-slate-900 text-[13px]">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="break-words font-bold">
                            {record.loggedBy || '—'}
                          </span>
                          {!isBase && renderDiffIndicator(record.loggedBy, baseRecord?.loggedBy, 'Logged By')}
                        </div>
                      </div>

                      {/* 6. Present In Drive */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          PRESENT IN DRIVE
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {record.driveOccurrences && record.driveOccurrences.length > 0 ? (
                            record.driveOccurrences.map((d, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDriveModalOccurrences(record.driveOccurrences || null);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-mono text-[11px] font-bold cursor-pointer transition break-words text-left"
                                title={`File: ${d.fileName} • Sheet: ${d.sheetName}. Click to inspect.`}
                              >
                                <Folder className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span className="font-semibold">{d.fileName}</span>
                                <span className="text-slate-500 font-normal">({d.sheetName})</span>
                              </button>
                            ))
                          ) : (
                            <span className="text-slate-400 font-medium text-xs">— (None)</span>
                          )}
                        </div>
                      </div>

                      {/* 7. File Fetched From (Spanning across full card width for complete visibility) */}
                      <div className="sm:col-span-2 pt-2 border-t border-slate-200/70">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          FILE FETCHED FROM
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                          <span
                            className="px-2.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-900 font-bold break-all shadow-2xs"
                            title={record.fileName || 'MIS'}
                          >
                            {record.fileName || 'MIS'}
                          </span>
                          {(record.sheetName || record.rawSheetName) && (
                            <span
                              className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold break-all shadow-2xs"
                              title={record.sheetName || record.rawSheetName}
                            >
                              {record.sheetName || record.rawSheetName}
                            </span>
                          )}
                          {record.rowNum ? (
                            <span className="text-[10px] text-slate-500 font-bold px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                              Row #{record.rowNum}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Drop Down Toggle Button for Other Details */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={(e) => toggleExpandedDetails(record.id, e)}
                        className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-700 text-xs font-bold transition cursor-pointer group"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-slate-900">Other Details</span>
                          <span className="text-[11px] font-normal text-slate-400">
                            (PAN, Aadhaar, Manager, Remarks, Dates, Audit, Raw Row...)
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-blue-600 font-bold text-xs">
                          <span>{expandedDetailsIds.has(record.id) ? 'Hide Details' : 'Show Details'}</span>
                          {expandedDetailsIds.has(record.id) ? (
                            <ChevronUp className="w-4 h-4 text-blue-600" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                          )}
                        </span>
                      </button>
                    </div>

                    {/* Collapsible Section for Other Details */}
                    {expandedDetailsIds.has(record.id) && (
                      <div className="mt-2.5 space-y-3 p-4 rounded-xl bg-white border border-slate-200 shadow-xs animate-in fade-in duration-150">
                        {/* Secondary Identity & Operations Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                          {/* PAN Number */}
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                              PAN NUMBER
                            </span>
                            <div className="flex items-center gap-1.5 font-bold font-mono text-slate-900 text-xs">
                              <span>{formatMaskedPan(record.panNumber, revealedPanIds.has(record.id))}</span>
                              {record.panNumber && record.panNumber !== '—' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => toggleRevealPan(record.id, e)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                    title={revealedPanIds.has(record.id) ? 'Mask PAN' : 'Reveal PAN'}
                                  >
                                    {revealedPanIds.has(record.id) ? (
                                      <EyeOff className="w-3 h-3 text-blue-600" />
                                    ) : (
                                      <Eye className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopy(record.panNumber, e)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                    title="Copy PAN"
                                  >
                                    {copiedText === record.panNumber ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </>
                              )}
                              {!isBase && renderDiffIndicator(record.panNumber, baseRecord?.panNumber, 'PAN Number')}
                            </div>
                          </div>

                          {/* Aadhaar Number */}
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                              AADHAR NUMBER
                            </span>
                            <div className="flex items-center gap-1.5 font-mono text-slate-900 font-bold text-xs">
                              <span>{formatMaskedAadhar(record.aadharNumber, revealedAadharIds.has(record.id))}</span>
                              {record.aadharNumber && record.aadharNumber !== '—' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => toggleRevealAadhar(record.id, e)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                    title={revealedAadharIds.has(record.id) ? 'Mask Aadhaar' : 'Reveal Aadhaar'}
                                  >
                                    {revealedAadharIds.has(record.id) ? (
                                      <EyeOff className="w-3 h-3 text-blue-600" />
                                    ) : (
                                      <Eye className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopy(record.aadharNumber || '', e)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                    title="Copy Aadhaar"
                                  >
                                    {copiedText === record.aadharNumber ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </>
                              )}
                              {!isBase && renderDiffIndicator(record.aadharNumber, baseRecord?.aadharNumber, 'Aadhaar')}
                            </div>
                          </div>

                          {/* Manager */}
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                              MANAGER
                            </span>
                            <div className="font-bold text-slate-900 text-xs">
                              {record.manager || '—'}
                              {!isBase && renderDiffIndicator(record.manager, baseRecord?.manager, 'Manager')}
                            </div>
                          </div>

                          {/* Team Leader */}
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                              TEAM LEADER
                            </span>
                            <div className="font-bold text-slate-900 text-xs">
                              {record.teamLeader || '—'}
                              {!isBase && renderDiffIndicator(record.teamLeader, baseRecord?.teamLeader, 'Team Leader')}
                            </div>
                          </div>

                          {/* Approved Date */}
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                              APPROVED DATE
                            </span>
                            <div className="flex items-center gap-1.5 font-bold font-mono text-emerald-700 text-xs">
                              <Calendar className="w-3 h-3 text-emerald-500" />
                              <span>{record.approvalDate || '—'}</span>
                              {!isBase && renderDiffIndicator(record.approvalDate, baseRecord?.approvalDate, 'Approved Date')}
                            </div>
                          </div>

                          {/* Disbursed Date */}
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                              DISBURSED DATE
                            </span>
                            <div className="flex items-center gap-1.5 font-bold font-mono text-teal-700 text-xs">
                              <Calendar className="w-3 h-3 text-teal-500" />
                              <span>{record.disbursedDate || '—'}</span>
                              {!isBase && renderDiffIndicator(record.disbursedDate, baseRecord?.disbursedDate, 'Disbursed Date')}
                            </div>
                          </div>

                          {/* Loan Amount */}
                          {record.loanAmount && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                LOAN AMOUNT
                              </span>
                              <span className="font-mono font-bold text-emerald-700 text-xs">
                                ₹{isNaN(Number(record.loanAmount)) ? record.loanAmount : Number(record.loanAmount).toLocaleString()}
                              </span>
                            </div>
                          )}

                          {/* CIBIL Score */}
                          {record.cibilScore && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                CIBIL SCORE
                              </span>
                              <span className="font-mono font-bold text-blue-700 text-xs">{record.cibilScore}</span>
                            </div>
                          )}

                          {/* LAN No */}
                          {record.lanNo && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                LAN NUMBER
                              </span>
                              <span className="font-mono text-slate-800 text-xs">{record.lanNo}</span>
                            </div>
                          )}

                          {/* Location / Branch */}
                          {(record.city || record.state || record.branch) && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                LOCATION &amp; BRANCH
                              </span>
                              <span className="text-slate-800 font-medium text-xs">
                                {[record.city, record.state, record.branch].filter(Boolean).join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Loan Type / Category */}
                          {(record.loanType || record.loanCategory) && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                LOAN TYPE / CATEGORY
                              </span>
                              <span className="text-slate-800 font-medium text-xs">
                                {[record.loanType, record.loanCategory ? `(${record.loanCategory})` : ''].filter(Boolean).join(' ')}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Remarks & Banker */}
                        {(record.opsRemarks || record.creditRemarks || record.bankerName) && (
                          <div className="pt-2.5 border-t border-slate-100 space-y-2 text-xs">
                            {record.opsRemarks && (
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block">OPS REMARKS</span>
                                <span className="text-slate-800 font-medium">{record.opsRemarks}</span>
                              </div>
                            )}
                            {record.creditRemarks && (
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block">CREDIT REMARKS</span>
                                <span className="text-slate-800 font-medium">{record.creditRemarks}</span>
                              </div>
                            )}
                            {record.bankerName && (
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block">BANKER DETAILS</span>
                                <span className="text-slate-800 font-medium">
                                  {record.bankerName}
                                  {record.bankerPhone ? ` • ${record.bankerPhone}` : ''}
                                  {record.bankerEmail ? ` • ${record.bankerEmail}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Multi-MIS Matches (if present in other lower-priority MIS sheets) */}
                        {record.otherMisMatches && record.otherMisMatches.length > 0 && (
                          <div className="pt-2.5 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block mb-1.5">
                              Present in Other Lower-Priority MIS File(s):
                            </span>
                            <div className="space-y-1.5">
                              {record.otherMisMatches.map((other, idx) => (
                                <div
                                  key={idx}
                                  className="p-2 rounded-lg bg-amber-50/60 border border-amber-200/80 flex flex-wrap items-center justify-between gap-2 text-xs"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                                    <span className="font-bold text-slate-800">{other.fileName}</span>
                                    <span className="text-slate-600">• Sheet: {other.sheetName}</span>
                                    {other.rowNum ? (
                                      <span className="font-mono text-slate-400 text-[10px]">Row #{other.rowNum}</span>
                                    ) : null}
                                    {other.lenderName && (
                                      <span className="text-slate-600 text-[11px]">({other.lenderName})</span>
                                    )}
                                  </div>
                                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-bold text-[10px]">
                                    Priority #{other.priorityRank || '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons in Dropdown */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => handleOpenAudit(record, e)}
                              className="font-bold text-[#0A2540] hover:text-blue-700 inline-flex items-center gap-1.5 transition cursor-pointer text-xs px-3 py-1.5 rounded-lg bg-blue-50/90 hover:bg-blue-100 border border-blue-200"
                            >
                              <span>View Audit Trail</span>
                              <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenRowModal(record.id);
                              }}
                              className="text-slate-600 hover:text-slate-900 font-semibold text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 transition cursor-pointer"
                            >
                              <Maximize2 className="w-3 h-3" />
                              <span>Inspect Raw Row</span>
                            </button>

                            {onPreviewSheet && record.fileName && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPreviewSheet(
                                    record.fileName!,
                                    record.rawSheetName || record.sheetName || 'Sheet1'
                                  );
                                }}
                                className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3 h-3" />
                                <span>Preview Sheet</span>
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteRecord(record.id, e)}
                            className="text-slate-400 hover:text-rose-600 font-semibold text-xs flex items-center gap-1 transition cursor-pointer px-2 py-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove Record</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Audit Trail Modal */}
      <LeadAuditModal
        record={auditRecord}
        isOpen={!!auditRecord}
        onClose={() => setAuditRecord(null)}
      />

      {/* Drive Directory Sheet Files Pop-up Modal */}
      {driveModalOccurrences && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Drive Directory Sheet Files</h3>
                  <p className="text-[11px] text-slate-300">
                    Found in {driveModalOccurrences.length} Google Drive workbook{driveModalOccurrences.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDriveModalOccurrences(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of Sheet Files */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {driveModalOccurrences.map((occ, idx) => (
                <div
                  key={occ.id || idx}
                  className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/90 hover:border-indigo-300 transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono">{occ.fileName}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300 font-mono shadow-2xs">
                      Sheet: {occ.sheetName}
                    </span>
                  </div>

                  {occ.customerName && (
                    <div className="text-xs text-slate-600">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Name in File:</span>
                      <span className="font-semibold text-slate-800">{occ.customerName}</span>
                    </div>
                  )}

                  {occ.rawRowJson && Object.keys(occ.rawRowJson).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/60 text-[10px] font-mono text-slate-600">
                      {Object.entries(occ.rawRowJson)
                        .filter(
                          ([k, v]) =>
                            v !== null &&
                            v !== '' &&
                            !k.toLowerCase().includes('phone') &&
                            !k.toLowerCase().includes('name')
                        )
                        .slice(0, 4)
                        .map(([k, v], i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                            {k}: <strong className="text-slate-800">{String(v)}</strong>
                          </span>
                        ))}
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-end gap-3">
                    {onPreviewSheet && (
                      <button
                        type="button"
                        onClick={() => {
                          setDriveModalOccurrences(null);
                          onPreviewSheet(occ.fileName, occ.rawSheetName || occ.sheetName);
                        }}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Preview Sheet</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDriveModalOccurrences(null);
                        onOpenRowModal(occ.id);
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Inspect Raw Row Data</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setDriveModalOccurrences(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
