export interface SelfDestructOptions {
  expireAfterSeconds: number; // 0 = no time limit, e.g. 300, 900, 3600, 86400
  downloadLimit: number; // 0 = unlimited, 1 = single download, 3 = three downloads
  burnAfterRead: boolean; // instant self destruct upon single successful transfer
  passwordRequired: boolean;
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  chunkSize: number;
  totalChunks: number;
  checksum: string; // SHA-256 unencrypted hash
}

export interface TransferSession {
  roomId: string;
  senderId: string;
  files: FileMetadata[];
  totalSize: number;
  options: SelfDestructOptions;
  createdAt: number;
  expiresAt: number | null;
  downloadsCount: number;
  status: 'waiting' | 'connecting' | 'transferring' | 'completed' | 'destructed' | 'expired' | 'error';
  encryptedKey?: string; // stored in URL fragment, not on server
  passwordSalt?: string;
  error?: string;
}

export interface TransferStats {
  bytesTransferred: number;
  totalBytes: number;
  chunksTransferred: number;
  totalChunks: number;
  speedBytesPerSec: number; // calculated speed
  etaSeconds: number;
  currentFileName: string;
  currentFileIndex: number;
  totalFiles: number;
}

export type SignalingMessageType =
  | 'CREATE_ROOM'
  | 'ROOM_CREATED'
  | 'JOIN_ROOM'
  | 'PEER_JOINED'
  | 'PEER_LEFT'
  | 'WEBRTC_OFFER'
  | 'WEBRTC_ANSWER'
  | 'ICE_CANDIDATE'
  | 'TRANSFER_START'
  | 'TRANSFER_PROGRESS'
  | 'TRANSFER_COMPLETE'
  | 'DESTRUCT_ROOM'
  | 'ROOM_DESTRUCTED'
  | 'ERROR'
  | 'RELAY_CHUNK'
  | 'READY_TO_RECEIVE';

export interface SignalingMessage {
  type: SignalingMessageType;
  roomId: string;
  senderId?: string;
  peerId?: string;
  payload?: any;
}

export interface TransferHistoryItem {
  id: string;
  roomId: string;
  role: 'sender' | 'receiver';
  filesCount: number;
  totalSize: number;
  fileNames: string[];
  transferredAt: number;
  status: 'completed' | 'destructed' | 'cancelled';
  speedPeak: number; // B/s
}
