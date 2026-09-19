import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  Ack,
  AvatarId,
  Emote,
  GameId,
  MatchResults,
  MatchStartPayload,
  PlayerPublic,
  RoomPublic,
  SessionData,
  Snapshot,
} from '@shared/index';
import { sound } from '@/audio/SoundManager';
import { useToast } from '@/components/ui/Toast';
import { readJson, removeKey, writeJson } from '@/utils/storage';
import { getSocket } from './socket';
import { SnapshotBuffer } from './snapshotBuffer';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

interface StoredSession {
  code: string;
  playerId: string;
  token: string;
}

const SESSION_KEY = 'orelha.session';
const EMPTY_SESSION: StoredSession = { code: '', playerId: '', token: '' };

export interface EmoteEvent {
  playerId: string;
  emote: Emote;
  id: number;
}

interface RoomApi {
  connection: ConnectionStatus;
  room: RoomPublic | null;
  selfId: string | null;
  self: PlayerPublic | null;
  isHost: boolean;
  results: MatchResults | null;
  matchInfo: MatchStartPayload | null;
  latency: number;
  buffer: SnapshotBuffer;
  emotes: EmoteEvent[];
  createRoom: (options: {
    name: string;
    avatar: AvatarId;
    roomName?: string;
    rounds?: number;
  }) => Promise<{ ok: boolean; code?: string; error?: string }>;
  joinRoom: (options: {
    code: string;
    name: string;
    avatar: AvatarId;
  }) => Promise<{ ok: boolean; code?: string; error?: string }>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  updateProfile: (patch: { name?: string; avatar?: AvatarId }) => void;
  setRounds: (rounds: number) => void;
  addBot: () => void;
  removePlayer: (playerId: string) => void;
  startMatch: () => void;
  rematch: () => void;
  backToLobby: () => void;
  sendInput: (mx: number, my: number, dash: number) => void;
  sendEmote: (emote: Emote) => void;
}

const RoomContext = createContext<RoomApi | null>(null);

