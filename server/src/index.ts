import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { registerHandlers, channelFor } from './net/handlers';
import { RoomManager } from './rooms/RoomManager';
import type { RoomEmitter } from './rooms/Room';
import {
  GAME_CATALOG,
  MAX_PLAYERS,
  SOCKET_PATH,
  TICK_RATE,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from './shared';
import { log } from './util/log';

const PORT = Number(process.env.PORT ?? 8787);
const here = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_DIST = path.resolve(here, '../../client/dist');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '16kb' }));

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  path: SOCKET_PATH,
  cors: { origin: true },
  pingInterval: 12_000,
  pingTimeout: 9_000,
  maxHttpBufferSize: 1e5,
});

const emitter: RoomEmitter = {
  snapshot(code, snapshot) {
    // volatile: se o cliente está engasgado é melhor perder um frame do que
    // acumular fila e jogar com atraso.
    io.to(channelFor(code)).volatile.emit('match:snapshot', snapshot);
  },
  state(code, room) {
    io.to(channelFor(code)).emit('room:state', room);
  },
  matchStart(code, payload) {
    io.to(channelFor(code)).emit('match:start', payload);
  },
  matchEnd(code, results) {
    io.to(channelFor(code)).emit('match:end', results);
  },
  toast(code, kind, message) {
    io.to(channelFor(code)).emit('toast', { kind, message });
  },
};

const manager = new RoomManager(emitter);
registerHandlers(io, manager);
manager.start();

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'orelha-games',
    tickRate: TICK_RATE,
    uptime: Math.round(process.uptime()),
    ...manager.stats(),
  });
});

app.get('/api/games', (_req, res) => {
  res.json(
    GAME_CATALOG.map((game) => ({
      id: game.id,
      name: game.name,
      tagline: game.tagline,
      players: `${game.minPlayers}-${game.maxPlayers}`,
      duration: game.durationLabel,
    })),
  );
});

/** Prévia pública da sala: deixa a tela de "entrar por código" validar antes de conectar. */
app.get('/api/rooms/:code', (req, res) => {
  const room = manager.get(String(req.params.code ?? '').toUpperCase());
  if (!room) {
    res.status(404).json({ ok: false, error: 'Sala não encontrada' });
    return;
  }
  res.json({
    ok: true,
    code: room.code,
    name: room.name,
    gameId: room.gameId,
    status: room.status,
    players: room.players.length,
    maxPlayers: MAX_PLAYERS,
    full: room.isFull,
    roster: room.players.map((p) => ({ name: p.name, avatar: p.avatar, slot: p.slot, bot: p.bot })),
  });
});

// ---------------------------------------------------------------------------
// Cliente buildado (deploy em porta única)
// ---------------------------------------------------------------------------

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith(SOCKET_PATH)) {
      next();
      return;
    }
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
  log.info('servindo o cliente buildado de client/dist');
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function localAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, () => {
  log.info(`Orelha Games no ar em http://localhost:${PORT}`);
  for (const address of localAddresses()) {
    log.info(`na rede local: http://${address}:${PORT}`);
  }
});

function shutdown(signal: string): void {
  log.info(`recebido ${signal}, encerrando...`);
  manager.stop();
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => log.error('exceção não tratada', error));
process.on('unhandledRejection', (error) => log.error('promise rejeitada', error));
