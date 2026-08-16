import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if ((net.family === 'IPv4' || (net.family as any) === 4) && !net.internal) {
        addresses.push(net.address.trim());
      }
    }
  }
  const wifiIps = addresses.filter(
    (ip) => !ip.startsWith('192.168.56.') && !ip.startsWith('192.168.99.') && !ip.startsWith('169.254.')
  );
  const vboxIps = addresses.filter((ip) => ip.startsWith('192.168.56.') || ip.startsWith('192.168.99.'));
  return [...wifiIps, ...vboxIps];
}

interface RoomState {
  roomId: string;
  senderSocket: WebSocket | null;
  receiverSockets: Set<WebSocket>;
  files: any[];
  options: {
    expireAfterSeconds: number;
    downloadLimit: number;
    burnAfterRead: boolean;
    passwordRequired: boolean;
  };
  createdAt: number;
  expiresAt: number | null;
  downloadsCount: number;
  timerHandle: NodeJS.Timeout | null;
  passwordSalt?: string;
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer(app);

// In-memory zero-cloud room manager
const rooms = new Map<string, RoomState>();

// Create WebSocket server on top of HTTP server
const wss = new WebSocketServer({ server });

function destroyRoom(roomId: string, reason: string = 'Self-destructed') {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.timerHandle) {
    clearTimeout(room.timerHandle);
  }

  const destructMsg = JSON.stringify({
    type: 'ROOM_DESTRUCTED',
    roomId,
    reason,
  });

  if (room.senderSocket && room.senderSocket.readyState === WebSocket.OPEN) {
    room.senderSocket.send(destructMsg);
  }

  for (const client of room.receiverSockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(destructMsg);
    }
  }

  rooms.delete(roomId);
  console.log(`[Server] Room ${roomId} destructed. Total active rooms: ${rooms.size}`);
}

