import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCheck,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Eye,
  Filter,
  Layers,
  Sparkles,
  RefreshCw,
  Sliders,
  Award,
  X,
} from 'lucide-react';
import { BatchLookupResultItem, BatchLookupSummary, LeadPriorityRule } from '../types';
import { PriorityConfigModal } from './PriorityConfigModal';
import { extractMonthYearLabel } from '../utils/dateHelper';

interface BatchExcelSearchProps {
  onViewRecord: (id: number) => void;
  onPreviewSheet: (fileId: string, sheetName: string) => void;
  onLookupCustomer?: (phone: string) => void;
}

export const BatchExcelSearch: React.FC<BatchExcelSearchProps> = ({
  onViewRecord,
  onPreviewSheet,
  onLookupCustomer,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [extractedPhones, setExtractedPhones] = useState<{ rawPhone: string; originalData?: Record<string, any> }[]>([]);
  
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [results, setResults] = useState<BatchLookupResultItem[]>([]);
  const [summary, setSummary] = useState<BatchLookupSummary | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'found' | 'not_found'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [tableSearch, setTableSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [isPriorityModalOpen, setIsPriorityModalOpen] = useState(false);
  const [activeRules, setActiveRules] = useState<LeadPriorityRule[]>([]);
  const [includePivotSheet, setIncludePivotSheet] = useState(true);
  const [pivotSheetTitle, setPivotSheetTitle] = useState(() => {
    const d = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} Login`;
  });
  const [useHeaderAsSheetName, setUseHeaderAsSheetName] = useState(true);
  const [splitByMonth, setSplitByMonth] = useState(false);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');
  const [isEditingPivotTitle, setIsEditingPivotTitle] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load priority rules on mount
  useEffect(() => {
    fetch('/api/priority-rules')
      .then(res => res.json())
      .then(data => {
        if (data.rules) setActiveRules(data.rules);
      })
      .catch(console.error);
  }, []);

  // Helper to detect true header row index in rawJson
  const detectHeaderRow = (rows: any[][]): number => {
    let bestIndex = 0;
    let maxScore = -1;
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r];
      if (!row || !Array.isArray(row)) continue;
      let textCount = 0;
      let kwHits = 0;
      row.forEach(cell => {
        if (cell === null || cell === undefined) return;
        const s = String(cell).trim();
        if (s.length > 0) {
          textCount++;
          if (/name|phone|mob|contact|pan|aadhar|date|address|city|state|status|amount|email|sr|no/i.test(s)) {
            kwHits++;
          }
        }
      });
      const score = textCount + (kwHits * 2);
      if (score > maxScore && textCount >= 2) {
        maxScore = score;
        bestIndex = r;
      }
    }
    return bestIndex;
  };

  // Helper to find the best phone column by scanning actual row cell values
  const detectBestPhoneColumn = (headers: string[], dataRows: any[][]): string => {
    const scores = new Array(headers.length).fill(0);
    const testRows = dataRows.slice(0, 30);

    testRows.forEach(row => {
      if (!row) return;
      headers.forEach((_, cIdx) => {
        const val = row[cIdx];
        if (val !== undefined && val !== null) {
          const s = String(val).trim();
          let digits = s.replace(/\D/g, '');
          if (/^\d+(?:\.\d+)?[eE]\+?\d+$/.test(s)) {
            const num = Number(s);
            if (!isNaN(num)) digits = Math.floor(num).toString().replace(/\D/g, '');
          }
          if (digits.length === 10 && /^[5-9]\d{9}$/.test(digits)) {
            scores[cIdx] += 4;
          } else if ((digits.length === 11 || digits.length === 12) && /^[5-9]\d{9}$/.test(digits.slice(-10))) {
            scores[cIdx] += 3;
          }
        }
      });
    });

    // Semantic header bonus/penalty
    headers.forEach((h, cIdx) => {
      const nh = h.toLowerCase().replace(/[\s_\-.]+/g, '');
      if (/phone|mobile|contact|calling|cell|mob|custphone/i.test(nh)) {
        scores[cIdx] += 6;
      }
      if (/serial|srno|sno|account|accno|loanno|appno|token|refno|pincode|zip|amount/i.test(nh)) {
        scores[cIdx] -= 10;
      }
    });

    let bestIdx = 0;
    let highestScore = -999;
    scores.forEach((sc, idx) => {
      if (sc > highestScore) {
        highestScore = sc;
        bestIdx = idx;
      }
    });

    return headers[bestIdx] || headers[0];
  };

  const processWorksheet = (worksheet: any) => {
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];
    if (!jsonData || jsonData.length === 0) {
      setAvailableColumns([]);
      setExtractedPhones([]);
      return;
    }

    const headerIdx = detectHeaderRow(jsonData);
    const headers = (jsonData[headerIdx] || []).map((h: any, i: number) => String(h || `Column_${i + 1}`).trim());
    setAvailableColumns(headers);

    const dataRows = jsonData.slice(headerIdx + 1);
    const detectedCol = detectBestPhoneColumn(headers, dataRows);
    setSelectedColumn(detectedCol);

    extractPhonesForColumn(jsonData, headers, detectedCol, headerIdx);
  };

  // Parse uploaded file client-side using SheetJS
  const handleFileUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setFileName(uploadedFile.name);
    setIsProcessingFile(true);
    setResults([]);
    setSummary(null);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetNames = workbook.SheetNames || [];
      setAvailableSheets(sheetNames);

      const activeSheet = sheetNames[0] || 'Sheet1';
      setSelectedSheet(activeSheet);

      const worksheet = workbook.Sheets[activeSheet];
      if (!worksheet) {
        setErrorMessage('Could not find active worksheet in the uploaded file.');
        setIsProcessingFile(false);
        return;
      }

      processWorksheet(worksheet);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setErrorMessage(`Error reading Excel file: ${err.message}`);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleSheetChange = async (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const worksheet = workbook.Sheets[sheetName];
      if (worksheet) {
        processWorksheet(worksheet);
      }
    } catch (err: any) {
      console.error('Sheet switch error:', err);
    }
  };

  const extractPhonesForColumn = (data: any[][], headers: string[], colName: string, headerRowIndex: number = 0) => {
    const colIndex = headers.indexOf(colName);
    if (colIndex === -1) return;

    const phones: { rawPhone: string; originalData?: Record<string, any> }[] = [];
    for (let r = headerRowIndex + 1; r < data.length; r++) {
      const row = data[r];
      if (!row || row.length === 0 || !row.some(cell => String(cell || '').trim().length > 0)) continue;

      const rawVal = row[colIndex];
      if (rawVal !== undefined && rawVal !== null) {
        let strVal = String(rawVal).trim();
        // Handle scientific notation
        if (/^\d+(?:\.\d+)?[eE]\+?\d+$/.test(strVal)) {
          const num = Number(strVal);
          if (!isNaN(num)) strVal = Math.floor(num).toString();
        } else if (/^\d+\.0+$/.test(strVal)) {
          strVal = strVal.split('.')[0];
        }

        if (strVal && !['none', 'null', 'nan', 'n/a', 'na', '-', '--', '0', '#n/a'].includes(strVal.toLowerCase())) {
          const rowObj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = row[idx] !== undefined ? row[idx] : '';
          });
          phones.push({
            rawPhone: strVal,
            originalData: rowObj,
          });
        }
      }
    }
    setExtractedPhones(phones);
  };

  const handleColumnChange = (newCol: string) => {
    setSelectedColumn(newCol);
    if (!file) return;
    file.arrayBuffer().then(buffer => {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = selectedSheet || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return;

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];
      const headerIdx = detectHeaderRow(jsonData);
      const headers = (jsonData[headerIdx] || []).map((h: any, i: number) => String(h || `Column_${i + 1}`).trim());
      extractPhonesForColumn(jsonData, headers, newCol, headerIdx);
    });
  };

  // Run the batch search against the indexed database across all files
  const executeBatchSearch = async () => {
    if (extractedPhones.length === 0) {
      setErrorMessage('No phone numbers found to search.');
      return;
    }

    setIsSearching(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/batch-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneList: extractedPhones }),
      });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setSummary(data.summary);
      }
    } catch (err: any) {
      console.error('Batch lookup failed:', err);
      setErrorMessage(`Search failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Load a built-in sample file for 1-click testing
  const loadSamplePhoneList = () => {
    const samplePhones = [
      { rawPhone: '7661056716', originalData: { 'Customer Name': 'Dr Beeraveli Sruthisri', Category: 'F2 Leads P1 (MAY)' } },
      { rawPhone: '9987301521', originalData: { 'Customer Name': 'Dr Neeraj S Zambare', Category: 'F2 Leads P2 (MAY)' } },
      { rawPhone: '9001705008', originalData: { 'Customer Name': 'Dr Shakti Bhanu', Category: 'F2 Leads P1 (JAN)' } },
      { rawPhone: '9001361456', originalData: { 'Customer Name': 'Mr Sumit Garg', Category: 'F2 Leads P5 (JAN)' } },
      { rawPhone: '9985132111', originalData: { 'Customer Name': 'Srilehya', Category: 'NEET 2015' } },
      { rawPhone: '9002155938', originalData: { 'Customer Name': 'Pallabi Tiwari', Category: 'Fresh Data 21k' } },
      { rawPhone: '9677381869', originalData: { 'Customer Name': 'Krishna Prabha', Category: 'Fresh Data 30k' } },
      { rawPhone: '6000015199', originalData: { 'Customer Name': 'Multi-Match Lead', Category: 'LOT + NEET + Tata Points' } },
      { rawPhone: '6000282763', originalData: { 'Customer Name': 'Tata & Login Match', Category: 'Tata Points + Login' } },
      { rawPhone: '8657184019', originalData: { 'Customer Name': 'Aftab Alam', Category: 'LOGIN (May)' } },
      { rawPhone: '8096452615', originalData: { 'Customer Name': 'Y Reddy', Category: 'ICIC LOGIN' } },
      { rawPhone: '8857880631', originalData: { 'Customer Name': 'Deelip Balu', Category: 'LOT (Lot 1)' } },
      { rawPhone: '9868368069', originalData: { 'Customer Name': 'Aarushi', Category: 'Consolidated Directory' } },
      { rawPhone: '1111111111', originalData: { 'Customer Name': 'Unknown Lead', Category: 'Not Found' } },
    ];
    setFileName('Priority_Verification_Leads_List.xlsx');
    setAvailableColumns(['Phone Number', 'Customer Name', 'Category']);
    setSelectedColumn('Phone Number');
    setExtractedPhones(samplePhones);
    setResults([]);
    setSummary(null);
  };

  // When rules are updated via modal, refresh activeRules & re-execute search if active
  const handleRulesUpdated = (updatedRules: LeadPriorityRule[]) => {
    setActiveRules(updatedRules);
    if (extractedPhones.length > 0) {
      executeBatchSearch();
    }
  };

  // Detect distinct months present in the search results
  const detectedMonths = React.useMemo(() => {
    if (results.length === 0) return [];
    const monthCounts = new Map<string, number>();
    results.forEach(r => {
      const hint = (r as any).date || r.login || r.sheetsName || r.priority || r.workbookNames;
      const m = extractMonthYearLabel(hint);
      monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
    });
    return Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => b.count - a.count);
  }, [results]);

  // Calculate Pivot Table Summary data matching user's Image 2
  const pivotSummaryData = React.useMemo(() => {
    if (results.length === 0) return null;
    const priorityMap: Record<string, number> = {};
    let blanksCount = 0;
    let totalCount = 0;

    results.forEach(r => {
      if (selectedMonthFilter !== 'all') {
        const hint = (r as any).date || r.login || r.sheetsName || r.priority || r.workbookNames;
        const rowMonth = extractMonthYearLabel(hint);
        if (rowMonth !== selectedMonthFilter) return;
      }

      totalCount++;
      const prio = (r.priority || '').trim();
      if (!r.found || !prio || prio === 'Not Found' || prio === '—') {
        blanksCount++;
      } else {
        priorityMap[prio] = (priorityMap[prio] || 0) + 1;
      }
    });

    const items = Object.entries(priorityMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return {
      items,
      blanksCount,
      grandTotal: totalCount,
    };
  }, [results, selectedMonthFilter]);

  // Export results as Excel (.xlsx) or CSV
  const handleExport = async (format: 'xlsx' | 'csv') => {
    if (results.length === 0) return;
    setIsExporting(true);
    try {
      const res = await fetch('/api/export-batch-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results,
          format,
          includePivot: includePivotSheet,
          pivotTitle: pivotSheetTitle,
          useHeaderAsSheetName,
          splitByMonth,
        }),
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Phone_Sheets_Lookup_Result_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  // Filter results for preview table
  const filteredResults = results.filter(item => {
    if (filterMode === 'found' && !item.found) return false;
    if (filterMode === 'not_found' && item.found) return false;
    if (priorityFilter !== 'all') {
      if (
        item.priorityCategory !== priorityFilter &&
        item.priority !== priorityFilter &&
        !item.priority?.toLowerCase().includes(priorityFilter.toLowerCase())
      ) {
        return false;
      }
    }
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      return (
        item.inputPhone.toLowerCase().includes(q) ||
        (item.priority && item.priority.toLowerCase().includes(q)) ||
        item.sheetsName.toLowerCase().includes(q) ||
        item.workbookNames.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleRowExpansion = (idx: number) => {
    setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="space-y-6">
      {/* Top Description & Upload Box */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Bulk Excel Verification</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Upload Excel &amp; Match Sheets Across All Workbooks
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Upload any Excel or CSV file with phone numbers. The system will search all 885,000+ indexed records across every worksheet and generate a downloadable report showing which sheet contains each phone number.
            </p>
          </div>

          <button
            type="button"
            onClick={loadSamplePhoneList}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-emerald-400 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer shrink-0"
          >
            <span>Load Sample Phone List (1-Click)</span>
          </button>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Drag and Drop Upload Area */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
          className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 bg-slate-950/60 hover:bg-slate-900/50 rounded-2xl p-8 text-center cursor-pointer transition-all group"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />

          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Upload className="w-6 h-6" />
          </div>

          {fileName ? (
            <div className="space-y-1">
              <div className="text-sm font-bold text-white flex items-center justify-center gap-2 font-mono">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>{fileName}</span>
              </div>
              <p className="text-xs text-slate-400">
                Extracted <strong className="text-emerald-400">{extractedPhones.length.toLocaleString()}</strong> phone numbers. Click to replace file.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-sm font-bold text-slate-200">
                Click to browse or drag &amp; drop your Excel file here
              </div>
              <p className="text-xs text-slate-500">
                Supports .xlsx, .xlsm, .xls, and .csv files with phone numbers
              </p>
            </div>
          )}
        </div>

        {/* Column Mapping & Search Action */}
        {extractedPhones.length > 0 && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {availableSheets.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">Sheet Tab:</span>
                    <select
                      value={selectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    >
                      {availableSheets.map((s, idx) => (
                        <option key={idx} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <span className="text-xs text-slate-400 font-mono">Phone Number Column:</span>
                <select
                  value={selectedColumn}
                  onChange={(e) => handleColumnChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                >
                  {availableColumns.map((col, idx) => (
                    <option key={idx} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                  {extractedPhones.length.toLocaleString()} records ready
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPriorityModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700/80 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                  title="Configure priority rank of all files in directory"
                >
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span>Lead Priority Rules</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 font-mono">
                    #1 F2 (P1..P5) &gt; #2 NEET &gt; #3 21k...
                  </span>
                </button>

                <button
                  onClick={executeBatchSearch}
                  disabled={isSearching}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/40 transition-all cursor-pointer"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Searching All Sheets Across Drive...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Search All Sheets Across Drive</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Default Priority: 1. F2 Leads (P1 &gt; P2 &gt; P3 &gt; P4 &gt; P5), 2. NEET (years), 3. Fresh Data 21k, 4. Fresh Data 30k, 5. Tata, 6. Login, 7. ICIC, 8. Lot, 9. Directory.</span>
              </span>
              <button
                type="button"
                onClick={() => setIsPriorityModalOpen(true)}
                className="text-amber-400 hover:text-amber-300 underline cursor-pointer"
              >
                Change Priority Order
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pivot Table Summary Card matching Image 2 & Export Controls */}
      {pivotSummaryData && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Pivot Table Summary Sheet Preview
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                    Sheet 2 in Excel Export
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Data aggregated by Priority with today's date header. Blank items represent unmatched numbers.
                </p>
              </div>
            </div>

            {/* Pivot Sheet Export Toggle & Title Editor matching user request */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-950/80 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-200 font-medium">
                <input
                  type="checkbox"
                  checked={includePivotSheet}
                  onChange={(e) => setIncludePivotSheet(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                />
                <span>Generate Pivot Summary Sheet</span>
              </label>

              {includePivotSheet && (
                <>
                  <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800 text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">Header:</span>
                    <input
                      type="text"
                      value={pivotSheetTitle}
                      onChange={(e) => setPivotSheetTitle(e.target.value)}
                      placeholder="e.g. Jan 2026"
                      className="bg-slate-900 border border-purple-500/40 rounded-md px-2.5 py-1 text-xs text-purple-200 font-bold focus:outline-none focus:border-purple-400 w-28"
                    />
                  </div>

                  {/* Option: Use Header as Sheet Tab Name */}
                  <label
                    className="flex items-center gap-1.5 pl-3 border-l border-slate-800 cursor-pointer select-none text-slate-300 hover:text-white"
                    title="Use Header text directly as the Excel Sheet Tab Name instead of 'Pivot Summary'"
                  >
                    <input
                      type="checkbox"
                      checked={useHeaderAsSheetName}
                      onChange={(e) => setUseHeaderAsSheetName(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-[11px]">Use Header as Sheet Name</span>
                    {useHeaderAsSheetName && (
                      <span className="text-[10px] bg-purple-900/60 text-purple-200 font-mono px-1.5 py-0.2 rounded border border-purple-700/50">
                        Tab: "{pivotSheetTitle || 'Summary'}"
                      </span>
                    )}
                  </label>

                  {/* Option: Generate Different Sheet for Different Months */}
                  <label
                    className={`flex items-center gap-1.5 pl-3 border-l border-slate-800 cursor-pointer select-none px-2 py-0.5 rounded transition-all ${
                      splitByMonth
                        ? 'bg-purple-950 text-purple-200 border border-purple-600 font-bold'
                        : 'text-purple-300 hover:bg-slate-900 font-medium'
                    }`}
                    title="Generate a separate sheet for each month detected in search results"
                  >
                    <input
                      type="checkbox"
                      checked={splitByMonth}
                      onChange={(e) => setSplitByMonth(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-[11px]">Generate Different Sheet for Different Months</span>
                    {detectedMonths.length > 0 && (
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 font-mono px-1.5 py-0.2 rounded">
                        {detectedMonths.length} Months
                      </span>
                    )}
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Month Selector Pills if multiple months detected */}
          {detectedMonths.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mr-1">
                Filter by Month:
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonthFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  selectedMonthFilter === 'all'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                All Months ({results.length})
              </button>
              {detectedMonths.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => {
                    setSelectedMonthFilter(selectedMonthFilter === m.month ? 'all' : m.month);
                    if (!splitByMonth) {
                      setPivotSheetTitle(m.month);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedMonthFilter === m.month
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'bg-slate-900 text-purple-300 border border-purple-500/30 hover:bg-slate-800'
                  }`}
                  title={`Click to preview ${m.month} and set header`}
                >
                  <span>{m.month}</span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-purple-950 text-purple-300">
                    {m.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Authentic Excel-styled Pivot Table Card */}
          <div className="flex flex-wrap items-start gap-6">
            <div className="w-full max-w-sm rounded-xl overflow-hidden border-2 border-purple-900/60 shadow-lg bg-white text-slate-900">
              {/* Purple Header Banner matching Image 2 */}
              <div className="bg-[#581C87] text-white text-center py-2.5 px-4 font-bold text-sm tracking-wide flex items-center justify-center gap-2">
                <span>{pivotSheetTitle || 'Login Summary'}</span>
              </div>

              {/* Data & Count Columns */}
              <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-300 text-xs font-bold text-slate-800 px-4 py-2 uppercase tracking-wider">
                <div>Data</div>
                <div className="text-right">Count</div>
              </div>

              {/* Priority Rows */}
              <div className="divide-y divide-slate-200 text-xs font-medium">
                {pivotSummaryData.items.map((item) => (
                  <div
                    key={item.name}
                    onClick={() => setPriorityFilter(priorityFilter === item.name ? 'all' : item.name)}
                    className="grid grid-cols-2 px-4 py-2 hover:bg-purple-50 transition-colors cursor-pointer group"
                    title={`Click to filter table by ${item.name}`}
                  >
                    <div className="truncate text-slate-800 font-semibold group-hover:text-purple-700">
                      {item.name}
                    </div>
                    <div className="text-right font-mono text-slate-700 font-bold">
                      {item.count.toLocaleString()}
                    </div>
                  </div>
                ))}

                {/* Blanks row (when found nothing) */}
                <div
                  onClick={() => setFilterMode(filterMode === 'not_found' ? 'all' : 'not_found')}
                  className="grid grid-cols-2 px-4 py-2 hover:bg-slate-100 transition-colors cursor-pointer group bg-slate-50/60"
                  title="Click to filter by Not Found (Blanks)"
                >
                  <div className="truncate text-slate-600 italic group-hover:text-slate-900">
                    Blanks
                  </div>
                  <div className="text-right font-mono text-slate-600 font-bold">
                    {pivotSummaryData.blanksCount.toLocaleString()}
                  </div>
                </div>

                {/* Grand Total Row */}
                <div className="grid grid-cols-2 px-4 py-2.5 bg-[#EDE9FE] font-bold text-purple-950 text-xs border-t-2 border-purple-300">
                  <div>Grand Total</div>
                  <div className="text-right font-mono font-black text-purple-900">
                    {pivotSummaryData.grandTotal.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Explanatory notes & Quick Action */}
            <div className="flex-1 min-w-[260px] space-y-3 pt-1">
              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/40 text-xs text-purple-200/90 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-purple-300">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>2-Sheet Excel Export Format</span>
                </div>
                <p className="text-[11px] text-purple-200/80 leading-relaxed">
                  When you download Excel, the workbook will contain:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-purple-300">
                  <li><strong>Sheet 1 (Phone Sheet Lookup):</strong> Complete results with phone number, priority, matching sheet, workbook, and customer details.</li>
                  <li><strong>Sheet 2 (Pivot Summary):</strong> The formatted summary table shown above with custom header <span className="font-mono font-bold text-white bg-purple-900/60 px-1.5 py-0.5 rounded">{pivotSheetTitle}</span>, priority counts, blanks, and grand total.</li>
                </ul>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleExport('xlsx')}
                  disabled={isExporting}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-700 hover:bg-purple-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Excel with Pivot Sheet (.xlsx)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary KPI Cards when search completes */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 font-mono uppercase block mb-1">Total Uploaded</span>
            <div className="text-2xl font-bold text-white font-mono">{summary.totalUploaded.toLocaleString()}</div>
            <span className="text-[11px] text-slate-500">Phone numbers processed</span>
          </div>

          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 shadow-sm bg-emerald-950/10">
            <span className="text-xs text-emerald-400 font-mono uppercase block mb-1">Found in Sheets</span>
            <div className="text-2xl font-black text-emerald-300 font-mono">{summary.totalFound.toLocaleString()}</div>
            <span className="text-[11px] text-emerald-500/80 font-medium">
              {Math.round((summary.totalFound / Math.max(1, summary.totalUploaded)) * 100)}% match rate
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 font-mono uppercase block mb-1">Not Found</span>
            <div className="text-2xl font-bold text-slate-400 font-mono">{summary.totalNotFound.toLocaleString()}</div>
            <span className="text-[11px] text-slate-500">Not present in index</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 font-mono uppercase block mb-1">Lookup Time</span>
            <div className="text-2xl font-bold text-blue-400 font-mono">{summary.durationMs}ms</div>
            <span className="text-[11px] text-slate-500">Index query speed</span>
          </div>
        </div>
      )}

      {/* Interactive Results Table Preview & Download Buttons */}
      {results.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-0">
          {/* Priority Breakdown Chips Bar */}
          <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1 font-bold">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>LEAD PRIORITY BREAKDOWN:</span>
            </span>

            <button
              onClick={() => setPriorityFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                priorityFilter === 'all'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All ({results.filter(r => r.found).length})
            </button>

            {/* List all detected priorities */}
            {Array.from(new Set(results.filter(r => r.found && r.priority && r.priority !== '—').map(r => r.priorityCategory || r.priority))).map((pCat: any) => {
              const count = results.filter(r => (r.priorityCategory === pCat || r.priority === pCat) && r.found).length;
              const isSelected = priorityFilter === pCat;
              return (
                <button
                  key={pCat}
                  onClick={() => setPriorityFilter(isSelected ? 'all' : pCat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center gap-1 border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  <span>{pCat}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded ${isSelected ? 'bg-black/20 text-slate-950' : 'bg-slate-700 text-amber-300'}`}>
                    {count}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setIsPriorityModalOpen(true)}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-mono hover:underline cursor-pointer"
            >
              <Sliders className="w-3 h-3" />
              <span>Edit Priority Hierarchy</span>
            </button>
          </div>

          {/* Table Header Controls */}
          <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-4">
            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterMode === 'all'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({results.length})
                </button>
                <button
                  onClick={() => setFilterMode('found')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterMode === 'found'
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Found ({summary?.totalFound || 0})</span>
                </button>
                <button
                  onClick={() => setFilterMode('not_found')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterMode === 'not_found'
                      ? 'bg-slate-800 text-slate-300 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Not Found ({summary?.totalNotFound || 0})
                </button>
              </div>

              {/* Priority Select */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                <span className="text-xs text-amber-400 font-mono font-bold">Priority:</span>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 font-mono focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-slate-900 text-slate-200">All Priorities</option>
                  {activeRules.map(r => (
                    <option key={r.id} value={r.name} className="bg-slate-900 text-slate-200">
                      #{r.rank} {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick search input */}
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter preview rows..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport('xlsx')}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-900/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Downloadable Excel (.xlsx)</span>
              </button>

              <button
                onClick={() => handleExport('csv')}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Download CSV</span>
              </button>
            </div>
          </div>

          {/* Spreadsheet Table View */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/70 text-slate-300 uppercase font-mono text-[11px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-3 font-bold text-white">Phone Number</th>
                  <th className="py-3 px-3 font-bold text-amber-300">Priority</th>
                  <th className="py-3 px-3 font-bold text-emerald-400">Sheets Name</th>
                  <th className="py-3 px-3 font-bold text-blue-300">login</th>
                  <th className="py-3 px-3 font-bold text-amber-300">lot</th>
                  <th className="py-3 px-3 font-bold text-purple-300">neet</th>
                  <th className="py-3 px-3">Workbook(s)</th>
                  <th className="py-3 px-3">Customer Name</th>
                  <th className="py-3 px-3">Excel Row</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-500">
                      No matching records in preview.
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((item, idx) => {
                    const isExpanded = !!expandedRows[idx];
                    return (
                      <React.Fragment key={idx}>
                        <tr className={`hover:bg-slate-800/40 transition-colors ${item.found ? 'bg-emerald-950/5' : ''}`}>
                          <td className="py-3 px-3 text-center text-slate-500 text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Phone Number */}
                          <td className="py-3 px-3 font-bold text-slate-100 text-xs">
                            <span className="font-mono">{item.inputPhone}</span>
                            {item.normPhone && item.normPhone !== item.inputPhone && (
                              <span className="text-[10px] text-slate-500 block">
                                (norm: {item.normPhone})
                              </span>
                            )}
                          </td>

                          {/* Priority Column */}
                          <td className="py-3 px-3">
                            {item.found && item.priority && item.priority !== '—' ? (
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold border ${item.badgeBg || 'bg-amber-500/15'} ${item.badgeText || 'text-amber-300'} ${item.badgeBorder || 'border-amber-500/30'}`}
                                  title={`Lead Priority: ${item.priority} (Rank #${item.priorityRank})`}
                                >
                                  <Award className="w-3 h-3 shrink-0 text-amber-400" />
                                  <span>{item.priority}</span>
                                </span>
                                {item.matchCount > 1 && (
                                  <span className="text-[10px] text-slate-400 font-mono pl-1">
                                    Rank #{item.priorityRank} • Highest of {item.matchCount} files
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600 text-[11px] italic">—</span>
                            )}
                          </td>

                          {/* Sheets Name (matches user's requested layout: e.g. LOGIN - May, NEET - 2020) */}
                          <td className="py-3 px-3">
                            {item.found ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  <Layers className="w-3 h-3 text-emerald-400" />
                                  {item.sheetsName}
                                </span>
                                {item.matchCount > 1 && (
                                  <button
                                    onClick={() => toggleRowExpansion(idx)}
                                    className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>{item.matchCount} occurrences</span>
                                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600 italic text-[11px]">&lt;not found&gt;</span>
                            )}
                          </td>

                          {/* login column (Which month e.g. May, March) */}
                          <td className="py-3 px-3 font-mono">
                            {item.login && item.login !== '—' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                {item.login}
                              </span>
                            ) : (
                              <span className="text-slate-600">&mdash;</span>
                            )}
                          </td>

                          {/* lot column (Which lot e.g. Lot 1, Lot 2) */}
                          <td className="py-3 px-3 font-mono">
                            {item.lot && item.lot !== '—' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                {item.lot}
                              </span>
                            ) : (
                              <span className="text-slate-600">&mdash;</span>
                            )}
                          </td>

                          {/* neet column (With year e.g. 2020, 2019) */}
                          <td className="py-3 px-3 font-mono">
                            {item.neet && item.neet !== '—' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                {item.neet}
                              </span>
                            ) : (
                              <span className="text-slate-600">&mdash;</span>
                            )}
                          </td>

                          {/* Workbook */}
                          <td className="py-3 px-3 text-slate-300 font-sans text-xs truncate max-w-xs">
                            {item.workbookNames}
                          </td>

                          {/* Customer Name */}
                          <td className="py-3 px-3 text-slate-200 font-sans text-xs">
                            {item.customerName}
                          </td>

                          {/* Excel Row Number */}
                          <td className="py-3 px-3 text-slate-300 font-mono text-[11px]">
                            {item.rowNumbers}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center">
                            {item.found ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Found
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700/60">
                                Not Found
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right">
                            {item.records.length > 0 && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => onViewRecord(item.records[0].id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                  title="View original full row with all columns"
                                >
                                  <Maximize2 className="w-3 h-3" />
                                  <span>View Row</span>
                                </button>

                                <button
                                  onClick={() => onPreviewSheet(item.records[0].fileName, item.records[0].sheetName)}
                                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] border border-slate-700 transition-colors cursor-pointer"
                                  title="Preview sheet"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>

                                {onLookupCustomer && (
                                  <button
                                    onClick={() => onLookupCustomer(item.normPhone || item.inputPhone)}
                                    className="px-2 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white rounded text-[11px] font-semibold border border-indigo-500/40 transition-colors cursor-pointer"
                                    title="Compare all occurrences in Customer Lookup & Diff"
                                  >
                                    Diff
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* Expanded sub-occurrences if multiple matches */}
                        {isExpanded && item.records.length > 1 && (
                          <tr className="bg-slate-950/60">
                            <td colSpan={12} className="p-3 pl-12">
                              <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/80 space-y-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
                                  All {item.records.length} Occurrences for {item.inputPhone}:
                                </span>
                                <div className="space-y-1.5">
                                  {item.records.map((rec, rIdx) => (
                                    <div
                                      key={rIdx}
                                      className="flex flex-wrap items-center justify-between text-xs p-2 rounded bg-slate-800/40 border border-slate-700/50 gap-2"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-white">{rec.customerName || 'No Name'}</span>
                                        <span className="text-slate-500">•</span>
                                        <span className="text-emerald-300 font-bold">{rec.sheetLabel || rec.fileName}</span>
                                        {rec.priority && (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                                            {rec.priority}
                                          </span>
                                        )}
                                        {rec.login && rec.login !== '—' && (
                                          <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px]">
                                            login: {rec.login}
                                          </span>
                                        )}
                                        {rec.lot && rec.lot !== '—' && (
                                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
                                            lot: {rec.lot}
                                          </span>
                                        )}
                                        {rec.neet && rec.neet !== '—' && (
                                          <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px]">
                                            neet: {rec.neet}
                                          </span>
                                        )}
                                        <span className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-[11px] font-mono">
                                          Row {rec.rowNum}
                                        </span>
                                      </div>

                                      <button
                                        onClick={() => onViewRecord(rec.id)}
                                        className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                                      >
                                        Inspect Row #{rec.rowNum}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-mono">
            <span>
              Showing {filteredResults.length} of {results.length} total entries
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport('xlsx')}
                className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Report (.xlsx)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
