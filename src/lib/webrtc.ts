import { FileMetadata, SelfDestructOptions, TransferStats } from '../types';
import { decryptChunk, encryptChunk, uint8ArrayToBase64, base64ToUint8Array } from './crypto';

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks for smooth WebRTC data channel throughput
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024;
const BUFFERED_AMOUNT_RESUME_AT = 1 * 1024 * 1024;

export interface WebRTCEvents {
  onRoomCreated?: (roomId: string, expiresAt: number | null) => void;
  onPeerJoined?: (receiverCount: number) => void;
  onReadyToReceive?: () => void;
  onPeerLeft?: () => void;
  onTransferStart?: (files: FileMetadata[], options: SelfDestructOptions, passwordSalt?: string) => void;
  onTransferProgress?: (stats: TransferStats) => void;
  onFileReceived?: (file: FileMetadata, blob: Blob) => void;
  onFilesReceived?: (files: { meta: FileMetadata; blob: Blob }[]) => void;
  onTransferComplete?: () => void;
  onRoomDestructed?: (reason: string) => void;
  onError?: (err: string) => void;
  onConnectionTypeChange?: (type: 'webrtc_p2p' | 'websocket_relay') => void;
}

export class P2PTransferManager {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private roomId: string = '';
  private isSender: boolean = false;
  private aesKey: CryptoKey | null = null;
  private events: WebRTCEvents = {};
  private connectionType: 'webrtc_p2p' | 'websocket_relay' = 'webrtc_p2p';

  // Receiver state
  private receivedChunks: Map<string, ArrayBuffer[]> = new Map();
  private receivedChunkCounts: Map<string, number> = new Map();
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private fileMetadataList: FileMetadata[] = [];
  private receiverTotalBytes: number = 0;
  private receiverBytesReceived: number = 0;
  private receiverStartTime: number = 0;
  private receiverFilesDelivered: boolean = false;

  // Cancel flag
  private isCancelled: boolean = false;

  constructor(events: WebRTCEvents = {}) {
    this.events = events;
  }

  public setEvents(events: WebRTCEvents) {
    this.events = { ...this.events, ...events };
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[P2PManager] WebSocket connected to signaling server');
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error('[P2PManager] WebSocket error:', err);
        reject(err);
      };

