import React, { useState } from 'react';
import {
  X,
  FolderInput,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { F2FintechLogo } from './F2FintechLogo';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (rootUrl: string, name?: string) => Promise<void>;
  currentRootUrl?: string;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  currentRootUrl,
}) => {
  const [url, setUrl] = useState(
    currentRootUrl || 'https://drive.google.com/drive/folders/1xFVOGEiQNshKBpA8tQoedy9FfPTP4rjn?usp=sharing'
  );
  const [name, setName] = useState('Main MIS Drive Directory');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const extractId = (val: string) => {
    const trimmed = val.trim();
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    const idParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParam) return idParam[1];
    if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) return trimmed;
    return null;
  };

  const detectedId = extractId(url);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detectedId) {
      setError('Please provide a valid Google Drive folder link or folder ID.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onConnect(url.trim(), name.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect directory');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <F2FintechLogo variant="icon" size="sm" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Connect Google Drive Directory</h2>
              <p className="text-[11px] text-slate-500">Paste your root Google Drive folder link to scan and index</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase font-mono tracking-wider">
              Google Drive Root Folder URL:
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/1xFVOGEiQNshKBpA8tQoedy9FfPTP4rjn?usp=sharing"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white font-mono transition-colors"
            />

            {detectedId ? (
              <div className="mt-2 text-[11px] font-mono text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Extracted Folder ID: <strong>{detectedId}</strong></span>
              </div>
            ) : (
              <div className="mt-2 text-[11px] font-mono text-slate-400">
                Paste any shared Google Drive folder link. Folder ID will be detected automatically.
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase font-mono tracking-wider">
              Source Directory Label:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main MIS Drive Folder"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition-colors"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-[11px] text-blue-900 space-y-1">
            <span className="font-bold text-blue-900 block">Automatic Recursive Scanning:</span>
            <span className="text-blue-700">All nested subfolders, workbooks, worksheets and rows will be discovered and indexed automatically without requiring individual file uploads.</span>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !detectedId}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <FolderInput className="w-4 h-4" />
                  <span>CONNECT DIRECTORY</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
