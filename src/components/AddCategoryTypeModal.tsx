import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  CheckCircle2,
  FolderTree,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Info,
  Tag,
  Folder,
  FileText,
  Table,
  GripVertical,
  Check,
  CheckSquare,
  Square,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CategoryTypeConfig } from '../types';

interface DirectorySheet {
  sheetName: string;
  headers: string[];
}

interface DirectoryFile {
  fileName: string;
  fileId: string;
  sheets: DirectorySheet[];
}

interface DirectoryFolder {
  folderName: string;
  files: DirectoryFile[];
}

interface AddCategoryTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryTypesUpdated?: (types: CategoryTypeConfig[]) => void;
}

export const AddCategoryTypeModal: React.FC<AddCategoryTypeModalProps> = ({
  isOpen,
  onClose,
  onCategoryTypesUpdated,
}) => {
  const [categoryTypes, setCategoryTypes] = useState<CategoryTypeConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Directory tree from database
  const [directoryTree, setDirectoryTree] = useState<DirectoryFolder[]>([]);

  // Simple 3-Step Selection State
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [combinedColumns, setCombinedColumns] = useState<string[]>([]);

  // Drag & drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  // Format style option:
  // 'folder_val_col': e.g. "Lot - Lot 1 (category)"
  // 'folder_val': e.g. "Lot Lot 1" or "TEAM X IMG"
  // 'val_only': e.g. "Lot 1" or "IMG"
  // 'custom': user custom
  const [formatOption, setFormatOption] = useState<'folder_val_col' | 'folder_val' | 'val_only' | 'custom'>('folder_val_col');
  const [customFormat, setCustomFormat] = useState<string>('');
  const [priorityRank, setPriorityRank] = useState<number>(1);
  const [customRuleName, setCustomRuleName] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Load data on open
  useEffect(() => {
    if (isOpen) {
      fetchCategoryTypes();
      fetchDirectoryTree();
    }
  }, [isOpen]);

  const fetchCategoryTypes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/category-types');
      const data = await res.json();
      if (data.categoryTypes) setCategoryTypes(data.categoryTypes);
    } catch (err) {
      console.error('Failed to load category types:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDirectoryTree = async () => {
    try {
      const res = await fetch('/api/category-types/directory-tree');
      const data = await res.json();
      if (data.folders && Array.isArray(data.folders)) {
        setDirectoryTree(data.folders);

        // Pre-select first folder
        if (!selectedFolder && data.folders.length > 0) {
          const lotFolder = data.folders.find((f: DirectoryFolder) => /lot/i.test(f.folderName));
          const initial = lotFolder || data.folders[0];
          handleSelectFolder(initial.folderName, data.folders);
        }
      }
    } catch (err) {
      console.error('Failed to load directory tree:', err);
    }
  };

  // Step 1: Select Folder
  const handleSelectFolder = (folderName: string, tree: DirectoryFolder[] = directoryTree) => {
    setSelectedFolder(folderName);
    setCustomRuleName(folderName);

    const folder = tree.find(f => f.folderName === folderName);
    const files = folder?.files || [];
    const allFileNames = files.map(f => f.fileName);

    // Default to selecting all files in this folder
    setSelectedFiles(allFileNames);

    // Default to selecting all sheets in those files
    const allSheetNames = Array.from(
      new Set(files.flatMap(f => f.sheets.map(s => s.sheetName)))
    );
    setSelectedSheets(allSheetNames);

    // Reset columns, or auto-pick if common category exists
    const allCols = Array.from(new Set(files.flatMap(f => f.sheets.flatMap(s => s.headers))));
    const autoCol = allCols.find(c => /^(category|lot|lots|year|month|section)$/i.test(c.trim()));
    if (autoCol) {
      setCombinedColumns([autoCol]);
    } else {
      setCombinedColumns([]);
    }
  };

  // Step 2: File Multi-Select / Unselect
  const activeFolderObj = directoryTree.find(f => f.folderName === selectedFolder);
  const availableFiles = activeFolderObj?.files || [];

  const toggleFile = (fileName: string) => {
    let updated: string[];
    if (selectedFiles.includes(fileName)) {
      updated = selectedFiles.filter(f => f !== fileName);
    } else {
      updated = [...selectedFiles, fileName];
    }
    setSelectedFiles(updated);

    // Update sheets available under selected files
    const validSheets = availableFiles
      .filter(f => updated.includes(f.fileName))
      .flatMap(f => f.sheets.map(s => s.sheetName));
    setSelectedSheets(Array.from(new Set(validSheets)));
  };

  const selectAllFiles = () => {
    const all = availableFiles.map(f => f.fileName);
    setSelectedFiles(all);
    const allSheets = availableFiles.flatMap(f => f.sheets.map(s => s.sheetName));
    setSelectedSheets(Array.from(new Set(allSheets)));
  };

  const unselectAllFiles = () => {
    setSelectedFiles([]);
    setSelectedSheets([]);
  };

  // Step 3: Sheet Multi-Select / Unselect
  const activeFilesList = availableFiles.filter(f => selectedFiles.includes(f.fileName));
  const availableSheets = Array.from(
    new Set(activeFilesList.flatMap(f => f.sheets.map(s => s.sheetName)))
  );

  const toggleSheet = (sheetName: string) => {
    if (selectedSheets.includes(sheetName)) {
      setSelectedSheets(selectedSheets.filter(s => s !== sheetName));
    } else {
      setSelectedSheets([...selectedSheets, sheetName]);
    }
  };

  const selectAllSheets = () => {
    setSelectedSheets([...availableSheets]);
  };

  const unselectAllSheets = () => {
    setSelectedSheets([]);
  };

  // Step 4: Available Columns across selected files & sheets
  const activeSheetsList = activeFilesList.flatMap(f =>
    f.sheets.filter(s => selectedSheets.includes(s.sheetName))
  );

  const availableColumns = Array.from(
    new Set(activeSheetsList.flatMap(s => s.headers))
  );

  // Column selection & drag and drop
  const toggleColumn = (col: string) => {
    if (combinedColumns.includes(col)) {
      setCombinedColumns(combinedColumns.filter(c => c !== col));
    } else {
      setCombinedColumns([...combinedColumns, col]);
    }
  };

  const handleDropOnZone = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const col = e.dataTransfer.getData('text/plain') || draggedColumn;
    if (col && !combinedColumns.includes(col)) {
      setCombinedColumns([...combinedColumns, col]);
    }
    setDraggedColumn(null);
  };

  // Generate Sample Value based on column name & folder
  const getSampleValueForCol = (col: string): string => {
    const lower = col.toLowerCase();
    if (lower.includes('lot')) return 'Lot 1';
    if (lower.includes('category') || lower.includes('cat')) return 'IMG';
    if (lower.includes('year')) return '2026';
    if (lower.includes('month')) return 'Jan';
    if (lower.includes('p') || lower.includes('priority')) return 'P1';
    if (lower.includes('branch') || lower.includes('city')) return 'Mumbai';
    if (lower.includes('name')) return 'Dr. Sharma';
    return 'SampleVal';
  };

  // Build the live Example Entry!
  const buildExampleEntry = (): { exampleText: string; template: string } => {
    const folderLabel = customRuleName.trim() || selectedFolder || 'Category';
    const primaryCol = combinedColumns[0] || 'category';
    const sampleVal = getSampleValueForCol(primaryCol);

    if (combinedColumns.length === 0) {
      return {
        exampleText: `${folderLabel} - (Select a column below)`,
        template: `${folderLabel} {val}`,
      };
    }

    if (formatOption === 'folder_val_col') {
      // E.g. "Lot - Lot 1 (category)" as requested by user
      const colLabels = combinedColumns.join(', ');
      const exampleText = `${folderLabel} - ${sampleVal} (${colLabels})`;
      const template = `${folderLabel} - {val} (${colLabels})`;
      return { exampleText, template };
    }

    if (formatOption === 'folder_val') {
      // E.g. "TEAM X IMG" or "Lot Lot 1"
      const exampleText = `${folderLabel} ${sampleVal}`;
      const template = `${folderLabel} {val}`;
      return { exampleText, template };
    }

    if (formatOption === 'val_only') {
      // E.g. "Lot 1" or "IMG"
      const exampleText = `${sampleVal}`;
      const template = `{val}`;
      return { exampleText, template };
    }

    // Custom format
    const tpl = customFormat.trim() || `${folderLabel} - {val}`;
    const exampleText = tpl.replace('{val}', sampleVal).replace('{col}', primaryCol);
    return { exampleText, template: tpl };
  };

  const { exampleText: liveExampleEntry, template: generatedTemplate } = buildExampleEntry();

  // Save Rule
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const ruleName = customRuleName.trim() || selectedFolder;
    if (!ruleName) {
      setFormError('Please select a folder or enter a category name');
      return;
    }

    if (combinedColumns.length === 0) {
      setFormError('Please select at least one column to combine (e.g. category, lot, year)');
      return;
    }

    const pattern = selectedFiles.length > 0 && selectedFiles.length < availableFiles.length
      ? selectedFiles.join('|')
      : selectedFolder;

    try {
      const res = await fetch('/api/category-types/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleName,
          fileOrFolderPattern: pattern || ruleName,
          columnNames: combinedColumns,
          outputFormat: generatedTemplate,
          rank: Number(priorityRank) || 1,
          color: '#8b5cf6',
          badgeBg: 'bg-violet-500/15',
          badgeText: 'text-violet-400',
          badgeBorder: 'border-violet-500/30',
          description: `Extracts ${ruleName} category from ${combinedColumns.join(', ')}`,
        }),
      });
      const data = await res.json();
      if (data.categoryTypes) {
        setCategoryTypes(data.categoryTypes);
        if (onCategoryTypesUpdated) {
          onCategoryTypesUpdated(data.categoryTypes);
        }
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save rule');
    }
  };

  const handleToggleActive = (id: string) => {
    setCategoryTypes(prev =>
      prev.map(c => (c.id === id ? { ...c, isActive: !c.isActive } : c))
    );
  };

  const handleDelete = async (id: string) => {
    try {
      setFormError(null);
      const res = await fetch(`/api/category-types/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.categoryTypes) {
        setCategoryTypes(data.categoryTypes);
        if (onCategoryTypesUpdated) onCategoryTypesUpdated(data.categoryTypes);
      }
    } catch (err: any) {
      setFormError(`Failed to delete: ${err.message}`);
    }
  };

  const handleReset = async () => {
    try {
      setFormError(null);
      const res = await fetch('/api/category-types/reset', { method: 'POST' });
      const data = await res.json();
      if (data.categoryTypes) {
        setCategoryTypes(data.categoryTypes);
        if (onCategoryTypesUpdated) onCategoryTypesUpdated(data.categoryTypes);
      }
    } catch (err: any) {
      setFormError(`Failed to reset: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30">
              <FolderTree className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Add Category Type & Column Rules
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-violet-400/20 text-violet-300 border border-violet-400/30">
                  Folder → File → Sheet → Column
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Select your folder, files & sheets, then pick the column to combine. See the live example entry instantly.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Banner */}
        {saveSuccess && (
          <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Category Type & Column Rule saved and active!</span>
          </div>
        )}

        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          {/* STEP-BY-STEP BUILDER */}
          <form onSubmit={handleSaveRule} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">
                  +
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Create Category Column Mapping
                </h4>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Step-by-step with multi-file & sheet selection
              </span>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {formError}
              </div>
            )}

            {/* STEP 1: FOLDER NAME */}
            <div>
              <label className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-indigo-600" />
                  <span>1. Folder Name</span>
                </span>
                <span className="text-[11px] text-slate-400 font-normal">
                  Select source folder
                </span>
              </label>
              <select
                value={selectedFolder}
                onChange={e => handleSelectFolder(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500 font-mono font-bold text-slate-800 shadow-2xs"
              >
                {directoryTree.map(f => (
                  <option key={f.folderName} value={f.folderName}>
                    📁 {f.folderName} ({f.files.length} file{f.files.length === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </div>

            {/* STEP 2: FILE NAME(S) WITH MULTI-SELECT & UNSELECT */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. File Name (Select / Unselect Multiple Files)</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {selectedFiles.length} of {availableFiles.length} selected
                  </span>
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAllFiles}
                    className="text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={unselectAllFiles}
                    className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                  >
                    Unselect All
                  </button>
                </div>
              </div>

              {availableFiles.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-100 text-slate-400 text-xs italic">
                  No files found in {selectedFolder}.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  {availableFiles.map(file => {
                    const isSelected = selectedFiles.includes(file.fileName);
                    return (
                      <button
                        key={file.fileName}
                        type="button"
                        onClick={() => toggleFile(file.fileName)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer select-none ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-bold shadow-2xs border border-emerald-700'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{file.fileName}</span>
                        <span className={`text-[10px] ${isSelected ? 'text-emerald-200' : 'text-slate-400'}`}>
                          ({file.sheets.length} sheet{file.sheets.length === 1 ? '' : 's'})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* STEP 3: SHEET TAB(S) WITH MULTI-SELECT & UNSELECT */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Table className="w-3.5 h-3.5 text-blue-600" />
                  <span>3. Sheet Tab(s) (Select / Unselect Multiple Sheets)</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                    {selectedSheets.length} of {availableSheets.length} selected
                  </span>
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAllSheets}
                    className="text-blue-700 hover:text-blue-900 font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={unselectAllSheets}
                    className="text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                  >
                    Unselect All
                  </button>
                </div>
              </div>

              {availableSheets.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-100 text-slate-400 text-xs italic">
                  Select at least one file above to see available sheets.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  {availableSheets.map(sheetName => {
                    const isSelected = selectedSheets.includes(sheetName);
                    return (
                      <button
                        key={sheetName}
                        type="button"
                        onClick={() => toggleSheet(sheetName)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer select-none ${
                          isSelected
                            ? 'bg-blue-600 text-white font-bold shadow-2xs border border-blue-700'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{sheetName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* STEP 4: COLUMNS TO COMBINE */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Tag className="w-3.5 h-3.5 text-violet-600" />
                  <span>4. Column You Want to Combine (Click to Select or Drag & Drop)</span>
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  {availableColumns.length} columns detected in selected sheets
                </span>
              </div>

              {/* Column Pills Box & Drop Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Available Columns */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Available Columns (Click to add):
                  </span>
                  <div className="min-h-[100px] max-h-[160px] overflow-y-auto flex flex-wrap gap-1.5 items-start content-start">
                    {availableColumns.length === 0 ? (
                      <span className="text-xs text-slate-400 italic p-2">
                        Select files and sheets above to load columns.
                      </span>
                    ) : (
                      availableColumns.map(col => {
                        const isSelected = combinedColumns.includes(col);
                        const isLikelyCategory = /category|section|cat|lot|lots|year|month|specialty/i.test(col);

                        return (
                          <div
                            key={col}
                            draggable
                            onDragStart={e => {
                              e.dataTransfer.setData('text/plain', col);
                              setDraggedColumn(col);
                            }}
                            onClick={() => toggleColumn(col)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer select-none ${
                              isSelected
                                ? 'bg-violet-700 text-white font-bold shadow-2xs border border-violet-800 ring-2 ring-violet-200'
                                : isLikelyCategory
                                ? 'bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-300 font-bold'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                            title="Click or drag to combine"
                          >
                            <GripVertical className="w-3 h-3 opacity-40" />
                            <span>{col}</span>
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Combined Droppable Zone */}
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                  }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={handleDropOnZone}
                  className={`p-3 rounded-xl border-2 transition-all space-y-2 ${
                    isDraggingOver
                      ? 'border-violet-500 bg-violet-50/80 ring-4 ring-violet-100'
                      : 'border-dashed border-violet-200 bg-violet-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-violet-900 uppercase tracking-wider">
                      Selected Columns to Combine ({combinedColumns.length})
                    </span>
                    {combinedColumns.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCombinedColumns([])}
                        className="text-[10px] text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="min-h-[100px] max-h-[160px] overflow-y-auto flex flex-wrap gap-1.5 items-start content-start">
                    {combinedColumns.length === 0 ? (
                      <div className="w-full py-6 text-center text-slate-400 text-xs">
                        Click on any column on the left (e.g. <strong className="text-violet-700">category</strong> or <strong className="text-amber-700">lot</strong>)
                      </div>
                    ) : (
                      combinedColumns.map(col => (
                        <span
                          key={col}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-mono font-bold shadow-2xs"
                        >
                          <span>{col}</span>
                          <button
                            type="button"
                            onClick={() => toggleColumn(col)}
                            className="p-0.5 hover:bg-violet-700 rounded text-violet-200 hover:text-white transition cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* LIVE EXAMPLE ENTRY CARD (AS REQUESTED) */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50/90 via-violet-50/80 to-indigo-50/80 border-2 border-violet-300 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Live Example Entry:
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  Matches your specification
                </span>
              </div>

              {/* Prominent Live Example Badge */}
              <div className="p-3.5 rounded-xl bg-white border border-violet-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Result in Priority & Sheet Name:
                  </div>
                  <div className="text-base font-black font-mono text-violet-800 tracking-tight mt-0.5">
                    {liveExampleEntry}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Columns Extracted:
                  </div>
                  <div className="text-xs font-bold font-mono text-slate-700">
                    {combinedColumns.join(', ') || 'None selected'}
                  </div>
                </div>
              </div>

              {/* Format Style Selector */}
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1.5">
                  Choose Output Style:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label
                    onClick={() => setFormatOption('folder_val_col')}
                    className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition select-none ${
                      formatOption === 'folder_val_col'
                        ? 'bg-white border-violet-600 ring-2 ring-violet-200 shadow-2xs font-bold text-slate-900'
                        : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="format_opt"
                      checked={formatOption === 'folder_val_col'}
                      onChange={() => setFormatOption('folder_val_col')}
                      className="mt-0.5 text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Lot - Lot 1 (category)</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Folder - Value (Column)</div>
                    </div>
                  </label>

                  <label
                    onClick={() => setFormatOption('folder_val')}
                    className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition select-none ${
                      formatOption === 'folder_val'
                        ? 'bg-white border-violet-600 ring-2 ring-violet-200 shadow-2xs font-bold text-slate-900'
                        : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="format_opt"
                      checked={formatOption === 'folder_val'}
                      onChange={() => setFormatOption('folder_val')}
                      className="mt-0.5 text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Lot Lot 1</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Folder Value (e.g. TEAM X IMG)</div>
                    </div>
                  </label>

                  <label
                    onClick={() => setFormatOption('val_only')}
                    className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition select-none ${
                      formatOption === 'val_only'
                        ? 'bg-white border-violet-600 ring-2 ring-violet-200 shadow-2xs font-bold text-slate-900'
                        : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="format_opt"
                      checked={formatOption === 'val_only'}
                      onChange={() => setFormatOption('val_only')}
                      className="mt-0.5 text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Lot 1</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Column Value only</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Priority Rank:</span>
                <select
                  value={priorityRank}
                  onChange={e => setPriorityRank(Number(e.target.value))}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white font-mono font-bold"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                    <option key={r} value={r}>
                      Rank #{r} {r === 1 ? '(Highest)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={combinedColumns.length === 0}
                className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Save Category Column Rule</span>
              </button>
            </div>
          </form>

          {/* ACTIVE CATEGORY TYPES LIST */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Active Category Rules ({categoryTypes.length})
                </h4>
              </div>
              <span className="text-xs text-slate-500">
                Applied automatically in MIS Analyzer & Priority
              </span>
            </div>

            <div className="space-y-2.5">
              {categoryTypes.map(cType => (
                <div
                  key={cType.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    cType.isActive
                      ? 'bg-white border-slate-200 shadow-2xs hover:border-violet-300'
                      : 'bg-slate-50 border-slate-200/60 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-2xs"
                        style={{ backgroundColor: cType.color || '#8b5cf6' }}
                      >
                        #{cType.rank}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="font-bold text-slate-900 text-xs">{cType.name}</h5>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-violet-50 text-violet-700 border border-violet-200">
                            Example: {cType.outputFormat.replace('{val}', 'Lot 1').replace('{category}', 'IMG')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
                          <span>Columns:</span>
                          <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded">
                            {cType.columnNames.join(', ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cType.isActive}
                          onChange={() => handleToggleActive(cType.id)}
                          className="rounded text-violet-600 focus:ring-violet-500 w-4 h-4 cursor-pointer"
                        />
                        <span>{cType.isActive ? 'Active' : 'Disabled'}</span>
                      </label>

                      {!cType.isSystem && (
                        <button
                          type="button"
                          onClick={() => handleDelete(cType.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Standard Defaults</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-sm transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
