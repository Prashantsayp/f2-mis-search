import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileSpreadsheet,
  Layers,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Eye,
  Info,
  Calendar,
  HardDrive,
  CheckCircle2,
  FolderTree,
  Building2,
  Stethoscope,
  CreditCard,
  Database,
  Search,
} from 'lucide-react';
import { DiscoveredFolderItem, DiscoveredFileItem } from '../types';

interface DirectoryViewProps {
  folders: DiscoveredFolderItem[];
  files: DiscoveredFileItem[];
  onPreviewSheet: (fileId: string, sheetName: string) => void;
  onManageSheets?: (fileName: string) => void;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  folders,
  files,
  onPreviewSheet,
  onManageSheets,
}) => {
  // Expand all folders by default so everything is immediately visible and searchable
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { root: true };
    folders.forEach(f => {
      initial[f.id] = true;
    });
    return initial;
  });

  const [selectedFile, setSelectedFile] = useState<DiscoveredFileItem | null>(files[0] || null);
  const [filterText, setFilterText] = useState('');

  React.useEffect(() => {
    if (!selectedFile && files.length > 0) {
      setSelectedFile(files[0]);
    } else if (selectedFile) {
      const updated = files.find(f => f.id === selectedFile.id);
      if (updated) setSelectedFile(updated);
    }
  }, [files]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = { root: true };
    folders.forEach(f => { all[f.id] = true; });
    setExpandedFolders(all);
  };

  const collapseAll = () => {
    setExpandedFolders({ root: true });
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Helper to determine subfolders belonging to a parent folder
  const getSubfolders = (parentFolder: DiscoveredFolderItem): DiscoveredFolderItem[] => {
    const pName = parentFolder.name.toLowerCase().trim();
    return folders.filter(f => {
      if (f.id === parentFolder.id) return false;
      if (f.parentId && f.parentId === parentFolder.id) return true;
      // Match hierarchical path: e.g. path starting with "DOCTORS /"
      if (pName === 'doctors' && (f.path || '').toLowerCase().startsWith('doctors /')) return true;
      return false;
    });
  };

  // Helper to get direct files in this specific folder
  const getDirectFolderFiles = (folder: DiscoveredFolderItem): DiscoveredFileItem[] => {
    const folderName = folder.name.toLowerCase().trim();
    const folderPath = (folder.path || '').toLowerCase().trim();

    return files.filter(f => {
      if (f.folderId && f.folderId === folder.id) return true;
      const fPath = (f.folderPath || '').toLowerCase().trim();
      const fName = (f.name || '').toLowerCase().trim();

      if (fPath === folderName || fPath === folderPath) return true;
      if (folderName === 'bl' && (fName === 'bl' || fName === 'bl.xlsx' || fPath === 'bl')) return true;
      if (folderName === 'pl' && (fName.includes('icici') || fPath === 'pl')) return true;

      if (folderName === 'directory' && (fName.includes('consolidated') || fPath.endsWith('directory'))) return true;
      if (folderName === 'f2 leads' && (fName.includes('jan') || fName.includes('may') || fPath.endsWith('f2 leads'))) return true;
      if (folderName === 'login' && (fName.includes('login') || fPath.endsWith('login'))) return true;
      if (folderName === 'lot' && (fName.includes('lot') || fPath.endsWith('lot'))) return true;
      if (folderName === 'neet' && (fName.includes('neet') || fPath.endsWith('neet')) && !fPath.includes('support')) return true;
      if (folderName === 'neet support data' && (fName.includes('21k') || fName.includes('30k') || fPath.includes('support'))) return true;
      if (folderName === 'tata points' && (fName.includes('tata') || fPath.endsWith('tata points'))) return true;
      if (folderName === 'team x' && (fName.includes('team x') || fPath.endsWith('team x'))) return true;

      return false;
    });
  };

  // Helper to get all recursive files under a folder (for accurate count rollups)
  const getAllFolderFiles = (folder: DiscoveredFolderItem): DiscoveredFileItem[] => {
    const direct = getDirectFolderFiles(folder);
    const sub = getSubfolders(folder);
    const subFiles = sub.flatMap(sf => getAllFolderFiles(sf));
    const all = [...direct, ...subFiles];
    return Array.from(new Map(all.map(f => [f.id, f])).values());
  };

  // Top-level folders (BL, DOCTORS, PL)
  const topLevelFolders = folders.filter(f => {
    const nameLower = f.name.toLowerCase().trim();
    if (nameLower === 'bl' || nameLower === 'doctors' || nameLower === 'pl') return true;
    const isChild = folders.some(
      p => p.id !== f.id && (p.id === f.parentId || (p.name.toLowerCase().trim() === 'doctors' && (f.path || '').toLowerCase().startsWith('doctors /')))
    );
    return !isChild;
  }).sort((a, b) => {
    // Sort BL, DOCTORS, PL cleanly
    const order: Record<string, number> = { bl: 1, doctors: 2, pl: 3 };
    const aOrder = order[a.name.toLowerCase().trim()] || 99;
    const bOrder = order[b.name.toLowerCase().trim()] || 99;
    return aOrder - bOrder;
  });

  // Calculate summary metrics for the 3 main directories
  const blFolder = folders.find(f => f.name.toLowerCase().trim() === 'bl');
  const doctorsFolder = folders.find(f => f.name.toLowerCase().trim() === 'doctors');
  const plFolder = folders.find(f => f.name.toLowerCase().trim() === 'pl');

  const blFiles = blFolder ? getAllFolderFiles(blFolder) : files.filter(f => f.name.toLowerCase().includes('bl'));
  const doctorsFiles = doctorsFolder ? getAllFolderFiles(doctorsFolder) : files.filter(f => !f.name.toLowerCase().includes('bl') && !f.name.toLowerCase().includes('icici'));
  const plFiles = plFolder ? getAllFolderFiles(plFolder) : files.filter(f => f.name.toLowerCase().includes('icici'));

  const blRows = blFiles.reduce((acc, f) => acc + (f.totalRows || 0), 0);
  const doctorsRows = doctorsFiles.reduce((acc, f) => acc + (f.totalRows || 0), 0);
  const plRows = plFiles.reduce((acc, f) => acc + (f.totalRows || 0), 0);

  // Recursive folder node renderer
  const renderFolderNode = (folder: DiscoveredFolderItem, depth: number = 0) => {
    const isExpanded = !!expandedFolders[folder.id];
    const subfolders = getSubfolders(folder);
    const directFiles = getDirectFolderFiles(folder);
    const displayedDirectFiles = filterText
      ? directFiles.filter(f =>
          f.name.toLowerCase().includes(filterText.toLowerCase()) ||
          (f.folderPath || '').toLowerCase().includes(filterText.toLowerCase()) ||
          f.sheets?.some(s => s.name.toLowerCase().includes(filterText.toLowerCase()))
        )
      : directFiles;
    const allFiles = getAllFolderFiles(folder);
    const totalRows = allFiles.reduce((acc, f) => acc + (f.totalRows || 0), 0);

    const fNameLower = folder.name.toLowerCase().trim();
    const isBL = fNameLower === 'bl';
    const isDoctors = fNameLower === 'doctors';
    const isPL = fNameLower === 'pl';

    // Folder badge styling
    let themeBg = 'bg-slate-900/60 border-slate-800';
    let folderIconColor = 'text-slate-400';
    let badgeTag = '';
    let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';

    if (isBL) {
      themeBg = 'bg-emerald-950/20 border-emerald-800/40';
      folderIconColor = 'text-emerald-400';
      badgeTag = 'Business Loan';
      badgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    } else if (isDoctors) {
      themeBg = 'bg-blue-950/20 border-blue-800/40';
      folderIconColor = 'text-blue-400';
      badgeTag = 'Doctor & Healthcare Leads';
      badgeColor = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    } else if (isPL) {
      themeBg = 'bg-purple-950/20 border-purple-800/40';
      folderIconColor = 'text-purple-400';
      badgeTag = 'Personal Loan · ICICI';
      badgeColor = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    }

    return (
      <div key={folder.id} className={`border rounded-xl overflow-hidden mb-2 transition-all ${themeBg}`}>
        {/* Folder Header Row */}
        <div
          onClick={() => toggleFolder(folder.id)}
          className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-800/50 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            )}

            {isExpanded ? (
              <FolderOpen className={`w-4 h-4 ${folderIconColor} shrink-0`} />
            ) : (
              <Folder className={`w-4 h-4 ${folderIconColor} shrink-0`} />
            )}

            <span className="font-bold text-slate-100 text-xs sm:text-sm truncate">
              {folder.name}
            </span>

            {badgeTag && (
              <span className={`hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeColor}`}>
                {badgeTag}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {subfolders.length > 0 && (
              <span className="text-[10px] text-slate-400 font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                {subfolders.length} subfolder{subfolders.length === 1 ? '' : 's'}
              </span>
            )}
            <span className="text-[10px] text-slate-300 font-mono bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700 font-semibold">
              {allFiles.length} file{allFiles.length === 1 ? '' : 's'}
            </span>
            <span className="text-[11px] text-emerald-400 font-mono font-bold">
              {totalRows.toLocaleString()} rows
            </span>
          </div>
        </div>

        {/* Folder Expanded Contents */}
        {isExpanded && (
          <div className="pl-4 sm:pl-6 pr-2 py-2 space-y-2 border-t border-slate-800/60 bg-slate-950/40">
            {/* Render child folders if any */}
            {subfolders.length > 0 && (
              <div className="space-y-1.5 border-l-2 border-slate-800 pl-2 sm:pl-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">
                  Subdirectories ({subfolders.length})
                </div>
                {subfolders.map(sf => renderFolderNode(sf, depth + 1))}
              </div>
            )}

            {/* Render direct files if any */}
            {displayedDirectFiles.length > 0 && (
              <div className="space-y-1 border-l-2 border-slate-800 pl-2 sm:pl-3">
                {subfolders.length > 0 && (
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">
                    Workbooks in this folder ({displayedDirectFiles.length})
                  </div>
                )}
                {displayedDirectFiles.map(file => {
                  const isSelected = selectedFile?.id === file.id;
                  return (
                    <div
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 font-semibold shadow-xs'
                          : 'hover:bg-slate-800/70 text-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono shrink-0 ml-2">
                        <span className="text-slate-400">
                          {file.sheets?.length || file.sheetsCount || 1} sheet{file.sheets?.length === 1 ? '' : 's'}
                        </span>
                        <span className="text-emerald-400 font-bold">
                          {(file.totalRows || 0).toLocaleString()} rows
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty folder fallback */}
            {subfolders.length === 0 && directFiles.length === 0 && (
              <div className="text-[11px] text-slate-500 italic py-2 px-3">
                No workbooks found in this directory
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Directory Hierarchy Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-emerald-400" />
            <span>Updated Data Directory Hierarchy</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Consolidated 3-directory architecture: <strong>BL</strong>, <strong>DOCTORS</strong>, and <strong>PL</strong> with recursive workbook indexing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter workbooks or folders..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8 pr-3 py-1 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-44 sm:w-56"
            />
          </div>
          <button
            onClick={expandAll}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* 3 Top-Level Directory Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: BL */}
        <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-800/40 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">BL Directory</h3>
                <span className="text-[10px] text-emerald-400 font-semibold">Business Loan Portfolio</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
              Top-Level
            </span>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-emerald-900/40 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Workbooks:</span>
              <span className="font-mono text-white font-semibold">
                {blFiles.length} file ({blFiles.reduce((acc, f) => acc + (f.sheets?.length || f.sheetsCount || 1), 0)} sheet)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Records:</span>
              <span className="font-mono text-emerald-400 font-bold">{blRows.toLocaleString()} rows</span>
            </div>
            <div className="text-[11px] text-slate-400 pt-1">
              Includes customer eligibility, branches, and state loan data.
            </div>
          </div>
        </div>

        {/* Card 2: DOCTORS */}
        <div className="bg-gradient-to-br from-blue-950/40 to-slate-900 border border-blue-800/40 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                <Stethoscope className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">DOCTORS Directory</h3>
                <span className="text-[10px] text-blue-400 font-semibold">Medical &amp; Professional Leads</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
              8 Subfolders
            </span>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-blue-900/40 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Workbooks:</span>
              <span className="font-mono text-white font-semibold">
                {doctorsFiles.length} files ({doctorsFiles.reduce((acc, f) => acc + (f.sheets?.length || f.sheetsCount || 1), 0)} sheets)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Records:</span>
              <span className="font-mono text-blue-400 font-bold">{doctorsRows.toLocaleString()} rows</span>
            </div>
            <div className="text-[11px] text-slate-400 pt-1">
              NEET batches (15-23), Tata Points, Team X, F2 Leads, Consolidated Directory.
            </div>
          </div>
        </div>

        {/* Card 3: PL */}
        <div className="bg-gradient-to-br from-purple-950/40 to-slate-900 border border-purple-800/40 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">PL Directory</h3>
                <span className="text-[10px] text-purple-400 font-semibold">Personal Loan &amp; Bank Logins</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
              Top-Level
            </span>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-purple-900/40 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Workbooks:</span>
              <span className="font-mono text-white font-semibold">
                {plFiles.length} file ({plFiles.reduce((acc, f) => acc + (f.sheets?.length || f.sheetsCount || 1), 0)} sheets)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Records:</span>
              <span className="font-mono text-purple-400 font-bold">{plRows.toLocaleString()} rows</span>
            </div>
            <div className="text-[11px] text-slate-400 pt-1">
              ICICI Bank personal loan login cases and sanction updates.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Tree Structure */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2 flex items-center justify-between">
            <span>Google Drive Directory Tree</span>
            <span className="text-[11px] text-slate-500 lowercase">Click to inspect workbook</span>
          </div>

          <div className="space-y-2 select-none">
            {/* Root item */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/90">
              <div
                onClick={() => toggleFolder('root')}
                className="flex items-center justify-between p-3 hover:bg-slate-800/60 cursor-pointer transition-colors bg-slate-850"
              >
                <div className="flex items-center gap-2 font-medium text-xs sm:text-sm text-slate-200">
                  {expandedFolders['root'] ? (
                    <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  {expandedFolders['root'] ? (
                    <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                  <span className="font-bold text-white tracking-wide">mis_search_automation (Root)</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    3 Primary Folders
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-bold border border-slate-700">
                    {files.length} workbooks
                  </span>
                </div>
              </div>

              {expandedFolders['root'] && (
                <div className="p-3 space-y-2 border-t border-slate-800 bg-slate-950/20">
                  {topLevelFolders.map(folder => renderFolderNode(folder, 0))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Selected File Details & Sheet Breakdown */}
        <div className="lg:col-span-5 space-y-4">
          {selectedFile ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest block mb-1">
                      SELECTED WORKBOOK
                    </span>
                    <h3 className="text-base font-bold text-white flex items-center gap-2 break-all">
                      <FileSpreadsheet className="w-5 h-5 text-blue-400 shrink-0" />
                      {selectedFile.name}
                    </h3>
                  </div>
                  <a
                    href={`https://drive.google.com/file/d/${selectedFile.id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition-colors shrink-0"
                    title="Open in Google Drive"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <div className="text-xs text-slate-400 mt-2 font-mono flex items-center gap-1.5">
                  <span className="text-slate-500">Folder Path:</span>
                  <span className="text-slate-200 font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                    {selectedFile.folderPath}
                  </span>
                </div>
              </div>

              {/* File Specs Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Google Drive ID</span>
                  <span className="font-mono text-slate-300 text-[11px] truncate block" title={selectedFile.id}>
                    {selectedFile.id}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">File Size</span>
                  <span className="font-mono text-slate-200 font-semibold">
                    {formatBytes(selectedFile.size)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Indexed Records</span>
                  <span className="font-mono text-emerald-400 font-bold text-sm">
                    {selectedFile.totalRows.toLocaleString()}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Sync Status</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Synchronized
                  </span>
                </div>
              </div>

              {/* Worksheets in this file */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    Worksheets ({selectedFile.sheets?.length || 0})
                  </span>
                  {onManageSheets ? (
                    <button
                      type="button"
                      onClick={() => onManageSheets(selectedFile.name)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold hover:underline cursor-pointer"
                    >
                      Manage in Sheets Manager →
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500 font-normal">Click Preview to inspect</span>
                  )}
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {selectedFile.sheets && selectedFile.sheets.length > 0 ? (
                    selectedFile.sheets.map((s, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition-colors"
                      >
                        <div>
                          <div className="font-medium text-slate-200 text-xs flex items-center gap-2">
                            <span>📄</span>
                            <span>{s.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {s.rowsCount.toLocaleString()} rows • {s.colsCount} cols
                          </div>
                        </div>

                        <button
                          onClick={() => onPreviewSheet(selectedFile.id, s.name)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:white rounded-lg text-xs font-semibold border border-emerald-500/30 transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 py-3 text-center">No worksheets parsed</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">
              <Info className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-xs">Select a workbook from the directory tree to inspect file details and sheet list.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
