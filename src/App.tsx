import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { FileUploader } from './components/FileUploader';
import { ShareModal } from './components/ShareModal';
import { TransferProgress } from './components/TransferProgress';
import { ReceiverView } from './components/ReceiverView';
import { SelfDestructedView } from './components/SelfDestructedView';
import { NetworkInspector } from './components/NetworkInspector';
import { TransferHistory } from './components/TransferHistory';

import { P2PTransferManager } from './lib/webrtc';
import {
  generateAESKey,
  exportKeyToBase64,
  importKeyFromBase64,
  calculateSHA256,
  deriveKeyFromPassword,
} from './lib/crypto';
import {
  FileMetadata,
  SelfDestructOptions,
  TransferStats,
  TransferHistoryItem,
} from './types';
import { Zap, ShieldCheck, Lock, Flame, RefreshCw, Smartphone } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storedTheme = localStorage.getItem('sowalink-theme');
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [mode, setMode] = useState<'upload' | 'share' | 'transferring' | 'receiver' | 'destructed'>(
    'upload'
  );

  // Sender state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileMetadataList, setFileMetadataList] = useState<FileMetadata[]>([]);
  const [transferOptions, setTransferOptions] = useState<SelfDestructOptions>({
    expireAfterSeconds: 900,
    downloadLimit: 1,
    burnAfterRead: true,
    passwordRequired: false,
  });
  const [shareUrl, setShareUrl] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [receiverCount, setReceiverCount] = useState<number>(0);

  // Receiver state
  const [receiverRoomId, setReceiverRoomId] = useState<string>('');
  const [passwordSalt, setPasswordSalt] = useState<string | undefined>(undefined);
  const [receiverError, setReceiverError] = useState<string>('');
  const [isReceiverConnecting, setIsReceiverConnecting] = useState<boolean>(false);

  // Shared Transfer state
  const [role, setRole] = useState<'sender' | 'receiver'>('sender');
  const [stats, setStats] = useState<TransferStats | null>(null);
  const [connectionType, setConnectionType] = useState<'webrtc_p2p' | 'websocket_relay'>('webrtc_p2p');
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [downloadedBlobs, setDownloadedBlobs] = useState<{ meta: FileMetadata; blob: Blob }[]>([]);

  // Self-destruct state
  const [destructReason, setDestructReason] = useState<string>('');

  // Modals & History
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showNetwork, setShowNetwork] = useState<boolean>(false);
  const [history, setHistory] = useState<TransferHistoryItem[]>([]);

  // P2P Manager Ref & Polling Interval Ref
  const managerRef = useRef<P2PTransferManager | null>(null);
  const senderFilesRef = useRef<{ files: File[]; metaList: FileMetadata[] } | null>(null);
  const downloadIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('sowalink-theme', theme);
  }, [theme]);

  // Check URL Hash on Load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('room=')) {
      parseHashAndConnect(hash);
    }

    const handleHashChange = () => {
      if (window.location.hash && window.location.hash.includes('room=')) {
        parseHashAndConnect(window.location.hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const parseHashAndConnect = async (hashStr: string) => {
    setMode('receiver');
    setRole('receiver');
    setIsReceiverConnecting(true);
    setReceiverError('');

    // Flexible parameter extraction: check query params first, then hash fragment
    const searchParams = new URLSearchParams(window.location.search);
    let cleanHash = (hashStr || window.location.hash).replace(/^#/, '').replace(/^\//, '');
    if (cleanHash.includes('?')) {
      cleanHash = cleanHash.split('?')[1];
    }
    const hashParams = new URLSearchParams(cleanHash);

    const rId = searchParams.get('room') || hashParams.get('room');
    const keyBase64 = searchParams.get('key') || hashParams.get('key');

    if (!rId) {
      setReceiverError('Invalid or corrupted file transfer link.');
      setIsReceiverConnecting(false);
      return;
    }

    setReceiverRoomId(rId);

    // Import AES Key if present in URL
    let aesKey: CryptoKey | null = null;
    if (keyBase64) {
      try {
        aesKey = await importKeyFromBase64(keyBase64);
      } catch (keyErr) {
        console.error('Failed to import AES key:', keyErr);
        setReceiverError('Invalid or corrupted encryption key in transfer link.');
        setIsReceiverConnecting(false);
        return;
      }
    }

    // Instantiate Manager
    const manager = new P2PTransferManager({
      onTransferStart: (files, options, receivedPasswordSalt) => {
        setFileMetadataList(files);
        setTransferOptions(options);
        setPasswordSalt(receivedPasswordSalt);
        setIsReceiverConnecting(false);
      },
      onPeerLeft: () => {
        setReceiverError('The sender has disconnected from this transfer room.');
        setIsReceiverConnecting(false);
      },
      onConnectionTypeChange: (type) => setConnectionType(type),
      onTransferProgress: (s) => setStats(s),
      onFilesReceived: (blobs) => {
        setDownloadedBlobs(blobs);
        setIsCompleted(true);

        // Browser download prompts may be blocked without a user gesture on
        // some phones, so TransferProgress also keeps an explicit Save button.
        blobs.forEach(({ meta, blob }) => triggerBlobDownload(meta, blob));
        manager.notifyDownloadComplete();
        recordHistoryItem('receiver', blobs.map(({ meta }) => meta));
      },
      onTransferComplete: () => handleTransferComplete('receiver'),
      onRoomDestructed: (reason) => handleRoomDestructed(reason),
      onError: (err) => {
        setReceiverError(err);
        setIsReceiverConnecting(false);
      },
    });

    if (aesKey) {
      manager.setKey(aesKey);
    }

    try {
      await manager.connect();
    } catch (connErr) {
      console.error('Failed to connect to signaling server:', connErr);
      setReceiverError('Could not connect to signaling server. Please verify network connection.');
      setIsReceiverConnecting(false);
      return;
    }

    manager.joinRoom(rId);
    managerRef.current = manager;
  };

  // Sender: Generate Link & QR Code
  const handleGenerateLink = async (files: File[], options: SelfDestructOptions, password?: string) => {
    try {
      setSelectedFiles(files);
      setTransferOptions(options);
      setRole('sender');

      // Compute metadata & SHA-256 hashes for files
      const metaList: FileMetadata[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
        const checksum = await calculateSHA256(buffer);

        metaList.push({
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          chunkSize: 64 * 1024,
          totalChunks: Math.ceil(file.size / (64 * 1024)),
          checksum,
        });
      }

      setFileMetadataList(metaList);
      senderFilesRef.current = { files, metaList };

      const passwordSalt = password ? Math.random().toString(36).substring(2, 10) : undefined;
      setPasswordSalt(passwordSalt);

      let aesKey: CryptoKey;
      let base64Key: string | undefined;

      if (options.passwordRequired && password && passwordSalt) {
        const encoder = new TextEncoder();
        aesKey = await deriveKeyFromPassword(password, encoder.encode(passwordSalt));
      } else {
        aesKey = await generateAESKey();
        base64Key = await exportKeyToBase64(aesKey);
      }

      // Create P2P Manager
      const manager = new P2PTransferManager({
        onRoomCreated: async (rId, expAt) => {
          setRoomId(rId);
          setExpiresAt(expAt);

          let baseUrl = `${window.location.origin}${window.location.pathname}`;
          if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            try {
              const res = await fetch('/api/network-info');
              if (res.ok) {
                const data = await res.json();
                if (data.primaryIp && data.primaryIp !== 'localhost') {
                  baseUrl = `${window.location.protocol}//${data.primaryIp}:${data.port}${window.location.pathname}`;
                }
              }
            } catch (e) {
              console.warn('Could not fetch network info:', e);
            }
          }

          const keyQuery = base64Key ? `&key=${base64Key}` : '';
          const fullUrl = `${baseUrl}#room=${rId}${keyQuery}`;
          setShareUrl(fullUrl);
          setMode('share');
        },
        onPeerJoined: (count) => {
          setReceiverCount(count);
        },
        onPeerLeft: () => {
          setReceiverCount((prev) => Math.max(0, prev - 1));
        },
        onReadyToReceive: () => {
          setMode('transferring');
          if (senderFilesRef.current && managerRef.current) {
            managerRef.current.sendFiles(senderFilesRef.current.files, senderFilesRef.current.metaList);
          }
        },
        onConnectionTypeChange: (type) => setConnectionType(type),
        onTransferProgress: (s) => setStats(s),
        onTransferComplete: () => handleTransferComplete('sender'),
        onRoomDestructed: (reason) => handleRoomDestructed(reason),
        onError: (err) => console.error('Sender error:', err),
      });

      manager.setKey(aesKey);
      await manager.connect();

      manager.createRoom(metaList, options, passwordSalt);
      managerRef.current = manager;
    } catch (err) {
      console.error('Failed to generate link:', err);
    }
  };

  // Receiver: Start Stream Download
  const handleStartDownload = async (derivedKey?: CryptoKey) => {
    if (!managerRef.current) return;
    if (derivedKey) {
      managerRef.current.setKey(derivedKey);
    }

    setMode('transferring');

    // Notify sender that receiver is ready to receive stream
    managerRef.current.requestStartDownload();

  };

  const triggerBlobDownload = async (meta: FileMetadata, blob: Blob) => {
    // 1. Try Web Share API for native mobile file save (iOS Files / Android Downloads)
    try {
      const file = new File([blob], meta.name, { type: blob.type || 'application/octet-stream' });
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: meta.name,
        });
        return;
      }
    } catch (shareErr) {
      console.warn('Web share skipped or dismissed:', shareErr);
    }

    // 2. Standard Anchor download with extended Object URL lifetime (300,000ms = 5 mins)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = meta.name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Keep Object URL valid for 5 minutes so mobile OS download manager finishes writing to disk
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  };

  const handleTransferComplete = (roleCompleted: 'sender' | 'receiver') => {
    setIsCompleted(true);
    if (roleCompleted === 'sender') {
      recordHistoryItem('sender', fileMetadataList);
    }
  };

  const recordHistoryItem = (r: 'sender' | 'receiver', metaList: FileMetadata[]) => {
    const totalSize = metaList.reduce((acc, f) => acc + f.size, 0);
    const item: TransferHistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      roomId: roomId || receiverRoomId,
      role: r,
      filesCount: metaList.length,
      totalSize,
      fileNames: metaList.map((f) => f.name),
      transferredAt: Date.now(),
      status: 'completed',
      speedPeak: stats ? stats.speedBytesPerSec : 0,
    };
    setHistory((prev) => [item, ...prev]);
  };

  const handleRoomDestructed = (reason: string) => {
    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
      downloadIntervalRef.current = null;
    }
    setDestructReason(reason);
    setMode('destructed');
    if (managerRef.current) {
      managerRef.current.close();
      managerRef.current = null;
    }
  };

  const handleCancelTransfer = () => {
    if (managerRef.current) {
      managerRef.current.destructRoom();
    }
    handleReset();
  };

  const handleReset = () => {
    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
      downloadIntervalRef.current = null;
    }
    if (managerRef.current) {
      managerRef.current.close();
      managerRef.current = null;
    }
    // Clear URL Hash without page reload safely using window.history
    window.history.pushState('', document.title, window.location.pathname + window.location.search);

    setMode('upload');
    setSelectedFiles([]);
    setFileMetadataList([]);
    setShareUrl('');
    setRoomId('');
    setExpiresAt(null);
    setReceiverCount(0);
    setStats(null);
    setIsCompleted(false);
    setDownloadedBlobs([]);
    setReceiverError('');
  };

  return (
    <div className="app-shell min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-500 selection:text-white flex flex-col">
      {/* Top Navbar */}
      <Navbar
        onOpenHistory={() => setShowHistory(true)}
        onOpenNetwork={() => setShowNetwork(true)}
        activeSessionCount={history.length}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col justify-center items-center">
        {mode === 'upload' && <FileUploader onGenerateLink={handleGenerateLink} />}

        {mode === 'share' && (
          <ShareModal
            shareUrl={shareUrl}
            files={fileMetadataList}
            options={transferOptions}
            expiresAt={expiresAt}
            receiverCount={receiverCount}
            onClose={handleReset}
            onCancel={handleCancelTransfer}
          />
        )}

        {mode === 'receiver' && (
          <ReceiverView
            files={fileMetadataList}
            options={transferOptions}
            expiresAt={expiresAt}
            passwordSalt={passwordSalt}
            onStartDownload={handleStartDownload}
            error={receiverError}
            isConnecting={isReceiverConnecting}
          />
        )}

        {mode === 'transferring' && (
          <TransferProgress
            role={role}
            files={fileMetadataList}
            options={transferOptions}
            stats={stats}
            connectionType={connectionType}
            onCancel={handleCancelTransfer}
            isCompleted={isCompleted}
            downloadedBlobs={downloadedBlobs}
            onDownloadFile={triggerBlobDownload}
          />
        )}

        {mode === 'destructed' && (
          <SelfDestructedView reason={destructReason} onReset={handleReset} />
        )}
      </main>

      {/* Modals */}
      {showNetwork && (
        <NetworkInspector connectionType={connectionType} onClose={() => setShowNetwork(false)} />
      )}

      {showHistory && (
        <TransferHistory
          history={history}
          onClearHistory={() => setHistory([])}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 font-medium">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>SowaLink • Zero-Cloud E2EE Direct WiFi Peer-to-Peer Transfer</span>
          </div>

          <div className="flex items-center space-x-4 font-medium text-[11px] text-slate-400">
            <span>WebCrypto AES-256-GCM</span>
            <span>•</span>
            <span>WebRTC RTCDataChannel</span>
            <span>•</span>
            <span>Self-Destruct Links</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