      this.ws.onmessage = (event) => this.handleSignalingMessage(event.data);
    });
  }

  public createRoom(files: FileMetadata[], options: SelfDestructOptions, passwordSalt?: string) {
    this.isSender = true;
    const msg = {
      type: 'CREATE_ROOM',
      payload: { files, options, passwordSalt },
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public joinRoom(roomId: string) {
    this.isSender = false;
    this.roomId = roomId;
    const msg = {
      type: 'JOIN_ROOM',
      roomId,
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public setKey(key: CryptoKey) {
    this.aesKey = key;
  }

  private async setupPeerConnection() {
    if (this.pc) return;

    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'ICE_CANDIDATE',
            roomId: this.roomId,
            payload: event.candidate,
          })
        );
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[P2PManager] ICE connection state:', this.pc?.iceConnectionState);
      if (this.pc?.iceConnectionState === 'failed' || this.pc?.iceConnectionState === 'disconnected') {
        console.warn('[P2PManager] WebRTC ICE connection failed/disconnected. Falling back to WebSocket relay.');
        this.connectionType = 'websocket_relay';
        this.events.onConnectionTypeChange?.('websocket_relay');
      }
    };

    if (this.isSender) {
      this.dataChannel = this.pc.createDataChannel('fileTransfer', {
        ordered: true,
      });
      this.setupDataChannel(this.dataChannel);
    } else {
      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel(this.dataChannel);
      };
    }
  }

  private async drainIceCandidates() {
    if (!this.pc || !this.pc.remoteDescription) return;
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[P2PManager] Failed to add queued ICE candidate:', e);
        }
      }
    }
  }

  private setupDataChannel(dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_RESUME_AT;

    dc.onopen = () => {
      console.log('[P2PManager] WebRTC DataChannel OPEN! Direct Wi-Fi transfer ready.');
      this.connectionType = 'webrtc_p2p';
      this.events.onConnectionTypeChange?.('webrtc_p2p');
    };

    dc.onmessage = (event) => {
      this.handleChunkData(event.data);
    };

    dc.onerror = (err) => {
      console.warn('[P2PManager] WebRTC DataChannel error, falling back to relay:', err);
      this.connectionType = 'websocket_relay';
      this.events.onConnectionTypeChange?.('websocket_relay');
    };
  }

  private async handleSignalingMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      const { type, roomId, payload } = msg;

      switch (type) {
        case 'ROOM_CREATED':
          this.roomId = roomId;
          this.events.onRoomCreated?.(roomId, payload.expiresAt);
          break;

        case 'PEER_JOINED':
          if (this.isSender) {
            this.events.onPeerJoined?.(payload.receiverCount || 1);
            await this.setupPeerConnection();
            if (this.pc) {
              try {
                const offer = await this.pc.createOffer();
                await this.pc.setLocalDescription(offer);
                this.ws?.send(
                  JSON.stringify({
                    type: 'WEBRTC_OFFER',
                    roomId: this.roomId,
                    payload: offer,
                  })
                );
              } catch (offerErr) {
                console.warn('[P2PManager] Failed to create offer on PEER_JOINED:', offerErr);
              }
            }
          } else {
            this.fileMetadataList = payload.files || [];
            this.receiverTotalBytes = this.fileMetadataList.reduce((acc, f) => acc + f.size, 0);
            this.events.onTransferStart?.(payload.files, payload.options, payload.passwordSalt);
          }
          break;

        case 'READY_TO_RECEIVE':
          if (this.isSender) {
            this.events.onReadyToReceive?.();
          }
          break;

        case 'WEBRTC_OFFER':
          if (!this.isSender) {
            await this.setupPeerConnection();
            if (this.pc) {
              try {
                if (this.pc.signalingState !== 'stable') {
                  console.warn(`[P2PManager] Received WEBRTC_OFFER in signalingState '${this.pc.signalingState}'. Attempting rollback.`);
                  try {
                    await this.pc.setLocalDescription({ type: 'rollback' });
                  } catch (rErr) {
                    console.warn('[P2PManager] Rollback not supported or failed:', rErr);
                  }
                }
                await this.pc.setRemoteDescription(new RTCSessionDescription(payload));
                await this.drainIceCandidates();
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                this.ws?.send(
                  JSON.stringify({
                    type: 'WEBRTC_ANSWER',
                    roomId: this.roomId,
                    payload: answer,
                  })
                );
              } catch (offerErr) {
                console.warn('[P2PManager] Skipping duplicate or invalid WEBRTC_OFFER:', offerErr);
              }
            }
          }
          break;

        case 'WEBRTC_ANSWER':
          if (this.isSender && this.pc) {
            try {
              if (this.pc.signalingState === 'have-local-offer') {
                await this.pc.setRemoteDescription(new RTCSessionDescription(payload));
                await this.drainIceCandidates();
              } else {
                console.warn(`[P2PManager] Ignored WEBRTC_ANSWER because signalingState is '${this.pc.signalingState}' (expected 'have-local-offer')`);
              }
            } catch (answerErr) {
              console.warn('[P2PManager] Handled WEBRTC_ANSWER error:', answerErr);
            }
          }
          break;

        case 'ICE_CANDIDATE':
          if (payload) {
            if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
              try {
                await this.pc.addIceCandidate(new RTCIceCandidate(payload));
              } catch (e) {
                console.warn('[P2PManager] ICE candidate addition skipped:', e);
              }
            } else {
              this.pendingIceCandidates.push(payload);
            }
          }
          break;

        case 'RELAY_CHUNK':
          // Convert base64 string chunk back to Uint8Array/ArrayBuffer
          if (!this.isSender && payload && payload.chunkBase64) {
            try {
              const bytes = base64ToUint8Array(payload.chunkBase64);
              const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
              this.handleChunkData(arrayBuffer);
            } catch (relayErr) {
              console.error('[P2PManager] Error decoding RELAY_CHUNK:', relayErr);
            }
          }
          break;

        case 'PEER_LEFT':
          this.events.onPeerLeft?.();
          break;

        case 'TRANSFER_COMPLETE':
          this.events.onTransferComplete?.();
          break;

        case 'ROOM_DESTRUCTED':
          this.events.onRoomDestructed?.(payload?.reason || 'Room self-destructed');
          this.close();
          break;

        case 'ERROR':
          this.events.onError?.(payload.message || 'An error occurred');
          break;

        default:
          break;
      }
    } catch (e) {
      console.error('[P2PManager] Error parsing message:', e);
    }
  }

  // Sender starts streaming files to receiver
  public async sendFiles(files: File[], metadataList: FileMetadata[]): Promise<void> {
    if (!this.aesKey) {
      throw new Error('Encryption key not initialized');
    }

    this.isCancelled = false;
    let totalSentBytes = 0;
    const totalBytesAllFiles = files.reduce((acc, f) => acc + f.size, 0);
    const startTime = Date.now();

    // READY_TO_RECEIVE reaches the sender through WebSocket before the WebRTC
    // channel commonly finishes its ICE handshake. Waiting briefly here keeps
    // LAN transfers on the fast binary P2P channel instead of immediately
    // falling back to base64-encoded WebSocket relay messages.
    await this.waitForDataChannel(3500);

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      if (this.isCancelled) break;

      const file = files[fIdx];
      const meta = metadataList[fIdx];
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        if (this.isCancelled) break;

        const start = chunkIdx * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);
        const arrayBuffer = await chunkBlob.arrayBuffer();

        // Encrypt with AES-256-GCM
        const encryptedBuffer = await encryptChunk(this.aesKey, arrayBuffer);

        // Prepend header: [fileIdx (2 bytes), chunkIdx (4 bytes)]
        const header = new ArrayBuffer(6);
        const view = new DataView(header);
        view.setUint16(0, fIdx, true);
        view.setUint32(2, chunkIdx, true);

        const combined = new Uint8Array(header.byteLength + encryptedBuffer.byteLength);
        combined.set(new Uint8Array(header), 0);
        combined.set(new Uint8Array(encryptedBuffer), 6);

        // Send via WebRTC DataChannel if open, else fallback to WebSocket relay
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          // High speed flow control using onbufferedamountlow
          if (this.dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
            await this.waitForBufferedAmountLow(this.dataChannel);
          }
          if (this.isCancelled) return;
          this.dataChannel.send(combined.buffer);
        } else {
          // Fallback via WebSocket relay (high throughput flow control)
          this.connectionType = 'websocket_relay';
          this.events.onConnectionTypeChange?.('websocket_relay');

          if (this.ws && this.ws.bufferedAmount > 1024 * 1024) {
            while (this.ws.bufferedAmount > 256 * 1024) {
              if (this.isCancelled) return;
              await new Promise((r) => setTimeout(r, 10));
            }
          } else if (chunkIdx % 16 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }

          if (this.isCancelled) return;

          const base64 = uint8ArrayToBase64(combined);

          this.ws?.send(
            JSON.stringify({
              type: 'RELAY_CHUNK',
              roomId: this.roomId,
              payload: {
                fileIdx: fIdx,
                chunkIdx,
                chunkBase64: base64,
              },
            })
          );
        }

        totalSentBytes += end - start;
        const elapsedTime = (Date.now() - startTime) / 1000;
        const speed = elapsedTime > 0 ? totalSentBytes / elapsedTime : 0;
        const remainingBytes = totalBytesAllFiles - totalSentBytes;
        const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;

        this.events.onTransferProgress?.({
          bytesTransferred: totalSentBytes,
          totalBytes: totalBytesAllFiles,
          chunksTransferred: chunkIdx + 1,
          totalChunks,
          speedBytesPerSec: speed,
          etaSeconds: eta,
          currentFileName: meta.name,
          currentFileIndex: fIdx,
          totalFiles: files.length,
        });
      }
    }

    // The sender has only queued the chunks at this point. Do not mark the
    // transfer complete (or burn the room) until the receiver has decrypted
    // and assembled every chunk and sends its acknowledgement.
    if (!this.isCancelled) {
      console.log('[P2PManager] All chunks sent; waiting for receiver acknowledgement.');
    }
  }

  public requestStartDownload() {
    this.receiverBytesReceived = 0;
    this.receiverStartTime = Date.now();
    this.receiverFilesDelivered = false;
    this.emitReceivedFilesIfComplete();
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.roomId) {
      this.ws.send(
        JSON.stringify({
          type: 'READY_TO_RECEIVE',
          roomId: this.roomId,
        })
      );
    }
  }

  private async waitForDataChannel(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.dataChannel?.readyState === 'open') return true;
      if (this.isCancelled) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.dataChannel?.readyState === 'open';
  }

  private async waitForBufferedAmountLow(channel: RTCDataChannel): Promise<void> {
    while (channel.readyState === 'open' && channel.bufferedAmount > BUFFERED_AMOUNT_RESUME_AT) {
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }

  public notifyDownloadComplete() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.roomId) {
      this.ws.send(
        JSON.stringify({
          type: 'TRANSFER_COMPLETE',
          roomId: this.roomId,
        })
      );
    }
  }

  private async handleChunkData(packedBuffer: ArrayBuffer) {
    if (!this.aesKey) {
      console.error('[P2PManager] No decryption key available');
      return;
    }

    try {
      const dataView = new DataView(packedBuffer);
      const fileIdx = dataView.getUint16(0, true);
      const chunkIdx = dataView.getUint32(2, true);
      const encryptedPayload = packedBuffer.slice(6);

      // Decrypt with AES-256-GCM
      const decryptedBuffer = await decryptChunk(this.aesKey, encryptedPayload);

      const fileKey = `file_${fileIdx}`;
      if (!this.receivedChunks.has(fileKey)) {
        this.receivedChunks.set(fileKey, []);
        this.receivedChunkCounts.set(fileKey, 0);
      }

      const chunks = this.receivedChunks.get(fileKey)!;
      let currentCount = this.receivedChunkCounts.get(fileKey) || 0;

      // Only count unique, non-duplicate chunk arrivals
      if (!chunks[chunkIdx]) {
        chunks[chunkIdx] = decryptedBuffer;
        currentCount += 1;
        this.receivedChunkCounts.set(fileKey, currentCount);
        this.receiverBytesReceived += decryptedBuffer.byteLength;
      }

      // Receiver live progress calculation
      if (this.receiverStartTime === 0) {
        this.receiverStartTime = Date.now();
      }

      const elapsedTime = (Date.now() - this.receiverStartTime) / 1000;
      const speed = elapsedTime > 0 ? this.receiverBytesReceived / elapsedTime : 0;
      const remainingBytes = Math.max(0, this.receiverTotalBytes - this.receiverBytesReceived);
      const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;

      const currentMeta = this.fileMetadataList[fileIdx] || { name: 'Payload', totalChunks: 1 };

      this.events.onTransferProgress?.({
        bytesTransferred: this.receiverBytesReceived,
        totalBytes: this.receiverTotalBytes || this.receiverBytesReceived,
        chunksTransferred: currentCount,
        totalChunks: currentMeta.totalChunks || 1,
        speedBytesPerSec: speed,
        etaSeconds: eta,
        currentFileName: currentMeta.name || 'File',
        currentFileIndex: fileIdx,
        totalFiles: this.fileMetadataList.length || 1,
      });

      // Complete on the exact chunk that makes every file reconstructable.
      // This is more reliable than a UI polling timer, especially on slower
      // mobile devices where decryption finishes after the sender reaches 100%.
      this.emitReceivedFilesIfComplete();
    } catch (err) {
      console.error('[P2PManager] Chunk decryption failed:', err);
    }
  }

  private emitReceivedFilesIfComplete() {
    if (this.receiverFilesDelivered || this.fileMetadataList.length === 0) return;

    const files: { meta: FileMetadata; blob: Blob }[] = [];
    for (let index = 0; index < this.fileMetadataList.length; index++) {
      const meta = this.fileMetadataList[index];
      const blob = this.assembleFile(meta, index);
      if (!blob || blob.size !== meta.size) return;
      files.push({ meta, blob });
    }

    this.receiverFilesDelivered = true;
    this.events.onFilesReceived?.(files);
  }

  public assembleFile(fileMeta: FileMetadata, fileIdx: number): Blob | null {
    if (fileMeta.size === 0) {
      return new Blob([], { type: fileMeta.type || 'application/octet-stream' });
    }
    const fileKey = `file_${fileIdx}`;
    const chunks = this.receivedChunks.get(fileKey);
    if (!chunks) return null;

    const count = this.receivedChunkCounts.get(fileKey) || 0;
    if (count < fileMeta.totalChunks) return null;

    // Verify all chunks from 0 to totalChunks - 1 exist and are defined
    if (chunks.length < fileMeta.totalChunks) return null;
    for (let i = 0; i < fileMeta.totalChunks; i++) {
      if (!chunks[i]) return null;
    }

    return new Blob(chunks, { type: fileMeta.type || 'application/octet-stream' });
  }

  public cancelTransfer() {
    this.isCancelled = true;
  }

  public destructRoom() {
    if (this.ws && this.roomId) {
      this.ws.send(
        JSON.stringify({
          type: 'DESTRUCT_ROOM',
          roomId: this.roomId,
        })
      );
    }
  }

  public close() {
    this.pendingIceCandidates = [];
    this.fileMetadataList = [];
    this.receiverFilesDelivered = false;
    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onmessage = null;
      this.dataChannel.onerror = null;
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ondatachannel = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    // Wipe chunks from RAM for zero-trace security
    this.receivedChunks.clear();
    this.receivedChunkCounts.clear();
  }
}
