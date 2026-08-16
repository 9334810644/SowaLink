import React, { useState } from 'react';
import { ShieldCheck, Zap, CloudOff, Activity, History, Info, Lock, Moon, Sun } from 'lucide-react';

interface NavbarProps {
  onOpenHistory: () => void;
  onOpenNetwork: () => void;
  activeSessionCount: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenHistory,
  onOpenNetwork,
  activeSessionCount,
  theme,
  onToggleTheme,
}) => {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/90 border-b border-slate-200 text-slate-800 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-extrabold text-xl tracking-tight text-slate-900 font-sans">
                SowaLink
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/80 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>WiFi P2P Active</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">Zero-Cloud End-to-End Encrypted File Transfer</p>
          </div>
        </div>

        {/* Security Badges */}
        <div className="hidden lg:flex items-center space-x-3 text-xs font-medium">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>AES-256-GCM E2EE</span>
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
            <Zap className="w-4 h-4 text-emerald-600" />
            <span>Direct LAN / WebRTC</span>
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
            <CloudOff className="w-4 h-4 text-slate-500" />
            <span>Zero Cloud Storage</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleTheme}
            id="theme-toggle-btn"
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-600 transition-colors"
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowInfo(!showInfo)}
            id="nav-info-btn"
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-600 transition-colors"
            title="Security Architecture"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenNetwork}
            id="nav-network-btn"
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-medium transition-colors text-xs"
          >
            <Activity className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">WiFi Inspector</span>
          </button>

          <button
            onClick={onOpenHistory}
            id="nav-history-btn"
            className="relative flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-100 text-indigo-600 transition-colors text-xs font-semibold"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Transfers</span>
            {activeSessionCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-indigo-600 text-white font-bold text-[10px]">
                {activeSessionCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Info popover modal */}
      {showInfo && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-4 sm:px-8 text-xs text-slate-600">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center space-x-2 text-indigo-600 font-bold mb-1">
                <Lock className="w-4 h-4" />
                <span>Zero-Knowledge Encryption</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                Encryption keys are generated in browser RAM using Web Crypto API. Keys exist strictly in the link hash fragment (#key=...) which is NEVER sent to any server.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center space-x-2 text-emerald-600 font-bold mb-1">
                <Zap className="w-4 h-4" />
                <span>Direct Wi-Fi / WebRTC Stream</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                Data travels directly between device Wi-Fi chips via WebRTC Data Channels. High-speed local peer transfer bypasses cloud uploads entirely.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center space-x-2 text-indigo-600 font-bold mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Self-Destruct Mechanisms</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                Rooms automatically self-destruct upon single download completion or expiration countdowns. Memory is wiped with zero residual trace.
              </p>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
