import React from 'react';
import { History, Trash2, X, CheckCircle2, Flame, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { TransferHistoryItem } from '../types';
import { formatFileSize } from '../lib/crypto';

interface TransferHistoryProps {
  history: TransferHistoryItem[];
  onClearHistory: () => void;
  onClose: () => void;
}

export const TransferHistory: React.FC<TransferHistoryProps> = ({ history, onClearHistory, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 shadow-xl space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h3 className="font-extrabold text-base text-slate-900 font-sans">Session Transfer History</h3>
          </div>

          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs text-slate-500 hover:text-red-600 font-medium flex items-center space-x-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Wipe History</span>
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 space-y-2">
            <History className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-medium">No transfers recorded in this browser session.</p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      item.role === 'sender' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                    }`}
                  >
                    {item.role === 'sender' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                  </div>

                  <div className="truncate">
                    <p className="font-bold text-slate-800 truncate">
                      {item.fileNames.join(', ')} ({item.filesCount} file)
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {formatFileSize(item.totalSize)} • {new Date(item.transferredAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                      item.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {item.status === 'completed' ? 'Completed' : 'Destructed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm shadow-indigo-500/20 cursor-pointer"
        >
          Close History
        </button>
      </div>
    </div>
  );
};
