import type { Server, Socket } from 'socket.io';
import {
  AVATAR_IDS,
  EMOTES,
  clamp,
  isGameId,
  randomPlayerName,
  sanitizeName,
  type Ack,
  type AvatarId,
  type ClientToServerEvents,
  type Emote,
  type Fail,
  type GameId,
  type ServerToClientEvents,
  type SessionData,
} from '../shared';
import type { RoomManager } from '../rooms/RoomManager';
import type { Room } from '../rooms/Room';
import { normalizeCode } from '../util/ids';
import { log } from '../util/log';

interface SocketData {
  roomCode?: string;
  playerId?: string;
  lastEmote: number;
  createdRooms: number[];
  inputBudget: number;
  inputWindow: number;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function channelFor(code: string): string {
  return `room:${code}`;
}

function fail(error: string, code?: Fail['code']): Fail {
  return { ok: false, error, code };
}

function ok<T>(data: T): Ack<T> {
  return { ok: true, data };
}

function safeAck<T>(ack: unknown, payload: Ack<T>): void {
  if (typeof ack === 'function') (ack as (res: Ack<T>) => void)(payload);
}

function pickAvatar(value: unknown): AvatarId {
  return AVATAR_IDS.includes(value as AvatarId) ? (value as AvatarId) : 'blob';
}

function roomNameFrom(playerName: string, raw: unknown): string {
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 24);
    if (cleaned.length >= 3) return cleaned;
  }
  const first = playerName.split(' ')[0];
  return `Sala do ${first}`;
}

