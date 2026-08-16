import React, { useState } from 'react';
import {
  Download,
  Lock,
  ShieldCheck,
  Zap,
  Clock,
  Flame,
  KeyRound,
  FileText,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { FileMetadata, SelfDestructOptions } from '../types';
import { formatFileSize, deriveKeyFromPassword } from '../lib/crypto';

interface ReceiverViewProps {
  files: FileMetadata[];
  options: SelfDestructOptions;
  expiresAt: number | null;
  passwordSalt?: string;
  onStartDownload: (derivedKey?: CryptoKey) => void;
  error?: string;
  isConnecting: boolean;
}

export const ReceiverView: React.FC<ReceiverViewProps> = ({
  files,
  options,
  expiresAt,
  passwordSalt,
  onStartDownload,
  error,
  isConnecting,
}) => {
  const [password, setPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [isDerivingKey, setIsDerivingKey] = useState<boolean>(false);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setPasswordError('Please enter the secret password');
      return;
    }

    try {
      setIsDerivingKey(true);
      setPasswordError('');
      const encoder = new TextEncoder();
      const saltBytes = passwordSalt ? encoder.encode(passwordSalt) : new Uint8Array(16);
      const derivedKey = await deriveKeyFromPassword(password.trim(), saltBytes);
      onStartDownload(derivedKey);
    } catch (err) {
      console.error('Password derivation error:', err);
      setPasswordError('Failed to derive cryptographic key from password');
    } finally {
      setIsDerivingKey(false);
    }
  };

  const handleStart = () => {
    if (options.passwordRequired) {
      return;
    }
    onStartDownload();
  };

  if (error) {
    return (
      <div className="w-full max-w-lg mx-auto bg-white border border-red-200 rounded-3xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-extrabold text-slate-900 font-sans">Transfer Link Unavailable</h3>
        <p className="text-sm text-slate-600 leading-relaxed font-medium">{error}</p>
        <div className="pt-2 text-xs text-slate-500 font-medium">
          Make sure the sender's browser tab is still open on the computer and that both devices are connected to the network.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm shadow-slate-200/60 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          <span>E2E Encrypted P2P Stream</span>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 font-sans">Incoming File Shared with You</h2>
        <p className="text-xs text-slate-500 font-medium">
          Sender is connected on Wi-Fi P2P. Direct stream download without cloud storage.
        </p>
      </div>

      {/* File Metadata Overview */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
          <div className="flex items-center space-x-2 font-bold text-slate-800">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>Files Payload ({files.length})</span>
          </div>
          <span className="font-mono font-bold text-indigo-600">{formatFileSize(totalSize)}</span>
        </div>

        <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs shadow-xs"
            >
              <div className="truncate pr-2">
                <p className="font-bold text-slate-800 truncate">{file.name}</p>
                <p className="text-[11px] text-slate-500 font-mono">{formatFileSize(file.size)}</p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-semibold">
                AES-256
              </span>
            </div>
          ))}
        </div>

        {/* Security & Destruction badges */}
        <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 text-xs font-medium text-slate-600">
          <div className="flex items-center space-x-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>
              Limit: {options.downloadLimit === 1 ? '1 download (Burn)' : `${options.downloadLimit} downloads`}
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>SHA-256 Validated</span>
          </div>
        </div>
      </div>

      {/* Password prompt if protected */}
      {options.passwordRequired ? (
        <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-2">
          <div className="space-y-2 text-left">
            <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Enter Password to Decrypt</span>
            </label>
            <input
              type="password"
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              id="receiver-password-input"
            />
            {passwordError && <p className="text-xs text-red-600 font-medium">{passwordError}</p>}
          </div>

          <button
            type="submit"
            disabled={isDerivingKey || isConnecting}
            id="decrypt-start-btn"
            className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center space-x-2 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
          >
            <Download className="w-5 h-5" />
            <span>{isDerivingKey ? 'Deriving Key...' : 'Decrypt & Stream Download'}</span>
          </button>
        </form>
      ) : (
        <button
          onClick={handleStart}
          disabled={isConnecting}
          id="direct-stream-download-btn"
          className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center space-x-2 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
        >
          <Download className="w-5 h-5 fill-white" />
          <span>{isConnecting ? 'Establishing Direct P2P Channel...' : 'Stream Encrypted Download Now'}</span>
        </button>
      )}
    </div>
  );
};
