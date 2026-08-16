import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Trash2,
  Clock,
  Flame,
  KeyRound,
  Shield,
  Zap,
  Lock,
  Plus,
  FileCheck,
  FileCode,
  Video,
  Image as ImageIcon,
  Archive,
} from 'lucide-react';
import { formatFileSize } from '../lib/crypto';
import { SelfDestructOptions } from '../types';

interface FileUploaderProps {
  onGenerateLink: (files: File[], options: SelfDestructOptions, password?: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onGenerateLink }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Self Destruct Settings State
  const [expireSeconds, setExpireSeconds] = useState<number>(900); // Default 15 mins
  const [downloadLimit, setDownloadLimit] = useState<number>(1); // Default 1 download (single use)
  const [burnAfterRead, setBurnAfterRead] = useState<boolean>(true);
  const [enablePassword, setEnablePassword] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArr = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArr]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArr = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => [...prev, ...filesArr]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
  };

  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const getFileIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-indigo-600" />;
    if (type.startsWith('video/')) return <Video className="w-5 h-5 text-purple-600" />;
    if (type.includes('pdf') || type.includes('doc')) return <FileText className="w-5 h-5 text-emerald-600" />;
    if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return <Archive className="w-5 h-5 text-amber-600" />;
    if (type.includes('javascript') || type.includes('json') || type.includes('code')) return <FileCode className="w-5 h-5 text-indigo-600" />;
    return <FileCheck className="w-5 h-5 text-slate-500" />;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    if (enablePassword && !password.trim()) {
      setPasswordError('Please specify a password or uncheck password requirement.');
      return;
    }
    setPasswordError('');

    const options: SelfDestructOptions = {
      expireAfterSeconds: expireSeconds,
      downloadLimit,
      burnAfterRead,
      passwordRequired: enablePassword && password.trim().length > 0,
    };

    onGenerateLink(selectedFiles, options, enablePassword ? password.trim() : undefined);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm shadow-slate-200/60">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>End-to-End Encrypted WiFi Direct</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-sans">
            Share Large Files Securely
          </h2>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            Direct device-to-device streaming over local Wi-Fi. Files are encrypted in your browser and never touch cloud storage.
          </p>
        </div>

        {/* Drag & Drop Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          id="dropzone-area"
          className={`relative group cursor-pointer border-2 border-dashed rounded-3xl p-8 md:p-10 text-center transition-all duration-200 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
              : 'border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
            id="file-input-field"
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <UploadCloud className="w-8 h-8 text-indigo-600" />
            </div>

            <div>
              <p className="text-base font-bold text-slate-800">
                Drag & drop files here, or <span className="text-indigo-600 underline font-extrabold">browse</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports unlimited file sizes (PDFs, Videos, Archives, Documents)
              </p>
            </div>

            <div className="flex items-center space-x-4 text-xs font-medium text-slate-500 pt-2">
              <span className="flex items-center space-x-1">
                <Shield className="w-3.5 h-3.5 text-indigo-600" />
                <span>AES-256-GCM</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span>P2P WiFi Direct</span>
              </span>
            </div>
          </div>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
              <div className="flex items-center space-x-2 text-slate-800 font-bold">
                <span>Selected Files ({selectedFiles.length})</span>
                <span className="text-indigo-600 font-mono">({formatFileSize(totalSize)})</span>
              </div>
              <button
                type="button"
                onClick={clearAllFiles}
                className="text-slate-500 hover:text-red-600 transition-colors flex items-center space-x-1 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {selectedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200/80 text-xs shadow-xs"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    {getFileIcon(file)}
                    <div className="truncate">
                      <p className="font-semibold text-slate-800 truncate">{file.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Self Destruct & Privacy Settings */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-slate-800">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>Self-Destruct & Security Settings</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Expiration Timer */}
            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Link Expiration Timer</span>
              </label>
              <select
                value={expireSeconds}
                onChange={(e) => setExpireSeconds(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
                id="expire-select"
              >
                <option value={300}>5 Minutes</option>
                <option value={900}>15 Minutes (Recommended)</option>
                <option value={3600}>1 Hour</option>
                <option value={86400}>24 Hours</option>
                <option value={0}>Never (Active while tab is open)</option>
              </select>
            </div>

            {/* Download Limit */}
            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold flex items-center space-x-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>Download Limit (Auto Self-Destruct)</span>
              </label>
              <select
                value={downloadLimit}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDownloadLimit(val);
                  setBurnAfterRead(val === 1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
                id="download-limit-select"
              >
                <option value={1}>1 Download (Burn After Single Access)</option>
                <option value={3}>3 Downloads</option>
                <option value={5}>5 Downloads</option>
                <option value={0}>Unlimited Downloads</option>
              </select>
            </div>
          </div>

          {/* Password Protection */}
          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enablePassword}
                onChange={(e) => setEnablePassword(e.target.checked)}
                className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                id="password-checkbox"
              />
              <span className="text-slate-700 font-semibold flex items-center space-x-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                <span>Require Secondary Access Password</span>
              </span>
            </label>

            {enablePassword && (
              <div className="w-full sm:w-64 space-y-1">
                <input
                  type="password"
                  placeholder="Enter secret password..."
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (e.target.value.trim()) setPasswordError('');
                  }}
                  className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 w-full shadow-xs text-xs"
                  id="password-input"
                />
                {passwordError && <p className="text-[11px] text-red-600 font-medium">{passwordError}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Generate Link Button */}
        <button
          type="submit"
          disabled={selectedFiles.length === 0}
          id="generate-link-btn"
          className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center space-x-2 transition-all shadow-md ${
            selectedFiles.length > 0
              ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20 cursor-pointer active:scale-[0.99]'
              : 'bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
          }`}
        >
          <Zap className="w-5 h-5 fill-white" />
          <span>Generate Secure Link & QR Code</span>
        </button>
      </form>
    </div>
  );
};
