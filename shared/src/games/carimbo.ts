import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  createBaseState,
  createFighter,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { dist, normalize, TAU } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA, ARENA_CENTER, buildResults, closeByScore, item, pointsLabel, stepBodies } from './kit';

/**
 * CARIMBO!
 *
 * Seis carimbos no chão e uma ordem chamada para todo mundo ao mesmo tempo:
 * triângulo, coração, raio. Pise neles NESSA ordem e você marca ponto. Pisou em
 * carimbo errado? Voltou para o começo da sequência.
 *
 * Como a ordem é a mesma para todos, os seis carimbos viram seis
 * engarrafamentos — e empurrar alguém para o carimbo errado é jogada legítima.
 *
 * Códigos do snapshot: k = símbolo do carimbo (0..5); o = posição na sequência
 * (-1 fora dela); n = [s0, s1, s2, progresso de cada jogador…].
 */

const TIME_LIMIT = 75;
const PAD_RADIUS = 48;
const SEQUENCE = 3;
const SYMBOLS = 6;

/** Nomes na ordem dos símbolos desenhados pelo renderer. */
export const CARIMBO_NAMES = [
  'TRIÂNGULO',
  'CÍRCULO',
  'QUADRADO',
  'ESTRELA',
  'CORAÇÃO',
  'RAIO',
];

export interface CarimboState extends BaseMatchState {
  /** símbolo de cada carimbo (permutação de 0..5) */
  pads: number[];
  sequence: number[];
  /** em que passo da sequência cada jogador está */
  progress: Record<string, number>;
  /** carimbo em que o jogador está pisando agora (-1 = nenhum) */
  standing: Record<string, number>;
  stamps: Record<string, number>;
  misses: Record<string, number>;
  rng: Rng;
}

function padPosition(index: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index / SYMBOLS) * TAU;
  return {
    x: ARENA_CENTER.x + Math.cos(angle) * ARENA.w * 0.31,
    y: ARENA_CENTER.y + Math.sin(angle) * ARENA.h * 0.3,
  };
}

function drawSequence(rng: Rng): number[] {
  const pool = rng.shuffle(Array.from({ length: SYMBOLS }, (_, i) => i));
  return pool.slice(0, SEQUENCE);
}

export const carimboGame: GameModule<CarimboState> = {
  id: 'carimbo',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): CarimboState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 96);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    return {
      ...createBaseState('carimbo', ctx, fighters),
      pads: rng.shuffle(Array.from({ length: SYMBOLS }, (_, i) => i)),
      sequence: drawSequence(rng),
      progress: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      standing: Object.fromEntries(fighters.map((f) => [f.id, -1])),
      stamps: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      misses: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.1 });
    if (!playing) return;

    for (const f of state.fighters) {
      if (!f.alive) continue;

      // em qual carimbo o jogador está agora
      let padIndex = -1;
      for (let i = 0; i < SYMBOLS; i += 1) {
        const pad = padPosition(i);
        if (dist(f.x, f.y, pad.x, pad.y) <= PAD_RADIUS) {
          padIndex = i;
          break;
        }
      }

      const before = state.standing[f.id] ?? -1;
      state.standing[f.id] = padIndex;
      // só conta ao ENTRAR num carimbo: parado em cima não fica pontuando
      if (padIndex < 0 || padIndex === before) continue;

      const symbol = state.pads[padIndex];
      const step = state.progress[f.id] ?? 0;
      const pad = padPosition(padIndex);

      if (symbol === state.sequence[step]) {
        const next = step + 1;
        f.squash = 0.5;
        if (next >= SEQUENCE) {
          // sequência completa: ponto e ordem nova para todos
          state.progress[f.id] = 0;
          state.stamps[f.id] = (state.stamps[f.id] ?? 0) + 1;
          f.score = state.stamps[f.id];
          state.events.push({ k: 'score', id: f.id, x: pad.x, y: pad.y, v: 1, i: 1 });

          state.sequence = drawSequence(state.rng);
          state.pads = state.rng.shuffle(state.pads.slice());
          for (const other of state.fighters) {
            state.progress[other.id] = 0;
            state.standing[other.id] = -1;
          }
          state.events.push({ k: 'call', v: 1 });
          break;
        }
        state.progress[f.id] = next;
        state.events.push({ k: 'checkpoint', id: f.id, x: pad.x, y: pad.y, v: next / SEQUENCE });
      } else if (step > 0) {
        // errou no meio da sequência: volta para o começo
        state.progress[f.id] = 0;
        state.misses[f.id] = (state.misses[f.id] ?? 0) + 1;
        f.squash = -0.6;
        f.hitFlash = 1;
        state.events.push({ k: 'hit', id: f.id, x: pad.x, y: pad.y, v: 0.6 });
      }
    }

    if (state.elapsed >= TIME_LIMIT) closeByScore(state);
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'carimbo',
      (f) => pointsLabel(f, 'sequência'),
      (f) => {
        const misses = state.misses[f.id] ?? 0;
        return misses > 0 ? `${misses} carimbo errado` : 'nenhum erro';
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: state.pads.map((symbol, index) => {
          const pad = padPosition(index);
          const position = state.sequence.indexOf(symbol);
          return item(pad.x, pad.y, PAD_RADIUS, symbol, { o: position });
        }),
        n: [
          ...state.sequence,
          ...state.fighters.map((f) => state.progress[f.id] ?? 0),
        ],
        s: 'CARIMBE NA ORDEM!',
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.3, rng.next);
    const step = state.progress[f.id] ?? 0;
    const wanted = state.sequence[step];

    let target = padPosition(0);
    for (let i = 0; i < SYMBOLS; i += 1) {
      if (state.pads[i] !== wanted) continue;
      target = padPosition(i);
      break;
    }

    // rota ruim de propósito: o bot vai reto e às vezes pisa em carimbo errado
    const d = dist(f.x, f.y, target.x, target.y);
    const dir = normalize(target.x - f.x + f.ai.jitterX * 0.12, target.y - f.y + f.ai.jitterY * 0.12);
    return {
      mx: dir.x,
      my: dir.y,
      dash: d > 200 && f.dashCooldown <= 0 && rng.chance(dt * 3) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
