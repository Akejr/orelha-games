import { TICK_RATE } from '../shared';
import { log } from '../util/log';
import { makeRoomCode } from '../util/ids';
import { Room, type RoomEmitter } from './Room';

const STEP = 1 / TICK_RATE;
const MAX_STEPS_PER_FRAME = 5;
/** Tempo que um jogador desconectado mantém a vaga (reconexão). */
const RECONNECT_GRACE = 90_000;
/** Sala sem ninguém conectado é encerrada depois disso. */
const EMPTY_ROOM_TTL = 90_000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private loop: NodeJS.Timeout | null = null;
  private sweeper: NodeJS.Timeout | null = null;
  private lastTick = 0;
  private accumulator = 0;

  constructor(private readonly emitter: RoomEmitter) {}

  get size(): number {
    return this.rooms.size;
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  create(name: string): Room {
    let code = makeRoomCode();
    let guard = 0;
    while (this.rooms.has(code) && guard < 50) {
      code = makeRoomCode(guard > 25 ? 5 : 4);
      guard += 1;
    }
    const room = new Room(code, name, this.emitter);
    this.rooms.set(code, room);
    log.info(`sala criada ${code} (${this.rooms.size} ativas)`);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  destroy(code: string, reason: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    log.info(`sala encerrada ${code} (${reason})`);
  }

  start(): void {
    if (this.loop) return;
    this.lastTick = Date.now();
    this.loop = setInterval(() => this.frame(), 1000 / TICK_RATE);
    this.sweeper = setInterval(() => this.sweep(), 10_000);
    log.info(`loop de simulação em ${TICK_RATE} Hz`);
  }

  stop(): void {
    if (this.loop) clearInterval(this.loop);
    if (this.sweeper) clearInterval(this.sweeper);
    this.loop = null;
    this.sweeper = null;
  }

  private frame(): void {
    const now = Date.now();
    const delta = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= STEP;
      steps += 1;
      for (const room of this.rooms.values()) {
        try {
          if (room.inMatch) room.tick(STEP);
          else room.tickIdle();
        } catch (error) {
          log.error(`falha no tick da sala ${room.code}`, error);
          room.abortMatch('A partida teve um problema e foi encerrada.');
        }
      }
    }
    if (steps >= MAX_STEPS_PER_FRAME) {
      // servidor engasgou: descarta o resíduo para não acumular atraso
      this.accumulator = 0;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      // libera vagas de quem desconectou e não voltou
      if (!room.inMatch) {
        const stale = room.players.filter(
          (p) => !p.bot && !p.connected && p.disconnectedAt && now - p.disconnectedAt > RECONNECT_GRACE,
        );
        if (stale.length > 0) {
          for (const player of stale) {
            room.removePlayer(player.id);
            log.info(`vaga liberada ${room.code}/${player.name}`);
          }
          if (room.players.length > 0) room.broadcastState();
        }
      }

      const anyoneHere = room.players.some((p) => !p.bot && p.connected);
      if (!anyoneHere && now - room.lastActivity > EMPTY_ROOM_TTL) {
        this.destroy(room.code, 'sala vazia');
        continue;
      }
      if (room.players.length === 0 && now - room.lastActivity > 20_000) {
        this.destroy(room.code, 'sem jogadores');
      }
    }
  }

  stats(): { rooms: number; players: number; inMatch: number } {
    let players = 0;
    let inMatch = 0;
    for (const room of this.rooms.values()) {
      players += room.humanCount;
      if (room.inMatch) inMatch += 1;
    }
    return { rooms: this.rooms.size, players, inMatch };
  }
}