export function registerHandlers(io: GameServer, manager: RoomManager): void {
  io.on('connection', (socket: GameSocket) => {
    socket.data.lastEmote = 0;
    socket.data.createdRooms = [];
    socket.data.inputBudget = 0;
    socket.data.inputWindow = Date.now();

    const currentRoom = (): Room | undefined =>
      socket.data.roomCode ? manager.get(socket.data.roomCode) : undefined;

    const requireHost = (): Room | null => {
      const room = currentRoom();
      if (!room) return null;
      if (room.hostId !== socket.data.playerId) return null;
      return room;
    };

    const leaveCurrentRoom = (announce: boolean): void => {
      const room = currentRoom();
      const playerId = socket.data.playerId;
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      if (!room || !playerId) return;
      const removed = room.removePlayer(playerId);
      socket.leave(channelFor(room.code));
      if (removed && announce) {
        io.to(channelFor(room.code)).emit('toast', {
          kind: 'info',
          message: `${removed.name} saiu da sala.`,
        });
      }
      if (room.inMatch && !room.hasEnoughForMatch()) {
        room.abortMatch('Jogadores insuficientes. Voltamos para a sala.');
      }
      if (room.players.length === 0) {
        manager.destroy(room.code, 'último jogador saiu');
      } else {
        room.broadcastState();
      }
    };

    // -----------------------------------------------------------------------
    // Criar / entrar / reconectar
    // -----------------------------------------------------------------------

    socket.on('room:create', (payload, ack) => {
      const now = Date.now();
      socket.data.createdRooms = socket.data.createdRooms.filter((t) => now - t < 60_000);
      if (socket.data.createdRooms.length >= 6) {
        safeAck(ack, fail('Muitas salas criadas. Respire e tente de novo.', 'RATE_LIMIT'));
        return;
      }
      socket.data.createdRooms.push(now);

      leaveCurrentRoom(true);

      const name = sanitizeName(typeof payload?.name === 'string' ? payload.name : randomPlayerName());
      const avatar = pickAvatar(payload?.avatar);
      const room = manager.create(roomNameFrom(name, payload?.roomName));
      if (Number.isFinite(Number(payload?.rounds))) room.setRounds(Number(payload?.rounds));

      const player = room.addPlayer({ name, avatar, socketId: socket.id });
      if (!player) {
        safeAck(ack, fail('Não foi possível criar a sala agora.', 'INVALID'));
        return;
      }
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      socket.join(channelFor(room.code));

      const session: SessionData = {
        room: room.publicState(),
        playerId: player.id,
        token: player.token,
      };
      safeAck(ack, ok(session));
      room.broadcastState();
    });

    socket.on('room:join', (payload, ack) => {
      const code = normalizeCode(payload?.code);
      if (!code) {
        safeAck(ack, fail('Código inválido.', 'INVALID'));
        return;
      }
      const room = manager.get(code);
      if (!room) {
        safeAck(ack, fail('Sala não encontrada. Confere o código?', 'ROOM_NOT_FOUND'));
        return;
      }
      if (room.isFull) {
        safeAck(ack, fail('Essa sala já está cheia (5 jogadores).', 'ROOM_FULL'));
        return;
      }

      leaveCurrentRoom(true);

      const name = sanitizeName(typeof payload?.name === 'string' ? payload.name : randomPlayerName());
      const avatar = pickAvatar(payload?.avatar);
      const player = room.addPlayer({ name, avatar, socketId: socket.id });
      if (!player) {
        safeAck(ack, fail('Essa sala já está cheia (5 jogadores).', 'ROOM_FULL'));
        return;
      }

      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      socket.join(channelFor(room.code));

      safeAck(
        ack,
        ok<SessionData>({
          room: room.publicState(),
          playerId: player.id,
          token: player.token,
        }),
      );
      io.to(channelFor(room.code)).emit('toast', {
        kind: 'success',
        message: `${player.name} entrou na sala.`,
      });
      room.broadcastState();
    });

    socket.on('room:rejoin', (payload, ack) => {
      const code = normalizeCode(payload?.code);
      if (!code || typeof payload?.playerId !== 'string' || typeof payload?.token !== 'string') {
        safeAck(ack, fail('Sessão inválida.', 'INVALID'));
        return;
      }
      const room = manager.get(code);
      if (!room) {
        safeAck(ack, fail('Sala não encontrada.', 'ROOM_NOT_FOUND'));
        return;
      }
      const player = room.find(payload.playerId);
      if (!player || player.token !== payload.token) {
        safeAck(ack, fail('Sua vaga expirou. Entre pelo código.', 'INVALID'));
        return;
      }

      room.attachSocket(player.id, socket.id);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      socket.join(channelFor(room.code));

      safeAck(
        ack,
        ok<SessionData>({
          room: room.publicState(),
          playerId: player.id,
          token: player.token,
        }),
      );
      io.to(channelFor(room.code)).emit('toast', {
        kind: 'info',
        message: `${player.name} voltou.`,
      });
      room.broadcastState();
    });

    socket.on('room:leave', () => {
      leaveCurrentRoom(true);
    });

    // -----------------------------------------------------------------------
    // Sala
    // -----------------------------------------------------------------------

    socket.on('room:ready', (ready) => {
      const room = currentRoom();
      if (!room || !socket.data.playerId) return;
      room.setReady(socket.data.playerId, Boolean(ready));
      room.broadcastState();
    });

    socket.on('room:profile', (payload) => {
      const room = currentRoom();
      if (!room || !socket.data.playerId) return;
      room.setProfile(socket.data.playerId, {
        name: typeof payload?.name === 'string' ? payload.name : undefined,
        avatar: payload?.avatar && AVATAR_IDS.includes(payload.avatar) ? payload.avatar : undefined,
      });
      room.broadcastState();
    });

    socket.on('room:setRounds', (rounds) => {
      const room = requireHost();
      if (!room) return;
      const value = Number(rounds);
      if (!Number.isFinite(value)) return;
      room.setRounds(value);
      room.broadcastState();
    });

    socket.on('room:addBot', () => {
      const room = requireHost();
      if (!room) return;
      if (room.isFull) {
        socket.emit('toast', { kind: 'warn', message: 'A sala já está cheia.' });
        return;
      }
      const bot = room.addBot();
      if (bot) {
        io.to(channelFor(room.code)).emit('toast', {
          kind: 'info',
          message: `${bot.name} entrou para completar o time.`,
        });
        room.broadcastState();
      }
    });

    socket.on('room:removePlayer', (playerId) => {
      const room = requireHost();
      if (!room || typeof playerId !== 'string') return;
      if (playerId === room.hostId) return;
      const target = room.find(playerId);
      if (!target) return;
      const removed = room.removePlayer(playerId);
      if (!removed) return;
      if (target.socketId) {
        const targetSocket = io.sockets.sockets.get(target.socketId) as GameSocket | undefined;
        if (targetSocket) {
          targetSocket.leave(channelFor(room.code));
          targetSocket.data.roomCode = undefined;
          targetSocket.data.playerId = undefined;
          targetSocket.emit('room:closed', { reason: 'O host removeu você da sala.' });
        }
      }
      io.to(channelFor(room.code)).emit('toast', {
        kind: 'info',
        message: `${removed.name} saiu da sala.`,
      });
      if (room.inMatch && !room.hasEnoughForMatch()) {
        room.abortMatch('Jogadores insuficientes. Voltamos para a sala.');
      }
      room.broadcastState();
    });

    socket.on('room:emote', (emote) => {
      const room = currentRoom();
      if (!room || !socket.data.playerId) return;
      if (!EMOTES.includes(emote as Emote)) return;
      const now = Date.now();
      if (now - socket.data.lastEmote < 900) return;
      socket.data.lastEmote = now;
      io.to(channelFor(room.code)).emit('room:emote', {
        playerId: socket.data.playerId,
        emote: emote as Emote,
      });
    });

    // -----------------------------------------------------------------------
    // Partida
    // -----------------------------------------------------------------------

    socket.on('match:start', () => {
      const room = requireHost();
      if (!room) return;
      const result = room.startMatch();
      if (!result.ok) {
        socket.emit('toast', { kind: 'warn', message: result.error });
      }
    });

    socket.on('match:rematch', () => {
      const room = requireHost();
      if (!room) return;
      const result = room.startMatch();
      if (!result.ok) {
        socket.emit('toast', { kind: 'warn', message: result.error });
      }
    });

    socket.on('match:lobby', () => {
      const room = requireHost();
      if (!room) return;
      room.backToLobby();
      room.broadcastState();
    });

    socket.on('match:input', (payload) => {
      const room = currentRoom();
      if (!room || !socket.data.playerId || !room.inMatch) return;

      // orçamento simples de mensagens (protege contra flood)
      const now = Date.now();
      if (now - socket.data.inputWindow > 1000) {
        socket.data.inputWindow = now;
        socket.data.inputBudget = 0;
      }
      socket.data.inputBudget += 1;
      if (socket.data.inputBudget > 90) return;

      const mx = Number(payload?.mx);
      const my = Number(payload?.my);
      const dash = Number(payload?.dash);
      if (!Number.isFinite(mx) || !Number.isFinite(my) || !Number.isFinite(dash)) return;

      room.setInput(socket.data.playerId, {
        mx: clamp(mx, -1, 1),
        my: clamp(my, -1, 1),
        dash: clamp(Math.floor(dash), 0, 1_000_000),
      });
    });

    socket.on('net:ping', (sentAt, ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    // -----------------------------------------------------------------------
    // Desconexão
    // -----------------------------------------------------------------------

    socket.on('disconnect', (reason) => {
      const room = currentRoom();
      if (!room) return;
      const player = room.detachSocket(socket.id);
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      if (!player) return;

      log.info(`saiu ${room.code}/${player.name} (${reason})`);

      if (room.inMatch) {
        io.to(channelFor(room.code)).emit('toast', {
          kind: 'warn',
          message: `${player.name} caiu — piloto automático assumiu.`,
        });
      } else {
        io.to(channelFor(room.code)).emit('toast', {
          kind: 'warn',
          message: `${player.name} perdeu a conexão.`,
        });
      }

      const anyoneConnected = room.players.some((p) => !p.bot && p.connected);
      if (!anyoneConnected && room.inMatch) {
        room.abortMatch('Todos saíram da partida.');
      }
      room.broadcastState();
    });
  });
}
