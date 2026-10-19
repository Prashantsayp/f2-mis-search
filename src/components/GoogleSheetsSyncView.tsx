import React, { useState, useEffect, useRef } from 'react';
import {
  FileSpreadsheet,
  Link,
  RefreshCw,
  Copy,
  Check,
  Shield,
  Trash2,
  ExternalLink,
  Plus,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Table,
  Layers,
  ArrowRight,
  UserCheck,
  Upload,
  Eye,
  X,
  FileCheck,
  AlertTriangle,
  Crown,
  Star,
  ArrowUp,
  ArrowDown,
  Files,
  ListOrdered,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { ConnectedSheetItem, MisSyncLogItem, AuthUser } from '../types';

interface GoogleSheetsSyncViewProps {
  currentUser?: AuthUser | null;
  onNavigateToLookup?: () => void;
}

interface QueuedUploadFile {
  id: string;
  file: File;
  name: string;
  sizeFormatted: string;
  status: 'queued' | 'uploading' | 'indexed' | 'error';
  rowsCount?: number;
  error?: string;
}

export const GoogleSheetsSyncView: React.FC<GoogleSheetsSyncViewProps> = ({
  currentUser,
  onNavigateToLookup,
}) => {
  const [sheets, setSheets] = useState<ConnectedSheetItem[]>([]);
  const [logs, setLogs] = useState<MisSyncLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingSheetId, setSyncingSheetId] = useState<string | null>(null);
  const [selectedSheetForInspection, setSelectedSheetForInspection] = useState<ConnectedSheetItem | null>(null);
  const [sheetToDelete, setSheetToDelete] = useState<ConnectedSheetItem | null>(null);
  const [deletingSheetId, setDeletingSheetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form URL - Single vs Batch
  const [urlMode, setUrlMode] = useState<'single' | 'batch'>('single');
  const [newSheetUrl, setNewSheetUrl] = useState('');
  const [newSheetName, setNewSheetName] = useState('');
  const [batchUrlsText, setBatchUrlsText] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [batchConnectProgress, setBatchConnectProgress] = useState<{
    current: number;
    total: number;
    currentUrl: string;
  } | null>(null);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Direct File Upload (Single + Batch Multi-File)
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<QueuedUploadFile[]>([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchUploadProgress, setBatchUploadProgress] = useState<{
    current: number;
    total: number;
    currentFileName: string;
  } | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const targetSheetFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTargetSheetId, setSelectedTargetSheetId] = useState<string | null>(null);

  // Sheet Priority Ordering State
  const [prioritySheets, setPrioritySheets] = useState<ConnectedSheetItem[]>([]);
  const [isSavingPriorities, setIsSavingPriorities] = useState(false);
  const [prioritySuccessMsg, setPrioritySuccessMsg] = useState<string | null>(null);

  // Service Account Email
  const serviceAccountEmail = 'f2fintech-mis-service@f2fintech-gdrive-sync.iam.gserviceaccount.com';
  const [copiedEmail, setCopiedEmail] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const fetchSheetsAndLogs = async () => {
    setIsLoading(true);
    try {
      const [resSheets, resLogs] = await Promise.all([
        fetch('/api/mis/sheets'),
        fetch('/api/mis/sync-logs'),
      ]);
      if (resSheets.ok) {
        const d = await resSheets.json();
        const loadedSheets: ConnectedSheetItem[] = d.sheets || [];
        setSheets(loadedSheets);
        // Sort priority list by priorityRank ascending
        const sorted = [...loadedSheets].sort(
          (a, b) => (a.priorityRank ?? 999) - (b.priorityRank ?? 999)
        );
        setPrioritySheets(sorted);
      }
      if (resLogs.ok) {
        const d = await resLogs.json();
        setLogs(d.logs || []);
      }
    } catch (err) {
      console.error('Error fetching sheets/logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSheetsAndLogs();
  }, []);

  const handleCopyEmail = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(serviceAccountEmail);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      try {
        const el = document.createElement('textarea');
        el.value = serviceAccountEmail;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch (copyErr) {
        console.warn('Fallback copy failed:', copyErr);
      }
    }
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  // Connect Single Sheet
  const handleConnectSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSheetUrl.trim()) return;

    setIsConnecting(true);
    setFormMessage(null);
    try {
      const res = await fetch('/api/mis/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newSheetUrl.trim(),
          name: newSheetName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormMessage({ type: 'error', text: data.error || 'Failed to connect Google Sheet' });
        return;
      }

      setFormMessage({
        type: data.requiresAccess ? 'info' : 'success',
        text: data.message || 'Google Sheet connected successfully',
      });
      setNewSheetUrl('');
      setNewSheetName('');
      await fetchSheetsAndLogs();
    } catch (err: any) {
      setFormMessage({ type: 'error', text: err.message || 'Connection failed' });
    } finally {
      setIsConnecting(false);
    }
  };

  // Batch Connect Multiple Google Sheets by URLs
  const handleBatchConnectSheets = async () => {
    const rawLines = batchUrlsText
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.startsWith('http'));

    if (rawLines.length === 0) {
      setFormMessage({
        type: 'error',
        text: 'Please paste at least one valid Google Sheet URL starting with https://',
      });
      return;
    }

    setIsConnecting(true);
    setFormMessage(null);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const url = rawLines[i];
      setBatchConnectProgress({
        current: i + 1,
        total: rawLines.length,
        currentUrl: url,
      });

      try {
        const res = await fetch('/api/mis/sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setIsConnecting(false);
    setBatchConnectProgress(null);
    setBatchUrlsText('');
    setFormMessage({
      type: successCount > 0 ? 'success' : 'error',
      text: `Batch Connect finished: ${successCount} Google Sheet${
        successCount === 1 ? '' : 's'
      } connected and indexed${failCount > 0 ? ` (${failCount} failed or restricted)` : ''}.`,
    });
    await fetchSheetsAndLogs();
  };

  // Helper to read file to base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Single file upload
  const handleFileUpload = async (file: File, targetSheetId?: string) => {
    if (!file) return;
    setIsUploadingFile(true);
    setFormMessage(null);

    try {
      const base64Data = await readFileAsBase64(file);

      const res = await fetch('/api/mis/upload-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileBase64: base64Data,
          name: file.name.replace(/\.[^/.]+$/, ''),
          targetSheetId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormMessage({ type: 'error', text: data.error || 'Failed to upload and index sheet.' });
        return;
      }

      setFormMessage({
        type: 'success',
        text: data.message || `Successfully indexed ${data.rowsCount} records from ${file.name}.`,
      });
      await fetchSheetsAndLogs();
    } catch (err: any) {
      setFormMessage({ type: 'error', text: err.message || 'File upload failed.' });
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (targetSheetFileInputRef.current) targetSheetFileInputRef.current.value = '';
      setSelectedTargetSheetId(null);
    }
  };

  // Queue Multiple Files for Batch Upload
  const handleQueueFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((f) => {
      const ext = f.name.toLowerCase();
      return ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv');
    });

    if (validFiles.length === 0) {
      setFormMessage({
        type: 'error',
        text: 'Please select valid Excel (.xlsx, .xls) or CSV (.csv) files.',
      });
      return;
    }

    const newQueued: QueuedUploadFile[] = validFiles.map((f) => ({
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      name: f.name,
      sizeFormatted: formatFileSize(f.size),
      status: 'queued',
    }));

    setQueuedFiles((prev) => [...prev, ...newQueued]);
    setFormMessage({
      type: 'info',
      text: `${validFiles.length} file${
        validFiles.length === 1 ? '' : 's'
      } queued. Click "Upload All Files" to index them all at once.`,
    });
  };

  const handleRemoveQueuedFile = (id: string) => {
    setQueuedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearQueuedFiles = () => {
    setQueuedFiles([]);
    if (multiFileInputRef.current) multiFileInputRef.current.value = '';
  };

  // Process Batch Upload of all queued files
  const handleBatchUpload = async () => {
    if (queuedFiles.length === 0) return;
    setIsBatchUploading(true);
    setFormMessage(null);

    let totalIndexedAll = 0;
    let successFiles = 0;

    for (let i = 0; i < queuedFiles.length; i++) {
      const q = queuedFiles[i];
      if (q.status === 'indexed') continue;

      setBatchUploadProgress({
        current: i + 1,
        total: queuedFiles.length,
        currentFileName: q.name,
      });

      // Set status to uploading
      setQueuedFiles((prev) =>
        prev.map((item) => (item.id === q.id ? { ...item, status: 'uploading' } : item))
      );

      try {
        const base64Data = await readFileAsBase64(q.file);
        const res = await fetch('/api/mis/upload-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: q.name,
            fileBase64: base64Data,
            name: q.name.replace(/\.[^/.]+$/, ''),
          }),
        });

        const data = await res.json();
        if (res.ok) {
          successFiles++;
          const rows = data.rowsCount || 0;
          totalIndexedAll += rows;
          setQueuedFiles((prev) =>
            prev.map((item) =>
              item.id === q.id ? { ...item, status: 'indexed', rowsCount: rows } : item
            )
          );
        } else {
          setQueuedFiles((prev) =>
            prev.map((item) =>
              item.id === q.id
                ? { ...item, status: 'error', error: data.error || 'Failed to index' }
                : item
            )
          );
        }
      } catch (err: any) {
        setQueuedFiles((prev) =>
          prev.map((item) =>
            item.id === q.id
              ? { ...item, status: 'error', error: err.message || 'Upload failed' }
              : item
          )
        );
      }
    }

    setIsBatchUploading(false);
    setBatchUploadProgress(null);
    setFormMessage({
      type: successFiles > 0 ? 'success' : 'error',
      text: `Batch upload complete! Indexed ${totalIndexedAll.toLocaleString()} customer records across ${successFiles} file${
        successFiles === 1 ? '' : 's'
      }.`,
    });
    await fetchSheetsAndLogs();
  };

  // Sync single sheet
  const handleSyncSheet = async (sheetId: string) => {
    setSyncingSheetId(sheetId);
    setFormMessage(null);
    try {
      const res = await fetch(`/api/mis/sheets/${sheetId}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setFormMessage({
          type: 'error',
          text: data.error || 'Failed to synchronize spreadsheet.',
        });
      } else {
        setFormMessage({
          type: 'success',
          text: data.message || 'Sheet synchronized successfully.',
        });
      }
      await fetchSheetsAndLogs();
    } catch (err: any) {
      setFormMessage({
        type: 'error',
        text: err.message || 'Synchronization request failed.',
      });
      await fetchSheetsAndLogs();
    } finally {
      setSyncingSheetId(null);
    }
  };

  // Disconnect sheet
  const handleInitiateDisconnect = (sheet: ConnectedSheetItem) => {
    setSheetToDelete(sheet);
  };

  const handleConfirmDisconnect = async () => {
    if (!sheetToDelete) return;
    const target = sheetToDelete;
    setIsDeleting(true);
    setDeletingSheetId(target.id);
    setFormMessage(null);

    try {
      const res = await fetch(`/api/mis/sheets/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setFormMessage({
          type: 'error',
          text: data.error || `Failed to disconnect spreadsheet "${target.name}".`,
        });
      } else {
        setFormMessage({
          type: 'success',
          text: data.message || `Spreadsheet "${target.name}" disconnected and unlinked successfully.`,
        });
        setSheetToDelete(null);
        await fetchSheetsAndLogs();
      }
    } catch (err: any) {
      setFormMessage({
        type: 'error',
        text: err.message || `Failed to disconnect spreadsheet "${target.name}".`,
      });
    } finally {
      setIsDeleting(false);
      setDeletingSheetId(null);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    setFormMessage(null);
    try {
      const res = await fetch('/api/mis/sheets/sync-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setFormMessage({
          type: 'error',
          text: data.error || 'Some sheets failed to synchronize.',
        });
      } else {
        setFormMessage({
          type: 'success',
          text: data.message || 'All connected sheets processed.',
        });
      }
      await fetchSheetsAndLogs();
    } catch (err: any) {
      setFormMessage({
        type: 'error',
        text: err.message || 'Sync all request failed.',
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  // ================= PRIORITY RE-ORDERING LOGIC =================
  const movePriority = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === prioritySheets.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newItems = [...prioritySheets];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // Re-index ranks
    const reindexed = newItems.map((s, idx) => ({ ...s, priorityRank: idx + 1 }));
    setPrioritySheets(reindexed);
    setPrioritySuccessMsg('Priorities adjusted locally. Click "Save Priorities" to apply changes.');
  };

  const setSheetRank = (sheetId: string, targetRank: number) => {
    const idx = prioritySheets.findIndex((s) => s.id === sheetId);
    if (idx === -1) return;
    const item = prioritySheets[idx];
    const remaining = prioritySheets.filter((s) => s.id !== sheetId);
    const clampedIndex = Math.max(0, Math.min(remaining.length, targetRank - 1));
    remaining.splice(clampedIndex, 0, item);
    const reindexed = remaining.map((s, i) => ({ ...s, priorityRank: i + 1 }));
    setPrioritySheets(reindexed);
    setPrioritySuccessMsg('Priorities adjusted locally. Click "Save Priorities" to apply changes.');
  };

  const makeHighestPriority = (sheetId: string) => {
    setSheetRank(sheetId, 1);
  };

  const handleSavePriorities = async () => {
    setIsSavingPriorities(true);
    setPrioritySuccessMsg(null);
    try {
      const payload = prioritySheets.map((s, idx) => ({
        id: s.id,
        rank: idx + 1,
      }));

      const res = await fetch('/api/mis/sheet-priorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorities: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormMessage({ type: 'error', text: data.error || 'Failed to save sheet priorities.' });
      } else {
        setPrioritySuccessMsg(
          'Sheet priorities saved successfully! When records appear in multiple MIS sheets, the highest priority sheet will be chosen.'
        );
        setTimeout(() => setPrioritySuccessMsg(null), 5000);
        await fetchSheetsAndLogs();
      }
    } catch (err: any) {
      setFormMessage({ type: 'error', text: err.message || 'Failed to save sheet priorities.' });
    } finally {
      setIsSavingPriorities(false);
    }
  };

  const handleSortPriorityByRows = () => {
    const sorted = [...prioritySheets].sort((a, b) => (b.rowsCount || 0) - (a.rowsCount || 0));
    const reindexed = sorted.map((s, idx) => ({ ...s, priorityRank: idx + 1 }));
    setPrioritySheets(reindexed);
    setPrioritySuccessMsg('Ordered by highest record count. Click "Save Priorities" to persist.');
  };

  const handleResetPriorities = () => {
    const reindexed = prioritySheets.map((s, idx) => ({ ...s, priorityRank: idx + 1 }));
    setPrioritySheets(reindexed);
    setPrioritySuccessMsg('Ranks reset sequentially 1..N. Click "Save Priorities" to persist.');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-[#0A2540] to-slate-900 rounded-2xl text-white p-6 shadow-md border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              Live Google Sheets Synchronization
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-emerald-300 font-mono">Service Account Delegation</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>Google Sheets & MIS Integration Panel</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-2xl">
            Link live Google Sheets or upload multiple Excel workbooks (.xlsx, .xls, .csv). Multi-sheet files are automatically indexed for cross-sheet search and customer verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onNavigateToLookup && (
            <button
              type="button"
              onClick={onNavigateToLookup}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <UserCheck className="w-4 h-4 text-indigo-300" />
              <span>Customer Lookup</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSyncAll}
            disabled={isSyncingAll || sheets.length === 0}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
            <span>{isSyncingAll ? 'Syncing All Sheets...' : 'Sync All Sheets'}</span>
          </button>
        </div>
      </div>

      {/* Service Account Delegation Instruction Box */}
      <div className="bg-blue-50/80 border border-blue-200/90 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0 mt-0.5 shadow-xs">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-blue-900">
              Google Sheet Access Requirement
            </h4>
            <p className="text-xs text-blue-800/90 mt-0.5">
              To allow background automated syncing for restricted spreadsheets, add the system service account email below as a <strong>&quot;Viewer&quot;</strong> in your Google Sheet&apos;s <em>Share</em> settings:
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="px-2.5 py-1 rounded-lg bg-white border border-blue-300 text-blue-950 font-mono text-xs select-all">
                {serviceAccountEmail}
              </code>
              <button
                type="button"
                onClick={handleCopyEmail}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                {copiedEmail ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedEmail ? 'Copied!' : 'Copy Email'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Multiple Files & Connect Sheets Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Connect via Google Sheet URL (Single or Multiple URLs) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Link className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Connect via Google Sheet URL
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Add single link or multiple Google Sheet URLs at once
                  </span>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setUrlMode('single')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    urlMode === 'single'
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Single URL
                </button>
                <button
                  type="button"
                  onClick={() => setUrlMode('batch')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                    urlMode === 'batch'
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Files className="w-3 h-3 text-emerald-600" />
                  <span>Add Multiple</span>
                </button>
              </div>
            </div>

            {urlMode === 'single' ? (
              <form onSubmit={handleConnectSheet} className="space-y-3 mt-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Google Sheet Shareable or Edit URL
                  </label>
                  <div className="relative">
                    <Link className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      required
                      value={newSheetUrl}
                      onChange={(e) => setNewSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newSheetName}
                    onChange={(e) => setNewSheetName(e.target.value)}
                    placeholder="e.g. MIS copy 30-09"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                  />
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  * Note: In Google Sheets, make sure General Access is set to <strong>&quot;Anyone with the link can view&quot;</strong>, or upload the file directly on the right if restricted.
                </p>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isConnecting || !newSheetUrl.trim()}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm shadow-emerald-500/20"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Connecting &amp; Indexing...</span>
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Connect &amp; Index</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 mt-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Paste Multiple Google Sheet URLs (One per line)
                  </label>
                  <textarea
                    rows={4}
                    value={batchUrlsText}
                    onChange={(e) => setBatchUrlsText(e.target.value)}
                    placeholder={`https://docs.google.com/spreadsheets/d/1abc.../edit\nhttps://docs.google.com/spreadsheets/d/2xyz.../edit\nhttps://docs.google.com/spreadsheets/d/3mno.../edit`}
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition resize-none leading-relaxed"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Paste 2, 5, or 10 Google Sheet URLs at once. Each link will be synced into the customer registry.
                  </span>
                </div>

                {batchConnectProgress && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1.5 animate-pulse">
                    <div className="flex items-center justify-between font-bold text-emerald-900">
                      <span>
                        Connecting sheet {batchConnectProgress.current} of{' '}
                        {batchConnectProgress.total}...
                      </span>
                      <span>
                        {Math.round(
                          (batchConnectProgress.current / batchConnectProgress.total) * 100
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-600 h-full transition-all duration-300"
                        style={{
                          width: `${(batchConnectProgress.current / batchConnectProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-emerald-700 font-mono truncate">
                      {batchConnectProgress.currentUrl}
                    </p>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleBatchConnectSheets}
                    disabled={isConnecting || !batchUrlsText.trim()}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm shadow-emerald-500/20"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing Multiple Sheets...</span>
                      </>
                    ) : (
                      <>
                        <Files className="w-4 h-4" />
                        <span>Connect All URLs at Once</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Direct Excel / CSV File Upload (Multiple Files at once) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFiles(true);
          }}
          onDragLeave={() => setIsDraggingFiles(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingFiles(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleQueueFiles(e.dataTransfer.files);
            }
          }}
          className={`rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all ${
            isDraggingFiles
              ? 'bg-indigo-100/80 border-indigo-500 ring-2 ring-indigo-400'
              : 'bg-gradient-to-br from-indigo-50/70 to-blue-50/50 border-indigo-200/90'
          }`}
        >
          <div>
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Direct File Upload (Excel Form)
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Upload multiple .xlsx, .xls, or .csv files at once
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                Multi-File Support
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mt-3">
              Have private workbooks or multiple downloaded sheets? Select or drag &amp; drop multiple files at once. Every tab and phone number will be parsed and indexed!
            </p>

            {/* Hidden multi-file input */}
            <input
              type="file"
              ref={multiFileInputRef}
              accept=".xlsx,.xls,.csv"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleQueueFiles(e.target.files);
                }
              }}
            />

            {/* Hidden single-file fallback */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />

            {/* Dropzone & Selector */}
            <div className="mt-3.5">
              <div
                onClick={() => multiFileInputRef.current?.click()}
                className="p-4 rounded-xl border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-white/70 hover:bg-white transition cursor-pointer text-center space-y-1.5"
              >
                <Upload className="w-6 h-6 text-indigo-600 mx-auto" />
                <div className="text-xs font-bold text-indigo-900">
                  Click to select multiple files or drag &amp; drop here
                </div>
                <div className="text-[10px] text-slate-500">
                  Select 1, 5, 10 or more .xlsx, .xls, or .csv files simultaneously
                </div>
              </div>
            </div>

            {/* Queued Files Preview Tray */}
            {queuedFiles.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-white border border-indigo-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Files className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Queued Files ({queuedFiles.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleClearQueuedFiles}
                    disabled={isBatchUploading}
                    className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {queuedFiles.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-bold text-slate-800 truncate text-[11px]" title={q.name}>
                          {q.name}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                          ({q.sizeFormatted})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {q.status === 'uploading' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Indexing...</span>
                          </span>
                        )}
                        {q.status === 'indexed' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{q.rowsCount?.toLocaleString()} rows</span>
                          </span>
                        )}
                        {q.status === 'error' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">
                            Failed
                          </span>
                        )}
                        {q.status === 'queued' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQueuedFile(q.id)}
                            className="p-1 hover:text-rose-600 text-slate-400 cursor-pointer"
                            title="Remove file"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {batchUploadProgress && (
                  <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-indigo-950 text-[11px]">
                      <span>
                        Processing file {batchUploadProgress.current} of{' '}
                        {batchUploadProgress.total}:{' '}
                        <strong className="text-indigo-700">
                          {batchUploadProgress.currentFileName}
                        </strong>
                      </span>
                      <span>
                        {Math.round(
                          (batchUploadProgress.current / batchUploadProgress.total) * 100
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-indigo-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full transition-all duration-300"
                        style={{
                          width: `${(batchUploadProgress.current / batchUploadProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="pt-1 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => multiFileInputRef.current?.click()}
                    disabled={isBatchUploading}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                  >
                    + Add More Files
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchUpload}
                    disabled={isBatchUploading || queuedFiles.every((f) => f.status === 'indexed')}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {isBatchUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading Files...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload All {queuedFiles.length} Files</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {formMessage && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-start gap-3 shadow-2xs ${
            formMessage.type === 'error'
              ? 'bg-rose-50 text-rose-900 border border-rose-200'
              : formMessage.type === 'info'
              ? 'bg-amber-50 text-amber-900 border border-amber-200'
              : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-current" />
          <div className="flex-1">
            <p className="font-semibold">{formMessage.text}</p>
          </div>
        </div>
      )}

      {/* ================= PRIORITY SECTION FOR SHEETS ================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50/50 via-slate-50/50 to-indigo-50/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs shrink-0 mt-0.5">
              <Crown className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  MIS Sheets Priority &amp; Deduplication Hierarchy
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  Deduplication Resolution
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                When a customer or phone number is present in multiple MIS sheets, the system selects and displays the record from the file with the <strong>highest priority (Rank #1 &gt; Rank #2 &gt; Rank #3...)</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSortPriorityByRows}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              title="Order priority by largest record count"
            >
              Sort by Rows
            </button>
            <button
              type="button"
              onClick={handleResetPriorities}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              title="Reset priority ranking 1 to N"
            >
              Reset 1..N
            </button>
            <button
              type="button"
              onClick={handleSavePriorities}
              disabled={isSavingPriorities || prioritySheets.length === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs transition-all flex items-center gap-2 shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
            >
              {isSavingPriorities ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Priorities</span>
                </>
              )}
            </button>
          </div>
        </div>

        {prioritySuccessMsg && (
          <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{prioritySuccessMsg}</span>
          </div>
        )}

        {prioritySheets.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p className="font-semibold text-xs">No sheets available to configure priority.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Connect a Google Sheet or upload an Excel file above to set priority.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {/* Live Example Box */}
            {prioritySheets.length >= 2 && (
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 text-amber-950 text-xs flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-[11px] leading-relaxed">
                  <strong>Active Resolution Rule:</strong> If customer lead exists in both{' '}
                  <strong className="text-amber-900">&quot;{prioritySheets[0].name}&quot;</strong> (Priority #1) and{' '}
                  <strong className="text-amber-900">&quot;{prioritySheets[1].name}&quot;</strong> (Priority #2), Customer Lookup will automatically choose the record from{' '}
                  <strong className="text-amber-950">&quot;{prioritySheets[0].name}&quot;</strong> as the primary master match.
                </p>
              </div>
            )}

            {/* List of priority cards */}
            <div className="space-y-2">
              {prioritySheets.map((sheet, index) => {
                const rank = index + 1;
                const isFirst = index === 0;
                const isLast = index === prioritySheets.length - 1;

                return (
                  <div
                    key={sheet.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border transition-all gap-3 ${
                      rank === 1
                        ? 'bg-gradient-to-r from-amber-50/80 to-amber-100/40 border-amber-300/90 shadow-xs'
                        : rank === 2
                        ? 'bg-gradient-to-r from-indigo-50/60 to-slate-50 border-indigo-200/80'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Priority Rank Badge */}
                      <div className="shrink-0">
                        {rank === 1 ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-xs">
                            <Crown className="w-3.5 h-3.5 text-amber-100" />
                            <span>Rank #1 (Highest Priority)</span>
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Star className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Rank #2</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            <span>Rank #{rank}</span>
                          </span>
                        )}
                      </div>

                      {/* Sheet Name & Metadata */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-bold text-slate-900 truncate">
                            {sheet.name}
                          </strong>
                          {sheet.url.startsWith('local://') ? (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold shrink-0">
                              Uploaded Excel File
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold shrink-0">
                              Live Google Sheet
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-mono">
                          <span>{sheet.rowsCount.toLocaleString()} indexed rows</span>
                          <span>•</span>
                          <span>{sheet.sheetNames.length} tabs</span>
                        </div>
                      </div>
                    </div>

                    {/* Up / Down & Quick Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {!isFirst && (
                        <button
                          type="button"
                          onClick={() => makeHighestPriority(sheet.id)}
                          className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1"
                          title="Promote to Rank #1 Highest Priority"
                        >
                          <Crown className="w-3 h-3 text-amber-600" />
                          <span>Make #1</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => movePriority(index, 'up')}
                        disabled={isFirst}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move Up in Priority"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => movePriority(index, 'down')}
                        disabled={isLast}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move Down in Priority"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Direct Rank selector */}
                      <select
                        value={rank}
                        onChange={(e) => setSheetRank(sheet.id, parseInt(e.target.value, 10))}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 cursor-pointer"
                        title="Set exact rank"
                      >
                        {prioritySheets.map((_, i) => (
                          <option key={i + 1} value={i + 1}>
                            Rank #{i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Connected Google Sheets Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">Connected Spreadsheets</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
              {sheets.length}
            </span>
          </div>

          <button
            type="button"
            onClick={fetchSheetsAndLogs}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            title="Reload sheets"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {sheets.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-sm text-slate-600">No Google Sheets connected yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Paste a Google Sheet URL above or upload Excel files directly to stream their tabs into the customer verification and search index.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Hidden file input for uploading .xlsx directly to a specific connected sheet */}
            <input
              ref={targetSheetFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && selectedTargetSheetId) {
                  handleFileUpload(file, selectedTargetSheetId);
                }
              }}
            />

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Priority Rank</th>
                  <th className="py-3 px-4">Spreadsheet Name</th>
                  <th className="py-3 px-4">Sheet Tabs</th>
                  <th className="py-3 px-4">Rows Count</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Synced</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sheets.map((sheet, idx) => {
                  const isSyncingThis = syncingSheetId === sheet.id;
                  const date = sheet.lastSyncedAt ? new Date(sheet.lastSyncedAt) : null;
                  const formattedDate = date && !isNaN(date.getTime()) ? date.toLocaleString() : 'Never';
                  const hasErrorOrRestricted =
                    sheet.status === 'error' || sheet.status === 'restricted' || sheet.status === 'pending';
                  const pRank = sheet.priorityRank || idx + 1;

                  return (
                    <React.Fragment key={sheet.id}>
                      <tr
                        className={`transition-colors ${
                          hasErrorOrRestricted
                            ? 'bg-rose-50/20 hover:bg-rose-50/40'
                            : 'hover:bg-slate-50/60'
                        }`}
                      >
                        {/* Priority Rank column */}
                        <td className="py-3.5 px-4">
                          {pRank === 1 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-2xs">
                              <Crown className="w-3 h-3 text-amber-200" />
                              <span>#1 Highest</span>
                            </span>
                          ) : pRank === 2 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Star className="w-3 h-3 text-indigo-500" />
                              <span>#2 High</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              #{pRank}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{sheet.name}</span>
                            {sheet.url.startsWith('local://') ? (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold">
                                Uploaded File
                              </span>
                            ) : (
                              <a
                                href={sheet.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-blue-600 p-0.5 inline-flex items-center gap-0.5"
                                title="Open Google Sheet in new tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 block truncate max-w-xs">
                            {sheet.spreadsheetId}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1.5 max-w-sm">
                            {sheet.tabDetails && sheet.tabDetails.length > 0 ? (
                              sheet.tabDetails.map((tab, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px] font-mono border border-blue-200/90 shadow-2xs font-semibold"
                                  title={`Worksheet Tab: "${tab.name}" • ${tab.rows.toLocaleString()} rows indexed • ${tab.phones || 0} phones`}
                                >
                                  <span>{tab.name}</span>
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-blue-200/70 text-blue-900 font-extrabold">
                                    {tab.rows.toLocaleString()} rows
                                  </span>
                                </span>
                              ))
                            ) : (
                              sheet.sheetNames.map((s, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono border border-slate-200"
                                >
                                  {s}
                                </span>
                              ))
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                          {sheet.rowsCount.toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                sheet.status === 'synced'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : sheet.status === 'restricted' || sheet.status === 'pending'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  sheet.status === 'synced'
                                    ? 'bg-emerald-500'
                                    : sheet.status === 'restricted' || sheet.status === 'pending'
                                    ? 'bg-amber-500 animate-pulse'
                                    : 'bg-rose-500'
                                }`}
                              />
                              {sheet.status === 'synced'
                                ? 'Synchronized'
                                : sheet.status === 'restricted'
                                ? 'Private / Needs Access'
                                : sheet.status === 'pending'
                                ? 'Awaiting Access'
                                : 'Sync Error'}
                            </span>

                            {hasErrorOrRestricted && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTargetSheetId(sheet.id);
                                  targetSheetFileInputRef.current?.click();
                                }}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer flex items-center gap-1 mt-0.5"
                                title="Import .xlsx directly into this sheet entry"
                              >
                                <Upload className="w-3 h-3" />
                                <span>Upload .xlsx directly</span>
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                          {formattedDate}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedSheetForInspection(sheet)}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition cursor-pointer"
                              title="Inspect all sheet tabs and row breakdown"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-600" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSyncSheet(sheet.id)}
                              disabled={isSyncingThis}
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                              title="Sync This Sheet"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin' : ''}`} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleInitiateDisconnect(sheet)}
                              disabled={deletingSheetId === sheet.id}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition cursor-pointer disabled:opacity-50"
                              title="Disconnect & Delete Sheet"
                            >
                              {deletingSheetId === sheet.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline Diagnostic & Fix Card when sheet has sync error or restricted permission */}
                      {hasErrorOrRestricted && (
                        <tr className="bg-amber-50/50 border-b border-amber-200/60">
                          <td colSpan={7} className="py-3 px-4">
                            <div className="bg-white rounded-xl border border-amber-200 p-3.5 shadow-2xs space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5">
                                  <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 shrink-0 mt-0.5">
                                    <AlertTriangle className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                      <span>Why did this sheet fail to sync?</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                        Google Sheet is Private (HTTP 401 Unauthorized)
                                      </span>
                                    </h4>
                                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                                      Google blocked the automated download because this spreadsheet is set to <strong>&quot;Restricted&quot;</strong> in Google Drive. External servers cannot read or export private spreadsheets without view permissions.
                                    </p>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTargetSheetId(sheet.id);
                                    targetSheetFileInputRef.current?.click();
                                  }}
                                  className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Upload .xlsx Directly</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 text-[11px]">
                                <div className="p-2.5 rounded-lg bg-blue-50/80 border border-blue-200/80">
                                  <strong className="text-blue-950 font-bold block mb-1">
                                    Option 1: Fix Permissions in Google Sheets (Recommended)
                                  </strong>
                                  <ol className="list-decimal list-inside space-y-0.5 text-blue-900/90 text-[11px]">
                                    <li>
                                      <a
                                        href={sheet.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-bold underline text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                                      >
                                        <span>Open &quot;{sheet.name}&quot; in Google Sheets</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </li>
                                    <li>Click the blue <strong>&quot;Share&quot;</strong> button in top-right.</li>
                                    <li>Under <em>General access</em>, change <strong>&quot;Restricted&quot;</strong> to <strong>&quot;Anyone with the link&quot; (Viewer)</strong>.</li>
                                    <li>
                                      Come back and click{' '}
                                      <button
                                        type="button"
                                        onClick={() => handleSyncSheet(sheet.id)}
                                        disabled={isSyncingThis}
                                        className="font-bold text-blue-700 underline cursor-pointer"
                                      >
                                        Retry Sync
                                      </button>
                                      .
                                    </li>
                                  </ol>
                                </div>

                                <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200/80">
                                  <strong className="text-emerald-950 font-bold block mb-1">
                                    Option 2: Direct Upload (No Public Permissions Needed)
                                  </strong>
                                  <p className="text-emerald-900/90 text-[11px] mb-1.5">
                                    In your Google Sheet, click <em>File → Download → Microsoft Excel (.xlsx)</em>.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedTargetSheetId(sheet.id);
                                      targetSheetFileInputRef.current?.click();
                                    }}
                                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                                  >
                                    <Upload className="w-3 h-3" />
                                    <span>Select Downloaded .xlsx File</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sync Activity Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <span>Recent MIS Synchronization Logs</span>
        </h3>

        {logs.length === 0 ? (
          <p className="text-xs text-slate-400">No sync events recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {logs.slice(0, 15).map((log) => {
              const date = new Date(log.timestamp);
              const formatted = !isNaN(date.getTime()) ? date.toLocaleTimeString() : log.timestamp;
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 text-xs border border-slate-100 hover:bg-slate-100/60 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        log.status === 'success'
                          ? 'bg-emerald-500'
                          : log.status === 'pending'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                    />
                    <strong className="text-slate-700 font-bold shrink-0">{log.sheetName}:</strong>
                    <span className="text-slate-600 truncate">{log.message}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">{formatted}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sheet Tabs & Rows Inspection Modal */}
      {selectedSheetForInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {selectedSheetForInspection.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5 truncate max-w-md">
                    {selectedSheetForInspection.spreadsheetId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSheetForInspection(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  All Worksheet Tabs in this Workbook ({selectedSheetForInspection.sheetNames.length})
                </span>
                <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  Total Indexed: {selectedSheetForInspection.rowsCount.toLocaleString()} rows
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Worksheet Tab Name</th>
                      <th className="py-2.5 px-4">Rows with Data</th>
                      <th className="py-2.5 px-4">Phone Numbers</th>
                      <th className="py-2.5 px-4">Sync Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedSheetForInspection.tabDetails && selectedSheetForInspection.tabDetails.length > 0 ? (
                      selectedSheetForInspection.tabDetails.map((tab, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-800 flex items-center gap-1.5 font-mono">
                            <Table className="w-3.5 h-3.5 text-blue-500" />
                            <span>{tab.name}</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            {tab.rows.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-emerald-700 font-semibold">
                            {(tab.phones || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Indexed</span>
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      selectedSheetForInspection.sheetNames.map((name, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-800 flex items-center gap-1.5 font-mono">
                            <Table className="w-3.5 h-3.5 text-blue-500" />
                            <span>{name}</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            {selectedSheetForInspection.rowsCount.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">—</td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <span>Ready</span>
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-400 font-medium">
                Every row containing customer records or numbers is indexed into search.
              </span>
              <div className="flex items-center gap-2">
                {onNavigateToLookup && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSheetForInspection(null);
                      onNavigateToLookup();
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm shadow-indigo-600/20"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Search in Customer Lookup</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedSheetForInspection(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Sheet In-App Confirmation Modal */}
      {sheetToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black text-slate-900">
                  Disconnect Spreadsheet?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Are you sure you want to disconnect <strong className="text-slate-800">{sheetToDelete.name}</strong>?
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-semibold text-slate-500">Spreadsheet ID:</span>
                <span className="font-mono text-[11px] truncate max-w-[200px]" title={sheetToDelete.spreadsheetId}>
                  {sheetToDelete.spreadsheetId}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-semibold text-slate-500">Cached Records:</span>
                <span className="font-mono font-bold text-slate-800">
                  {sheetToDelete.rowsCount.toLocaleString()} rows
                </span>
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/80 p-2 rounded-xl mt-2 font-medium">
                All {sheetToDelete.rowsCount.toLocaleString()} indexed customer records from this sheet will be removed and unlinked from the database.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setSheetToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Disconnecting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Disconnect &amp; Delete</span>
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
