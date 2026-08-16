import React from 'react';
import { Flame, ShieldAlert, RotateCcw, Lock } from 'lucide-react';

interface SelfDestructedViewProps {
  reason?: string;
  onReset: () => void;
}

export const SelfDestructedView: React.FC<SelfDestructedViewProps> = ({
  reason = 'This transfer room has self-destructed as requested.',
  onReset,
}) => {
  return (
    <div className="w-full max-w-lg mx-auto bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-6 shadow-sm shadow-slate-200/60">
      <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shadow-xs">
          <Flame className="w-8 h-8 text-amber-500 fill-amber-500/10" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Zero-Trace Memory Wipe Complete</span>
        </div>

        <h2 className="text-2xl font-extrabold text-slate-900 font-sans">Transfer Self-Destructed</h2>
        <p className="text-sm text-slate-500 leading-relaxed font-medium">{reason}</p>
      </div>

      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-left space-y-2 text-slate-600 font-medium">
        <div className="flex items-center space-x-2 text-indigo-600 font-bold">
          <Lock className="w-4 h-4" />
          <span>Security Audit Trail:</span>
        </div>
        <ul className="space-y-1 text-xs list-disc list-inside text-slate-600">
          <li>Cryptographic AES-256 keys cleared from client memory</li>
          <li>WebRTC data channels disconnected & closed</li>
          <li>Signaling room ID unregistered from server memory</li>
          <li>Zero server cloud logs or file residue retained</li>
        </ul>
      </div>

      <button
        onClick={onReset}
        id="new-transfer-btn"
        className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-colors shadow-sm shadow-indigo-500/20 cursor-pointer"
      >
        <RotateCcw className="w-4 h-4 text-white" />
        <span>Start New Secure Transfer</span>
      </button>
    </div>
  );
};
