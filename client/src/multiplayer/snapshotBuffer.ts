import { SNAPSHOT_RATE, type GameEvent, type NetFighter, type Snapshot } from '@shared/index';

/**
 * Buffer de snapshots + interpolação.
 *
 * O servidor é autoridade e envia 20 snapshots por segundo. Renderizar direto
 * daria 20 FPS visuais, então o cliente:
 *   1. guarda os últimos snapshots com o timestamp do servidor;
 *   2. renderiza ~120 ms no passado, interpolando entre dois snapshots;
 *   3. extrapola por pouco tempo se um pacote atrasar (evita travada).
 *
 * Nada disso passa pelo estado do React: o buffer vive em ref e é lido dentro
 * do requestAnimationFrame, evitando 20 re-renders por segundo.
 */

/** Atraso de renderização: 2,5 snapshots de folga absorve jitter de rede. */
export const INTERP_DELAY = (1000 / SNAPSHOT_RATE) * 2.5;
const MAX_EXTRAPOLATION = 90;
const CAPACITY = 12;

export interface FighterView {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  dashing: boolean;
  stunned: boolean;
  flash: number;
  stagger: number;
  score: number;
  place: number;
  facing: number;
  lives: number;
  invuln: boolean;
}

export class SnapshotBuffer {
  private items: Snapshot[] = [];
  private offset = 0;
  private offsetReady = false;
  private pendingEvents: GameEvent[] = [];
  latest: Snapshot | null = null;
  latency = 0;

  push(snapshot: Snapshot): void {
    // descarta pacotes fora de ordem (UDP-like em redes ruins)
    if (this.latest && snapshot.seq < this.latest.seq) return;

    const sample = snapshot.t - Date.now();
    if (!this.offsetReady) {
      this.offset = sample;
      this.offsetReady = true;
    } else {
      // média móvel + correção rápida quando o relógio pula
      this.offset += (sample - this.offset) * 0.08;
      if (Math.abs(sample - this.offset) > 400) this.offset = sample;
    }

    this.items.push(snapshot);
    if (this.items.length > CAPACITY) this.items.shift();
    this.latest = snapshot;
    if (snapshot.ev.length > 0) this.pendingEvents.push(...snapshot.ev);
  }

  clear(): void {
    this.items = [];
    this.latest = null;
    this.pendingEvents = [];
    this.offsetReady = false;
    this.offset = 0;
  }

  /** Eventos one-shot acumulados (som/partículas). Consome a fila. */
  drainEvents(): GameEvent[] {
    if (this.pendingEvents.length === 0) return [];
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  get serverNow(): number {
    return Date.now() + this.offset;
  }

  get renderTime(): number {
    return this.serverNow - INTERP_DELAY;
  }

  get size(): number {
    return this.items.length;
  }

  /**
   * Preenche `out` com o estado interpolado dos personagens no tempo de render.
   * Retorna o snapshot de referência para os campos discretos (fase, HUD, grid).
   */
  sample(out: Map<string, FighterView>): Snapshot | null {
    if (this.items.length === 0) return null;
    const time = this.renderTime;

    let older: Snapshot | null = null;
    let newer: Snapshot | null = null;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      if (item.t <= time) {
        older = item;
        newer = this.items[i + 1] ?? null;
        break;
      }
    }

    if (!older) {
      // ainda enchendo o buffer: usa o mais antigo disponível
      older = this.items[0];
      newer = this.items[1] ?? null;
    }

    const reference = newer ?? older;

    if (newer && newer.t > older.t) {
      const alpha = Math.max(0, Math.min(1, (time - older.t) / (newer.t - older.t)));
      const previous = new Map<string, NetFighter>();
      for (const fighter of older.ps) previous.set(fighter.i, fighter);
      for (const fighter of newer.ps) {
        const before = previous.get(fighter.i) ?? fighter;
        out.set(fighter.i, {
          id: fighter.i,
          x: before.x + (fighter.x - before.x) * alpha,
          y: before.y + (fighter.y - before.y) * alpha,
          vx: fighter.vx,
          vy: fighter.vy,
          alive: fighter.a === 1,
          dashing: fighter.d === 1,
          stunned: fighter.s === 1,
          flash: before.h + (fighter.h - before.h) * alpha,
          stagger: fighter.g,
          score: before.c + (fighter.c - before.c) * alpha,
          place: fighter.p,
          facing: fighter.f,
          lives: fighter.l,
          invuln: fighter.iv === 1,
        });
      }
      return reference;
    }

    // sem par futuro: extrapola um pouquinho pela velocidade
    const ahead = Math.min(MAX_EXTRAPOLATION, Math.max(0, time - older.t)) / 1000;
    for (const fighter of older.ps) {
      out.set(fighter.i, {
        id: fighter.i,
        x: fighter.x + fighter.vx * ahead,
        y: fighter.y + fighter.vy * ahead,
        vx: fighter.vx,
        vy: fighter.vy,
        alive: fighter.a === 1,
        dashing: fighter.d === 1,
        stunned: fighter.s === 1,
        flash: fighter.h,
        stagger: fighter.g,
        score: fighter.c,
        place: fighter.p,
        facing: fighter.f,
        lives: fighter.l,
        invuln: fighter.iv === 1,
      });
    }
    return older;
  }
}