wss.on('connection', (ws: WebSocket) => {
  let currentRoomId: string | null = null;
  let isSender = false;

  ws.on('message', (data: Buffer | string) => {
    try {
      const msg = JSON.parse(data.toString());
      const { type, roomId, payload } = msg;

      switch (type) {
        case 'CREATE_ROOM': {
          const newRoomId = roomId || Math.random().toString(36).substring(2, 10);
          const { files, options, passwordSalt } = payload;

          let expiresAt: number | null = null;
          let timerHandle: NodeJS.Timeout | null = null;

          if (options.expireAfterSeconds && options.expireAfterSeconds > 0) {
            expiresAt = Date.now() + options.expireAfterSeconds * 1000;
            timerHandle = setTimeout(() => {
              destroyRoom(newRoomId, 'Link expiration timer reached');
            }, options.expireAfterSeconds * 1000);
          }

          const room: RoomState = {
            roomId: newRoomId,
            senderSocket: ws,
            receiverSockets: new Set(),
            files: files || [],
            options: options || {
              expireAfterSeconds: 0,
              downloadLimit: 1,
              burnAfterRead: false,
              passwordRequired: false,
            },
            createdAt: Date.now(),
            expiresAt,
            downloadsCount: 0,
            timerHandle,
            passwordSalt,
          };

          rooms.set(newRoomId, room);
          currentRoomId = newRoomId;
          isSender = true;

          ws.send(
            JSON.stringify({
              type: 'ROOM_CREATED',
              roomId: newRoomId,
              payload: {
                files: room.files,
                options: room.options,
                expiresAt: room.expiresAt,
                passwordSalt: room.passwordSalt,
              },
            })
          );
          console.log(`[Server] Room created: ${newRoomId}`);
          break;
        }

        case 'JOIN_ROOM': {
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                roomId,
                payload: { message: 'This transfer link is no longer active. The sender may have closed their tab or generated a new link.' },
              })
            );
            return;
          }

          if (!room.senderSocket || room.senderSocket.readyState !== WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                roomId,
                payload: { message: 'The sender is currently disconnected. Please ensure the sender keeps their browser tab open.' },
              })
            );
            return;
          }

          if (room.expiresAt && Date.now() > room.expiresAt) {
            destroyRoom(roomId, 'Link expired');
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                roomId,
                payload: { message: 'This transfer link has expired.' },
              })
            );
            return;
          }

          room.receiverSockets.add(ws);
          currentRoomId = roomId;
          isSender = false;

          // Notify receiver with room metadata
          ws.send(
            JSON.stringify({
              type: 'PEER_JOINED',
              roomId,
              payload: {
                files: room.files,
                options: room.options,
                expiresAt: room.expiresAt,
                passwordSalt: room.passwordSalt,
              },
            })
          );

          // Notify sender that a receiver joined
          if (room.senderSocket && room.senderSocket.readyState === WebSocket.OPEN) {
            room.senderSocket.send(
              JSON.stringify({
                type: 'PEER_JOINED',
                roomId,
                payload: { receiverCount: room.receiverSockets.size },
              })
            );
          }
          break;
        }

        case 'WEBRTC_OFFER':
        case 'WEBRTC_ANSWER':
        case 'ICE_CANDIDATE':
        case 'TRANSFER_START':
        case 'TRANSFER_PROGRESS':
        case 'READY_TO_RECEIVE': {
          const room = rooms.get(roomId);
          if (!room) return;

          if (isSender) {
            // Forward sender messages to all receivers
            for (const receiver of room.receiverSockets) {
              if (receiver.readyState === WebSocket.OPEN) {
                receiver.send(data.toString());
              }
            }
          } else {
            // Forward receiver messages to sender
            if (room.senderSocket && room.senderSocket.readyState === WebSocket.OPEN) {
              room.senderSocket.send(data.toString());
            }
          }
          break;
        }

        case 'RELAY_CHUNK': {
          // In-memory fallback relay if WebRTC is blocked on local network
          const room = rooms.get(roomId);
          if (!room) return;

          if (isSender) {
            for (const receiver of room.receiverSockets) {
              if (receiver.readyState === WebSocket.OPEN) {
                receiver.send(data.toString());
              }
            }
          } else {
            if (room.senderSocket && room.senderSocket.readyState === WebSocket.OPEN) {
              room.senderSocket.send(data.toString());
            }
          }
          break;
        }

        case 'TRANSFER_COMPLETE': {
          const room = rooms.get(roomId);
          if (!room) return;

          // A sender finishing its local upload only means that the final
          // chunk was queued. Count completion only after a receiver confirms
          // it has decrypted and assembled the complete file(s).
          if (isSender) {
            console.warn(`[Server] Ignored premature sender completion for room ${roomId}`);
            return;
          }

          room.downloadsCount += 1;
          console.log(`[Server] Room ${roomId} download completed. Total downloads: ${room.downloadsCount}`);

          // Broadcast progress/complete
          if (room.senderSocket && room.senderSocket.readyState === WebSocket.OPEN) {
            room.senderSocket.send(
              JSON.stringify({
                type: 'TRANSFER_COMPLETE',
                roomId,
                payload: { downloadsCount: room.downloadsCount },
              })
            );
          }

          // Check self-destruct triggers
          if (room.options.burnAfterRead || (room.options.downloadLimit > 0 && room.downloadsCount >= room.options.downloadLimit)) {
            setTimeout(() => {
              destroyRoom(roomId, 'Download limit reached. Self-destruct initiated.');
            }, 1000);
          }
          break;
        }

        case 'DESTRUCT_ROOM': {
          destroyRoom(roomId, 'Self-destructed by sender');
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[Server] Failed to handle message:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        if (isSender) {
          // If sender disconnects, notify receivers
          for (const rx of room.receiverSockets) {
            if (rx.readyState === WebSocket.OPEN) {
              rx.send(JSON.stringify({ type: 'PEER_LEFT', roomId: currentRoomId, payload: { peer: 'sender' } }));
            }
          }
        } else {
          room.receiverSockets.delete(ws);
          if (room.senderSocket && room.senderSocket.readyState === WebSocket.OPEN) {
            room.senderSocket.send(JSON.stringify({ type: 'PEER_LEFT', roomId: currentRoomId, payload: { peer: 'receiver' } }));
          }
        }
      }
    }
  });
});

// Express API status route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    activeRooms: rooms.size,
    timestamp: new Date().toISOString(),
    zeroCloudStorage: true,
  });
});

app.get('/api/network-info', (req, res) => {
  const localIps = getLocalIpAddresses();
  res.json({
    localIps,
    port: PORT,
    primaryIp: localIps[0] || 'localhost',
  });
});

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'favicon.svg'));
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if ((globalThis as any).__serverInstance) {
    try {
      (globalThis as any).__serverInstance.close();
      console.log('[SowaLink] Closed previous server instance for hot reload');
    } catch (e) {}
  }
  (globalThis as any).__serverInstance = server;

  server.listen(PORT, '0.0.0.0', () => {
    const localIps = getLocalIpAddresses();
    const primaryIp = localIps[0] || 'localhost';
    console.log(`\n  ⚡ [SowaLink] Server is running & ready!`);
    console.log(`  ➜ Local:   http://localhost:${PORT}`);
    console.log(`  ➜ Network: http://${primaryIp}:${PORT}\n`);
  });
}

startServer();
