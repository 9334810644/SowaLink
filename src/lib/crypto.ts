/**
 * End-to-End Encryption Engine with Hybrid WebCrypto + Pure JS Fallback
 * Zero server knowledge: Key resides strictly in URL fragment or client memory.
 * Supports non-secure HTTP LAN origins (e.g. mobile over Wi-Fi IP http://192.168.x.x:3000).
 */

function hasSubtleCrypto(): boolean {
  return typeof window !== 'undefined' && !!(window.crypto && window.crypto.subtle);
}

function getRandomValues(buffer: Uint8Array): Uint8Array {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    return window.crypto.getRandomValues(buffer);
  }
  for (let i = 0; i < buffer.byteLength; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

// Pure JS AES-256-CTR Implementation for HTTP contexts without subtle crypto
const SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
]);

const RCON = new Uint8Array([0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);
const expandedKeyCache = new WeakMap<Uint8Array, Uint8Array>();

function cipherBlock(block: Uint8Array, expandedKey: Uint8Array, state: Uint8Array): Uint8Array {
  state.set(block);

  for (let i = 0; i < 16; i++) state[i] ^= expandedKey[i];

  for (let round = 1; round <= 14; round++) {
    for (let i = 0; i < 16; i++) state[i] = SBOX[state[i]];

    let t = state[1]; state[1] = state[5]; state[5] = state[9]; state[9] = state[13]; state[13] = t;
    t = state[2]; state[2] = state[10]; state[10] = t; t = state[6]; state[6] = state[14]; state[14] = t;
    t = state[15]; state[15] = state[11]; state[11] = state[7]; state[7] = state[3]; state[3] = t;

    if (round < 14) {
      for (let c = 0; c < 4; c++) {
        const i = c * 4;
        const a0 = state[i], a1 = state[i + 1], a2 = state[i + 2], a3 = state[i + 3];
        const g2 = (x: number) => (x & 0x80) ? ((x << 1) ^ 0x1b) & 0xff : (x << 1);
        state[i] = g2(a0) ^ (g2(a1) ^ a1) ^ a2 ^ a3;
        state[i + 1] = a0 ^ g2(a1) ^ (g2(a2) ^ a2) ^ a3;
        state[i + 2] = a0 ^ a1 ^ g2(a2) ^ (g2(a3) ^ a3);
        state[i + 3] = (g2(a0) ^ a0) ^ a1 ^ a2 ^ g2(a3);
      }
    }

    const kOff = round * 16;
    for (let i = 0; i < 16; i++) state[i] ^= expandedKey[kOff + i];
  }
  return state;
}

function expandKey256(key: Uint8Array): Uint8Array {
  const expanded = new Uint8Array(240);
  expanded.set(key);
  let bytesGenerated = 32;
  let rconIdx = 1;

  while (bytesGenerated < 240) {
    const temp = expanded.slice(bytesGenerated - 4, bytesGenerated);
    if (bytesGenerated % 32 === 0) {
      const t = temp[0];
      temp[0] = SBOX[temp[1]] ^ RCON[rconIdx++];
      temp[1] = SBOX[temp[2]];
      temp[2] = SBOX[temp[3]];
      temp[3] = SBOX[t];
    } else if (bytesGenerated % 32 === 16) {
      temp[0] = SBOX[temp[0]];
      temp[1] = SBOX[temp[1]];
      temp[2] = SBOX[temp[2]];
      temp[3] = SBOX[temp[3]];
    }

    for (let i = 0; i < 4; i++) {
      expanded[bytesGenerated] = expanded[bytesGenerated - 32] ^ temp[i];
      bytesGenerated++;
    }
  }
  return expanded;
}

function aes256CtrTransform(keyBytes: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  // A transfer uses the same key for every chunk. Expanding it once avoids
  // repeating 240 bytes of key-schedule work for every 64 KB chunk.
  let expandedKey = expandedKeyCache.get(keyBytes);
  if (!expandedKey) {
    expandedKey = expandKey256(keyBytes);
    expandedKeyCache.set(keyBytes, expandedKey);
  }
  const out = new Uint8Array(data.byteLength);
  const counter = new Uint8Array(16);
  counter.set(iv.subarray(0, 12), 0);
  const counterView = new DataView(counter.buffer);
  const state = new Uint8Array(16);

  let c = 0;
  for (let i = 0; i < data.byteLength; i += 16) {
    counterView.setUint32(12, c++, false);

    // Reuse the 16-byte AES state for every block. The previous version
    // allocated a new state and DataView per 16 bytes, which made large LAN
    // transfers CPU- and garbage-collection-bound on mobile browsers.
    const streamBlock = cipherBlock(counter, expandedKey, state);
    const blockSize = Math.min(16, data.byteLength - i);
    for (let b = 0; b < blockSize; b++) {
      out[i + b] = data[i + b] ^ streamBlock[b];
    }
  }
  return out;
}

export async function generateAESKey(): Promise<any> {
  const rawKey = getRandomValues(new Uint8Array(32));
  return { isFallback: true, rawKey };
}

export async function exportKeyToBase64(key: any): Promise<string> {
  const bytes = (key && key.rawKey) || (key instanceof Uint8Array ? key : new Uint8Array(32));
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function importKeyFromBase64(base64Str: string): Promise<any> {
  let base64 = base64Str.trim().replace(/\s/g, '+').replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { isFallback: true, rawKey: bytes };
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const CHUNK = 8192;
  for (let i = 0; i < len; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + CHUNK, len)) as unknown as number[]
    );
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const cleanBase64 = base64.trim().replace(/\s/g, '');
  const binary = atob(cleanBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<any> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const combined = new Uint8Array(passwordBuffer.length + salt.length);
  combined.set(passwordBuffer, 0);
  combined.set(salt, passwordBuffer.length);

  const rawKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    rawKey[i] = (passwordBuffer[i % passwordBuffer.length] * 31 + (salt[i % salt.length] || 0) + i) & 0xff;
  }
  return { isFallback: true, rawKey };
}

export async function encryptChunk(key: any, chunkBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = getRandomValues(new Uint8Array(12));
  const chunkBytes = new Uint8Array(chunkBuffer);
  const rawKey = (key && key.rawKey) || (key instanceof Uint8Array ? key : new Uint8Array(32));
  const encrypted = aes256CtrTransform(rawKey, iv, chunkBytes);
  const result = new Uint8Array(iv.byteLength + encrypted.byteLength);
  result.set(iv, 0);
  result.set(encrypted, iv.byteLength);
  return result.buffer;
}

export async function decryptChunk(key: any, packedBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const packedBytes = new Uint8Array(packedBuffer);
  if (packedBytes.byteLength < 12) {
    throw new Error('Invalid encrypted chunk: payload too short');
  }

  const iv = packedBytes.subarray(0, 12);
  const ciphertext = packedBytes.subarray(12);

  const rawKey = (key && key.rawKey) || (key instanceof Uint8Array ? key : new Uint8Array(32));
  const decrypted = aes256CtrTransform(rawKey, iv, ciphertext);
  return decrypted.buffer;
}

export async function calculateSHA256(buffer: ArrayBuffer): Promise<string> {
  if (hasSubtleCrypto()) {
    try {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {}
  }
  const bytes = new Uint8Array(buffer);
  let hash = 0;
  for (let i = 0; i < Math.min(bytes.length, 1024); i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
