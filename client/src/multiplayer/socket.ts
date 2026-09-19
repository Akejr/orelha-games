import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from '@shared/index';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Em desenvolvimento o Vite faz proxy de /socket.io para o servidor Node; em
 * produção o próprio servidor entrega o client buildado. Nos dois casos a origem
 * é a mesma, então não precisamos de URL absoluta (nem de CORS).
 */
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

/**
 * Monta uma URL da API HTTP respeitando VITE_SERVER_URL. Importante quando o
 * portal e o servidor de jogo ficam em domínios diferentes — aí um fetch
 * relativo bateria no host errado.
 */
export function apiUrl(path: string): string {
  return `${SERVER_URL}${path}`;
}

let instance: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (instance) return instance;
  instance = io(SERVER_URL, {
    path: SOCKET_PATH,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 8000,
  }) as GameSocket;
  return instance;
}
