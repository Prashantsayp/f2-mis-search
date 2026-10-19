import React, { useState, useEffect } from 'react';
import {
  Layers,
  Search,
  Eye,
  CheckSquare,
  Square,
  FileSpreadsheet,
} from 'lucide-react';
import { SheetItem } from '../types';

interface SheetsViewProps {
  onPreviewSheet: (fileId: string, sheetName: string) => void;
  initialSearchTerm?: string;
}

export const SheetsView: React.FC<SheetsViewProps> = ({ onPreviewSheet, initialSearchTerm }) => {
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');

  useEffect(() => {
    if (initialSearchTerm !== undefined) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  const loadSheets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sheets');
      const data = await res.json();
      setSheets(data.sheets || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSheets();
  }, []);

  const toggleIndex = async (fileId: string, sheetName: string, currentVal: boolean) => {
    try {
      await fetch('/api/sheets/toggle-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, sheetName, isIndexed: !currentVal }),
      });
      setSheets(prev =>
        prev.map(s =>
          s.fileId === fileId && s.sheetName === sheetName
            ? { ...s, isIndexed: !currentVal }
            : s
        )
      );
    } catch (e) {
      console.error(e);
    }
  };

  const filteredSheets = sheets.filter(s =>
    s.sheetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.folderPath.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-600" />
            <span>Sheets Manager &amp; Index Selection</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Choose specific worksheets to include or exclude from the global search index without touching source files.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search sheets or workbooks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors shadow-2xs"
          />
        </div>
      </div>

      {/* Sheets List Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-sans text-[11px] font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">Indexed</th>
                <th className="py-3 px-4">Sheet Name</th>
                <th className="py-3 px-4">Parent Workbook</th>
                <th className="py-3 px-4">Folder Path</th>
                <th className="py-3 px-4 text-right">Rows</th>
                <th className="py-3 px-4 text-right">Columns</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 font-medium">
                    Loading sheets configuration...
                  </td>
                </tr>
              ) : filteredSheets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 font-medium">
                    No worksheets found matching "{searchTerm}"
                  </td>
                </tr>
              ) : (
                filteredSheets.map((sheet) => (
                  <tr key={sheet.id} className="hover:bg-blue-50/40 transition-colors group">
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => toggleIndex(sheet.fileId, sheet.sheetName, sheet.isIndexed)}
                        className="text-slate-400 hover:text-blue-600 cursor-pointer transition-colors p-1"
                        title={sheet.isIndexed ? 'Included in Global Search' : 'Excluded from Search'}
                      >
                        {sheet.isIndexed ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>{sheet.sheetName}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate max-w-[180px]">{sheet.fileName}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-semibold">
                        {sheet.folderPath}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      {sheet.rowsCount ? sheet.rowsCount.toLocaleString() : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                      {sheet.colsCount || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onPreviewSheet(sheet.fileId, sheet.sheetName)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Preview</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
