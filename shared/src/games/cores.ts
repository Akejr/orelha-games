import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  hurt,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { clamp, normalize, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA, ARENA_CENTER, buildResults, item, livesLabel, stepBodies } from './kit';

/**
 * CORES!
 *
 * Clássico de festa: o chão tem seis cores, uma é chamada e quem não estiver
 * nela quando o tempo zerar perde uma vida. As cores embaralham a cada rodada e
 * o cronômetro encurta — no fim viram três segundos de correria pura.
 *
 * Códigos do snapshot: k = índice da cor (0..5) de cada bloco; grid = ordem das
 * cores nos blocos; n = [corChamada, tempoRestante, rodada].
 */

const TIME_LIMIT = 88;
const LIVES = 3;
const COLS = 3;
const ROWS = 2;
const COLORS = 6;
/** Nomes na ordem das cores usadas pelo renderer. */
export const CORES_NAMES = ['VERMELHO', 'AZUL', 'AMARELO', 'VERDE', 'ROXO', 'LARANJA'];

export interface CoresState extends BaseMatchState {
  /** cor de cada bloco (índice 0..5), embaralhado a cada rodada */
  layout: number[];
  called: number;
  timer: number;
  roundTime: number;
  roundIndex: number;
  /** true no intervalo entre rodadas (mostra o resultado da chamada) */
  resolving: number;
  safeRounds: Record<string, number>;
  rng: Rng;
}

function blockRect(index: number): { x: number; y: number; w: number; h: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const w = ARENA.w / COLS;
  const h = ARENA.h / ROWS;
  return { x: ARENA.x + col * w, y: ARENA.y + row * h, w, h };
}

function blockAt(x: number, y: number): number {
  const col = Math.floor(((x - ARENA.x) / ARENA.w) * COLS);
  const row = Math.floor(((y - ARENA.y) / ARENA.h) * ROWS);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
  return row * COLS + col;
}

function roundTimeFor(index: number): number {
  return clamp(4.2 - index * 0.26, 1.45, 4.2);
}

export const coresGame: GameModule<CoresState> = {
  id: 'cores',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): CoresState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 120);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = LIVES;
    const layout = rng.shuffle(Array.from({ length: COLORS }, (_, i) => i));
    return {
      ...createBaseState('cores', ctx, fighters),
      layout,
      called: layout[rng.int(0, COLORS - 1)],
      timer: 4.6,
      roundTime: 4.6,
      roundIndex: 0,
      resolving: 0,
      safeRounds: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.15 });
    if (!playing) return;

    // intervalo curto entre rodadas: dá tempo de ver quem errou
    if (state.resolving > 0) {
      state.resolving -= dt;
      if (state.resolving <= 0) {
        state.roundIndex += 1;
        state.layout = state.rng.shuffle(state.layout.slice());
        state.called = state.layout[state.rng.int(0, COLORS - 1)];
        state.roundTime = roundTimeFor(state.roundIndex);
        state.timer = state.roundTime;
        state.events.push({ k: 'call', i: state.called, v: 1 });
      }
      return;
    }

    state.timer -= dt;
    if (state.timer <= 0) {
      // hora da verdade
      for (const f of state.fighters) {
        if (!f.alive) continue;
        const block = blockAt(f.x, f.y);
        const onColor = block >= 0 && state.layout[block] === state.called;
        if (onColor) {
          state.safeRounds[f.id] = (state.safeRounds[f.id] ?? 0) + 1;
          f.score = state.safeRounds[f.id];
          state.events.push({ k: 'mine-safe', id: f.id, x: f.x, y: f.y, v: 0.5 });
        } else {
          hurt(state, f, { invuln: 1.2, kind: 'life-lost' });
        }
      }
      state.resolving = 1.1;
    }

    const alive = aliveFighters(state);
    if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.lives - a.lives || b.score - a.score);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'cores',
      (f) => livesLabel(f),
      (f) => {
        const safe = state.safeRounds[f.id] ?? 0;
        return safe > 0 ? `${safe} acerto${safe === 1 ? '' : 's'}` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: state.layout.map((color, index) => {
          const rect = blockRect(index);
          return item(rect.x + rect.w / 2, rect.y + rect.h / 2, 0, color, {
            w: Math.round(rect.w),
            h: Math.round(rect.h),
            v: color === state.called ? 1 : 0,
          });
        }),
        n: [
          state.called,
          round2(Math.max(0, state.timer)),
          round2(state.roundTime),
          state.resolving > 0 ? 1 : 0,
        ],
        s: `PISE NO ${CORES_NAMES[state.called]}!`,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.5, rng.next);

    // reação humana: o bot demora um tiquinho para "ler" a chamada
    const reacted = state.timer < state.roundTime - f.ai.reaction * 3.5;
    const current = blockAt(f.x, f.y);
    const onColor = current >= 0 && state.layout[current] === state.called;

    if (state.resolving > 0 || !reacted) {
      // fica circulando pelo centro, de onde alcança mais blocos
      const dir = normalize(
        ARENA_CENTER.x - f.x + f.ai.jitterX * 0.6,
        ARENA_CENTER.y - f.y + f.ai.jitterY * 0.6,
      );
      return { mx: dir.x * 0.5, my: dir.y * 0.5, dash: f.dashSeen };
    }

    if (onColor) {
      // já está na cor: empurra quem chegou junto para fora do bloco
      const rival = state.fighters.find(
        (p) => p !== f && p.alive && blockAt(p.x, p.y) === current,
      );
      if (rival && f.dashCooldown <= 0 && rng.chance(dt * 1.5)) {
        const toRival = normalize(rival.x - f.x, rival.y - f.y);
        return { mx: toRival.x, my: toRival.y, dash: requestBotDash(f) };
      }
      const rect = blockRect(current);
      const dir = normalize(rect.x + rect.w / 2 - f.x, rect.y + rect.h / 2 - f.y);
      return { mx: dir.x * 0.4, my: dir.y * 0.4, dash: f.dashSeen };
    }

    // corre para o bloco da cor chamada mais próximo
    // erro humano: de vez em quando o bot lê a cor errada e corre para o bloco
    // errado. Sem isso a rodada terminava no tempo limite com todas as vidas.
    const confused = f.ai.jitterY > 92;
    const wanted = confused ? (state.called + 1) % COLORS : state.called;

    let bestIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < state.layout.length; i += 1) {
      if (state.layout[i] !== wanted) continue;
      const rect = blockRect(i);
      const d = Math.hypot(rect.x + rect.w / 2 - f.x, rect.y + rect.h / 2 - f.y);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return { mx: 0, my: 0, dash: f.dashSeen };

    const rect = blockRect(bestIndex);
    const dir = normalize(rect.x + rect.w / 2 - f.x, rect.y + rect.h / 2 - f.y);
    const hurry = state.timer < 1.1 && bestDist > 150;
    return {
      mx: dir.x,
      my: dir.y,
      dash: hurry && f.dashCooldown <= 0 && rng.chance(dt * 8) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
