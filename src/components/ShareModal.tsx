import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Flame,
  Radio,
  Wifi,
  Smartphone,
  X,
  Lock,
} from 'lucide-react';
import { generateQRCodeDataUrl } from '../lib/qr';
import { SelfDestructOptions, FileMetadata } from '../types';
import { formatFileSize } from '../lib/crypto';

interface ShareModalProps {
  shareUrl: string;
  files: FileMetadata[];
  options: SelfDestructOptions;
  expiresAt: number | null;
  receiverCount: number;
  onClose: () => void;
  onCancel: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  shareUrl,
  files,
  options,
  expiresAt,
  receiverCount,
  onClose,
  onCancel,
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');

  useEffect(() => {
    if (shareUrl) {
      generateQRCodeDataUrl(shareUrl).then(setQrCodeDataUrl);
    }
  }, [shareUrl]);

  // Countdown timer effect
  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = expiresAt - now;
      if (diff <= 0) {
        setTimeLeftStr('Expired');
        clearInterval(interval);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeftStr(`${mins}m ${secs.toString().padStart(2, '0')}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-600" />
            <span>Room Ready • Waiting for Receiver</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 font-sans">Scan QR Code or Share Unique Link</h3>
          <p className="text-xs text-slate-500 font-medium">
            {files.length} file(s) ({formatFileSize(totalSize)}) encrypted & ready for transfer
          </p>
        </div>

        {/* QR Code Card */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 bg-slate-50/80 p-5 rounded-2xl border border-slate-200">
          <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-center shrink-0">
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="QR Code for mobile transfer"
                className="w-48 h-48 block rounded-md select-none [image-rendering:pixelated]"
              />
            ) : (
              <div className="w-48 h-48 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-slate-400 text-xs">
                Generating QR...
              </div>
            )}
          </div>

          <div className="space-y-3 text-xs text-left">
            <div className="flex items-center space-x-2 text-slate-800 font-bold">
              <Smartphone className="w-4 h-4 text-indigo-600" />
              <span>Scan with Phone Camera</span>
            </div>
            <p className="text-slate-500 leading-relaxed font-medium">
              Open your camera app on mobile connected to Wi-Fi to scan this QR code and immediately stream the encrypted file directly to your phone.
            </p>

            <div className="space-y-1 pt-2 border-t border-slate-200">
              <div className="flex items-center space-x-2 text-amber-600 font-medium text-[11px]">
                <Flame className="w-3.5 h-3.5" />
                <span>
                  Self-destruct:{' '}
                  {options.downloadLimit === 1 ? '1 download max' : `${options.downloadLimit} downloads max`}
                </span>
              </div>
              {timeLeftStr && (
                <div className="text-indigo-600 font-semibold text-[11px]">
                  <span>Timer remaining: {timeLeftStr}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3 text-[11px] text-amber-800 font-medium">
            <p className="font-bold flex items-center space-x-1">
              <span>💡 Localhost Tip for Mobile Transfer:</span>
            </p>
            <p className="mt-0.5 text-amber-700">
              For phone-to-computer Wi-Fi transfer, open SowaLink on your computer using your Wi-Fi IP (e.g. <code className="font-mono bg-amber-100/80 px-1 py-0.5 rounded">http://192.168.x.x:3000</code>) so your phone can reach it.
            </p>
          </div>
        )}

        {/* Link Output Field */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-600" />
              <span>End-to-End Encrypted Link</span>
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold">Key in fragment (#key=...)</span>
          </label>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-indigo-600 font-medium truncate focus:outline-none focus:border-indigo-600"
              id="share-url-input"
            />

            <button
              onClick={copyToClipboard}
              id="copy-link-btn"
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center space-x-1.5 transition-colors shrink-0 shadow-sm shadow-indigo-500/20 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Receiver Joined Indicator & Quick Test Action */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs border-t border-slate-100">
          <div className="flex items-center space-x-2 text-slate-600 font-medium">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Status: {receiverCount > 0 ? `${receiverCount} Receiver Connected!` : 'Listening on Wi-Fi P2P...'}
            </span>
          </div>

          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            id="open-receiver-tab-btn"
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-indigo-600 rounded-xl transition-colors font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Test Receiver in New Tab</span>
          </a>
        </div>
      </div>
    </div>
  );
};