export function RoomProvider({ children }: { children: ReactNode }): JSX.Element {
  const toast = useToast();
  const navigate = useNavigate();

  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [matchInfo, setMatchInfo] = useState<MatchStartPayload | null>(null);
  const [latency, setLatency] = useState(0);
  const [emotes, setEmotes] = useState<EmoteEvent[]>([]);

  const bufferRef = useRef(new SnapshotBuffer());
  const sessionRef = useRef<StoredSession>(readJson(SESSION_KEY, EMPTY_SESSION, true));
  const emoteCounter = useRef(0);

  const persistSession = useCallback((session: StoredSession | null) => {
    if (session) {
      sessionRef.current = session;
      writeJson(SESSION_KEY, session, true);
    } else {
      sessionRef.current = EMPTY_SESSION;
      removeKey(SESSION_KEY, true);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Ciclo de vida do socket
  // -------------------------------------------------------------------------

  useEffect(() => {
    const socket = getSocket();

    const tryRejoin = (): void => {
      const session = sessionRef.current;
      if (!session.code || !session.playerId) return;
      socket.emit(
        'room:rejoin',
        { code: session.code, playerId: session.playerId, token: session.token },
        (response: Ack<SessionData>) => {
          if (response.ok) {
            setRoom(response.data.room);
            setSelfId(response.data.playerId);
            setResults(response.data.room.results);
          } else {
            persistSession(null);
          }
        },
      );
    };

    const onConnect = (): void => {
      setConnection('online');
      tryRejoin();
    };
    const onDisconnect = (): void => setConnection('reconnecting');
    const onConnectError = (): void => setConnection('offline');

    const onRoomState = (next: RoomPublic): void => {
      setRoom(next);
      if (next.results) setResults(next.results);
      if (next.status === 'lobby') setResults(next.results);
    };

    const onClosed = ({ reason }: { reason: string }): void => {
      persistSession(null);
      setRoom(null);
      setSelfId(null);
      setResults(null);
      setMatchInfo(null);
      bufferRef.current.clear();
      toast.warn(reason);
      navigate('/');
    };

    const onMatchStart = (payload: MatchStartPayload): void => {
      bufferRef.current.clear();
      setResults(null);
      setMatchInfo(payload);
      sound.setMood('match');
      sound.setTension(0);
    };

    const onSnapshot = (snapshot: Snapshot): void => {
      bufferRef.current.push(snapshot);
    };

    const onMatchEnd = (payload: MatchResults): void => {
      setResults(payload);
      sound.setTension(0);
    };

    const onEmote = (payload: { playerId: string; emote: Emote }): void => {
      emoteCounter.current += 1;
      const item: EmoteEvent = { ...payload, id: emoteCounter.current };
      setEmotes((previous) => [...previous.slice(-6), item]);
      sound.play('emote');
      window.setTimeout(() => {
        setEmotes((previous) => previous.filter((entry) => entry.id !== item.id));
      }, 2200);
    };

    const onToast = (payload: { kind: 'info' | 'success' | 'warn' | 'error'; message: string }): void => {
      toast.push(payload.kind, payload.message);
      if (payload.kind === 'success') sound.play('join');
      if (payload.kind === 'warn') sound.play('leave');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:state', onRoomState);
    socket.on('room:closed', onClosed);
    socket.on('match:start', onMatchStart);
    socket.on('match:snapshot', onSnapshot);
    socket.on('match:end', onMatchEnd);
    socket.on('room:emote', onEmote);
    socket.on('toast', onToast);

    if (socket.connected) onConnect();

    const pingTimer = window.setInterval(() => {
      const sentAt = Date.now();
      socket.emit('net:ping', sentAt, () => {
        const rtt = Date.now() - sentAt;
        setLatency((previous) => Math.round(previous * 0.7 + rtt * 0.3));
      });
    }, 3000);

    return () => {
      window.clearInterval(pingTimer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:state', onRoomState);
      socket.off('room:closed', onClosed);
      socket.off('match:start', onMatchStart);
      socket.off('match:snapshot', onSnapshot);
      socket.off('match:end', onMatchEnd);
      socket.off('room:emote', onEmote);
      socket.off('toast', onToast);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  const createRoom = useCallback<RoomApi['createRoom']>(
    (options) =>
      new Promise((resolve) => {
        const socket = getSocket();
        socket.emit('room:create', options, (response: Ack<SessionData>) => {
          if (!response.ok) {
            resolve({ ok: false, error: response.error });
            return;
          }
          persistSession({
            code: response.data.room.code,
            playerId: response.data.playerId,
            token: response.data.token,
          });
          setRoom(response.data.room);
          setSelfId(response.data.playerId);
          setResults(null);
          bufferRef.current.clear();
          resolve({ ok: true, code: response.data.room.code });
        });
      }),
    [persistSession],
  );

  const joinRoom = useCallback<RoomApi['joinRoom']>(
    (options) =>
      new Promise((resolve) => {
        const socket = getSocket();
        socket.emit(
          'room:join',
          { ...options, code: options.code.toUpperCase() },
          (response: Ack<SessionData>) => {
            if (!response.ok) {
              resolve({ ok: false, error: response.error });
              return;
            }
            persistSession({
              code: response.data.room.code,
              playerId: response.data.playerId,
              token: response.data.token,
            });
            setRoom(response.data.room);
            setSelfId(response.data.playerId);
            setResults(response.data.room.results);
            bufferRef.current.clear();
            resolve({ ok: true, code: response.data.room.code });
          },
        );
      }),
    [persistSession],
  );

  const leaveRoom = useCallback(() => {
    getSocket().emit('room:leave');
    persistSession(null);
    setRoom(null);
    setSelfId(null);
    setResults(null);
    setMatchInfo(null);
    bufferRef.current.clear();
    sound.setMood('menu');
  }, [persistSession]);

  const api = useMemo<RoomApi>(() => {
    const socket = getSocket();
    const self = room?.players.find((player) => player.id === selfId) ?? null;
    return {
      connection,
      room,
      selfId,
      self,
      isHost: Boolean(self?.isHost),
      results,
      matchInfo,
      latency,
      buffer: bufferRef.current,
      emotes,
      createRoom,
      joinRoom,
      leaveRoom,
      setReady: (ready) => {
        sound.play(ready ? 'ready' : 'unready');
        socket.emit('room:ready', ready);
      },
      updateProfile: (patch) => {
        sound.play('select');
        socket.emit('room:profile', patch);
      },
      setRounds: (rounds) => {
        sound.play('select');
        socket.emit('room:setRounds', rounds);
      },
      addBot: () => socket.emit('room:addBot'),
      removePlayer: (playerId) => socket.emit('room:removePlayer', playerId),
      startMatch: () => socket.emit('match:start'),
      rematch: () => socket.emit('match:rematch'),
      backToLobby: () => socket.emit('match:lobby'),
      sendInput: (mx, my, dash) => {
        socket.volatile.emit('match:input', { mx, my, dash });
      },
      sendEmote: (emote) => socket.emit('room:emote', emote),
    };
  }, [connection, createRoom, emotes, joinRoom, latency, leaveRoom, matchInfo, results, room, selfId]);

  return <RoomContext.Provider value={api}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomApi {
  const context = useContext(RoomContext);
  if (!context) throw new Error('useRoom precisa do RoomProvider');
  return context;
}
