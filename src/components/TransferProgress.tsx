import React from 'react';
import {
  ShieldCheck,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Lock,
  Flame,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { TransferStats, FileMetadata, SelfDestructOptions } from '../types';
import { formatFileSize } from '../lib/crypto';

interface TransferProgressProps {
  role: 'sender' | 'receiver';
  files: FileMetadata[];
  options: SelfDestructOptions;
  stats: TransferStats | null;
  connectionType: 'webrtc_p2p' | 'websocket_relay';
  onCancel: () => void;
  isCompleted: boolean;
  downloadedBlobs?: { meta: FileMetadata; blob: Blob }[];
  onDownloadFile?: (meta: FileMetadata, blob: Blob) => void;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  role,
  files,
  options,
  stats,
  connectionType,
  onCancel,
  isCompleted,
  downloadedBlobs = [],
  onDownloadFile,
}) => {
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const transferredBytes = stats ? stats.bytesTransferred : 0;
  const progressPercent = totalSize > 0 ? Math.min(100, Math.round((transferredBytes / totalSize) * 100)) : 0;

  const speedStr = stats ? formatFileSize(stats.speedBytesPerSec) + '/s' : '0 B/s';
  const etaStr = stats && stats.etaSeconds > 0 ? `${stats.etaSeconds}s` : 'Calculating...';

  return (
    <div className="w-full max-w-3xl mx-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm shadow-slate-200/60 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              role === 'sender' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
            } border border-slate-100 shadow-xs`}
          >
            {role === 'sender' ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownLeft className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-extrabold text-lg text-slate-900 font-sans">
                {isCompleted
                  ? 'Transfer Completed Successfully'
                  : role === 'sender'
                  ? 'Sending Files via WiFi P2P'
                  : 'Receiving Encrypted Stream'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {files.length} File(s) • Total {formatFileSize(totalSize)} • AES-256 E2EE
            </p>
          </div>
        </div>

        {/* Connection Type Indicator */}
        <div className="flex items-center space-x-2 text-xs">
          <span
            className={`px-3 py-1.5 rounded-full border font-semibold flex items-center space-x-1.5 ${
              connectionType === 'webrtc_p2p'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            <span>{connectionType === 'webrtc_p2p' ? 'WebRTC P2P Direct' : 'In-Memory Relay'}</span>
          </span>
        </div>
      </div>

      {/* Progress Ring / Gauge */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600 font-medium">
            {stats ? `Transferring: ${stats.currentFileName}` : 'Initializing streaming engine...'}
          </span>
          <span className="text-indigo-600 font-bold text-base">{progressPercent}%</span>
        </div>

        {/* Main Progress Bar */}
        <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80 p-0.5">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1">
            <span className="text-slate-500 flex items-center space-x-1 font-medium">
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              <span>Speed</span>
            </span>
            <p className="font-mono font-bold text-sm text-slate-900">{isCompleted ? 'Finished' : speedStr}</p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1">
            <span className="text-slate-500 flex items-center space-x-1 font-medium">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Estimated ETA</span>
            </span>
            <p className="font-mono font-bold text-sm text-slate-900">{isCompleted ? '0s' : etaStr}</p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1">
            <span className="text-slate-500 flex items-center space-x-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Bytes Sent</span>
            </span>
            <p className="font-mono font-bold text-xs text-slate-900">
              {formatFileSize(transferredBytes)} / {formatFileSize(totalSize)}
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1">
            <span className="text-slate-500 flex items-center space-x-1 font-medium">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>Self-Destruct</span>
            </span>
            <p className="font-mono font-bold text-xs text-amber-700">
              {options.burnAfterRead ? 'On Download' : `${options.downloadLimit} downloads`}
            </p>
          </div>
        </div>
      </div>

      {/* Completed Downloads Action List for Receiver */}
      {isCompleted && role === 'receiver' && downloadedBlobs.length > 0 && (
        <div className="bg-emerald-50/80 p-5 rounded-2xl border border-emerald-300 space-y-3 shadow-xs">
          <div className="flex items-center space-x-2 text-emerald-900 font-extrabold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Files Decrypted Successfully! Tap Below to Save:</span>
          </div>

          <div className="space-y-2.5">
            {downloadedBlobs.map(({ meta, blob }, idx) => {
              const fileUrl = URL.createObjectURL(blob);
              return (
                <div
                  key={`${meta.name}-${idx}`}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-xl bg-white border border-emerald-200 text-xs gap-3 shadow-xs"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                    <div className="truncate">
                      <p className="font-extrabold text-slate-800 truncate text-sm">{meta.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {formatFileSize(meta.size)} • SHA-256 Validated
                      </p>
                    </div>
                  </div>

                  <a
                    href={fileUrl}
                    download={meta.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      // Attempt Web Share API first if supported
                      if (typeof navigator !== 'undefined' && navigator.canShare) {
                        const file = new File([blob], meta.name, { type: blob.type || 'application/octet-stream' });
                        if (navigator.canShare({ files: [file] })) {
                          e.preventDefault();
                          onDownloadFile?.(meta, blob);
                        }
                      }
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-md shadow-emerald-500/20 transition-all cursor-pointer active:scale-95 no-underline"
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>Save {meta.name} to Device</span>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-2 flex justify-end">
        {isCompleted ? (
          <button
            onClick={onCancel}
            id="done-transfer-btn"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/20 cursor-pointer"
          >
            <span>Done / Start New Transfer</span>
          </button>
        ) : (
          <button
            onClick={onCancel}
            id="cancel-transfer-btn"
            className="px-4 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>Cancel Transfer</span>
          </button>
        )}
      </div>
    </div>
  );
};
