import type { AvatarId, GameId, MatchResults, RoomPublic, Snapshot } from './types';

/**
 * Protocolo de rede (Socket.IO). Tipar os dois lados no mesmo arquivo evita
 * divergência silenciosa entre cliente e servidor.
 */

export const SOCKET_PATH = '/socket.io';

export interface Ok<T> {
  ok: true;
  data: T;
}
export interface Fail {
  ok: false;
  error: string;
  code?: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'IN_MATCH' | 'INVALID' | 'RATE_LIMIT';
}
export type Ack<T> = Ok<T> | Fail;

export interface JoinPayload {
  code: string;
  name: string;
  avatar: AvatarId;
}

export interface CreatePayload {
  name: string;
  avatar: AvatarId;
  roomName?: string;
  /** tamanho do campeonato; o jogo de cada rodada e sorteado */
  rounds?: number;
}

export interface RejoinPayload {
  code: string;
  playerId: string;
  token: string;
}

export interface SessionData {
  room: RoomPublic;
  playerId: string;
  token: string;
}

export interface MatchStartPayload {
  gameId: GameId;
  round: number;
  seed: number;
  /** ordem dos slots vigente na partida */
  slots: { playerId: string; slot: number }[];
  startsAt: number;
  /** rodada do campeonato e total, para o HUD ("rodada 2 de 5") */
  seriesRound: number;
  seriesRounds: number;
}

export interface InputPayload {
  mx: number;
  my: number;
  dash: number;
}

export const EMOTES = ['risada', 'susto', 'fogo', 'coroa', 'bomba', 'salve'] as const;
export type Emote = (typeof EMOTES)[number];

export interface ToastPayload {
  kind: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface ClientToServerEvents {
  'room:create': (payload: CreatePayload, ack: (res: Ack<SessionData>) => void) => void;
  'room:join': (payload: JoinPayload, ack: (res: Ack<SessionData>) => void) => void;
  'room:rejoin': (payload: RejoinPayload, ack: (res: Ack<SessionData>) => void) => void;
  'room:leave': () => void;
  'room:ready': (ready: boolean) => void;
  'room:profile': (payload: { name?: string; avatar?: AvatarId }) => void;
  /** host define o tamanho do campeonato (1 ate o total de jogos) */
  'room:setRounds': (rounds: number) => void;
  'room:addBot': () => void;
  'room:removePlayer': (playerId: string) => void;
  'room:emote': (emote: Emote) => void;
  'match:start': () => void;
  'match:input': (payload: InputPayload) => void;
  'match:rematch': () => void;
  'match:lobby': () => void;
  'net:ping': (sentAt: number, ack: (serverNow: number) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomPublic) => void;
  'room:closed': (payload: { reason: string }) => void;
  'match:start': (payload: MatchStartPayload) => void;
  'match:snapshot': (snapshot: Snapshot) => void;
  'match:end': (results: MatchResults) => void;
  'room:emote': (payload: { playerId: string; emote: Emote }) => void;
  toast: (payload: ToastPayload) => void;
}
