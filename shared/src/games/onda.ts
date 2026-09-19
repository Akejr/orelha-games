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
import { clamp, clamp01, dist, normalize, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  Fighter,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA, ARENA_CENTER, buildResults, item, livesLabel, stepBodies } from './kit';

/**
 * ONDA!
 *
 * A água varre a arena de um lado ao outro. As pedras são o único lugar seco, e
 * elas encolhem a cada onda — no começo cabe todo mundo, no fim não cabe. O aviso
 * chega antes da onda, então o erro nunca é falta de informação: é pressa,
 * empurrão e a pedra errada.
 *
 * Códigos do snapshot: k=0 pedra, k=1 onda passando, k=2 aviso de onda.
 */

const TIME_LIMIT = 85;
/**
 * Vidas por tamanho de sala.
 *
 * Com uma pedra só (sala de dois), cada onda tira vida de alguém — três vidas
 * acabavam em 24 segundos. Sala pequena ganha uma vida a mais para o duelo de
 * pedra render.
 */
function livesFor(count: number): number {
  return count <= 3 ? 4 : 3;
}
const ROCK_START = 96;
const ROCK_MIN = 52;
/** Empurrão da onda em quem foi pego. */
const WASH = 620;

type Dir = 0 | 1 | 2 | 3;

export interface OndaState extends BaseMatchState {
  rocks: { x: number; y: number; r: number }[];
  phaseName: 'aviso' | 'onda' | 'calma';
  timer: number;
  /** duração total da fase atual, para o cliente animar */
  span: number;
  dir: Dir;
  roundIndex: number;
  /** quem a onda atual já resolveu */
  resolved: string[];
  safeRounds: Record<string, number>;
  rng: Rng;
}

function warnTimeFor(index: number): number {
  return clamp(1.9 - index * 0.11, 0.95, 1.9);
}

function waveTimeFor(index: number): number {
  return clamp(1.15 - index * 0.06, 0.6, 1.15);
}

function rockRadiusFor(index: number): number {
  return clamp(ROCK_START - index * 6, ROCK_MIN, ROCK_START);
}

/** Espalha as pedras em posições distantes umas das outras. */
function layoutRocks(state: OndaState, count: number): void {
  const radius = rockRadiusFor(state.roundIndex);
  const margin = radius + 34;
  const rocks: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    let best = { x: ARENA_CENTER.x, y: ARENA_CENTER.y, r: radius };
    let bestScore = -1;
    for (let tries = 0; tries < 16; tries += 1) {
      const candidate = {
        x: state.rng.range(ARENA.x + margin, ARENA.x + ARENA.w - margin),
        y: state.rng.range(ARENA.y + margin, ARENA.y + ARENA.h - margin),
        r: radius,
      };
      let nearest = Infinity;
      for (const rock of rocks) {
        nearest = Math.min(nearest, dist(rock.x, rock.y, candidate.x, candidate.y));
      }
      if (nearest === Infinity || nearest > radius * 2.6) {
        best = candidate;
        break;
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        best = candidate;
      }
    }
    rocks.push(best);
  }
  state.rocks = rocks;
}

function onRock(state: OndaState, f: Fighter): boolean {
  for (const rock of state.rocks) {
    if (dist(f.x, f.y, rock.x, rock.y) <= rock.r) return true;
  }
  return false;
}

/** Posição da frente de onda, em unidades de mundo, no progresso 0..1. */
function waveFront(dir: Dir, progress: number): number {
  if (dir === 0) return ARENA.x - 60 + (ARENA.w + 120) * progress;
  if (dir === 1) return ARENA.x + ARENA.w + 60 - (ARENA.w + 120) * progress;
  if (dir === 2) return ARENA.y - 60 + (ARENA.h + 120) * progress;
  return ARENA.y + ARENA.h + 60 - (ARENA.h + 120) * progress;
}

/** true quando a frente de onda já passou pelo jogador. */
function passed(dir: Dir, front: number, f: Fighter): boolean {
  if (dir === 0) return front >= f.x;
  if (dir === 1) return front <= f.x;
  if (dir === 2) return front >= f.y;
  return front <= f.y;
}

const DIR_VECTOR: Record<Dir, { x: number; y: number }> = {
  0: { x: 1, y: 0 },
  1: { x: -1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: 0, y: -1 },
};

const DIR_LABEL: Record<Dir, string> = {
  0: 'ONDA VINDO DA ESQUERDA!',
  1: 'ONDA VINDO DA DIREITA!',
  2: 'ONDA VINDO DE CIMA!',
  3: 'ONDA VINDO DE BAIXO!',
};

export const ondaGame: GameModule<OndaState> = {
  id: 'onda',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): OndaState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 150);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = livesFor(fighters.length);
    const state: OndaState = {
      ...createBaseState('onda', ctx, fighters),
      rocks: [],
      phaseName: 'aviso',
      timer: 2.4,
      span: 2.4,
      dir: rng.int(0, 3) as Dir,
      roundIndex: 0,
      resolved: [],
      safeRounds: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
    layoutRocks(state, Math.max(1, Math.ceil(fighters.length / 2)));
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.1 });
    if (!playing) return;

    state.timer -= dt;

    if (state.phaseName === 'onda') {
      const progress = clamp01(1 - state.timer / state.span);
      const front = waveFront(state.dir, progress);
      const push = DIR_VECTOR[state.dir];

      for (const f of state.fighters) {
        if (!f.alive || state.resolved.includes(f.id)) continue;
        if (!passed(state.dir, front, f)) continue;
        state.resolved.push(f.id);

        if (onRock(state, f)) {
          state.safeRounds[f.id] = (state.safeRounds[f.id] ?? 0) + 1;
          f.score = state.safeRounds[f.id];
          state.events.push({ k: 'mine-safe', id: f.id, x: f.x, y: f.y, v: 0.4 });
        } else {
          f.vx += push.x * WASH;
          f.vy += push.y * WASH;
          hurt(state, f, { invuln: 1.1, kind: 'life-lost' });
        }
      }
    }

    if (state.timer <= 0) {
      if (state.phaseName === 'aviso') {
        state.phaseName = 'onda';
        state.span = waveTimeFor(state.roundIndex);
        state.timer = state.span;
        state.resolved = [];
        state.events.push({ k: 'wall-spawn', v: 1 });
      } else if (state.phaseName === 'onda') {
        state.phaseName = 'calma';
        state.span = 1.1;
        state.timer = state.span;
      } else {
        state.roundIndex += 1;
        state.dir = ((state.dir + state.rng.int(1, 3)) % 4) as Dir;
        state.phaseName = 'aviso';
        state.span = warnTimeFor(state.roundIndex);
        state.timer = state.span;
        layoutRocks(state, Math.max(1, Math.ceil(aliveFighters(state).length / 2)));
        state.events.push({ k: 'call', v: 0.6 });
      }
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
      'onda',
      (f) => livesLabel(f),
      (f) => {
        const safe = state.safeRounds[f.id] ?? 0;
        return safe > 0 ? `${safe} onda${safe === 1 ? '' : 's'} na pedra` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    const items = state.rocks.map((rock) => item(rock.x, rock.y, rock.r, 0));
    const horizontal = state.dir === 0 || state.dir === 1;
    const progress = clamp01(1 - state.timer / Math.max(0.001, state.span));

    if (state.phaseName === 'onda') {
      const front = waveFront(state.dir, progress);
      items.push(
        item(horizontal ? front : ARENA_CENTER.x, horizontal ? ARENA_CENTER.y : front, 0, 1, {
          w: horizontal ? 120 : Math.round(ARENA.w),
          h: horizontal ? Math.round(ARENA.h) : 120,
          a: state.dir,
          v: round2(progress),
        }),
      );
    } else if (state.phaseName === 'aviso') {
      items.push(
        item(ARENA_CENTER.x, ARENA_CENTER.y, 0, 2, {
          a: state.dir,
          v: round2(progress),
        }),
      );
    }

    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items,
        n: [state.roundIndex + 1, round2(Math.max(0, state.timer)), state.dir],
        s:
          state.phaseName === 'aviso'
            ? DIR_LABEL[state.dir]
            : state.phaseName === 'onda'
              ? 'SEGURA!'
              : 'ESCOLHA A PEDRA',
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.32, rng.next);

    // pedra mais próxima que ainda tem espaço (contando quem já está nela)
    let best: { x: number; y: number; r: number } | null = null;
    let bestScore = -Infinity;
    for (const rock of state.rocks) {
      const myD = dist(f.x, f.y, rock.x, rock.y);
      let crowd = 0;
      for (const other of state.fighters) {
        if (other === f || !other.alive) continue;
        if (dist(other.x, other.y, rock.x, rock.y) <= rock.r) crowd += 1;
      }
      // pedra grande aceita companhia; pedra pequena virou briga
      const room = rock.r / 70;
      const score = -myD * 0.7 - crowd * (150 / room);
      if (score > bestScore) {
        bestScore = score;
        best = rock;
      }
    }

    if (!best) {
      const dir = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
      return { mx: dir.x, my: dir.y, dash: f.dashSeen };
    }

    const d = dist(f.x, f.y, best.x, best.y);
    const dir = normalize(best.x - f.x, best.y - f.y);
    const safeNow = d <= best.r * 0.7;
    const hurry = state.phaseName !== 'calma' && !safeNow;

    if (safeNow && state.phaseName !== 'calma') {
      // já está seco: tenta empurrar quem dividir a pedra
      const rival = state.fighters.find(
        (p) => p !== f && p.alive && best && dist(p.x, p.y, best.x, best.y) <= best.r + 20,
      );
      if (rival && f.dashCooldown <= 0 && rng.chance(dt * 2)) {
        const toRival = normalize(rival.x - f.x, rival.y - f.y);
        return { mx: toRival.x, my: toRival.y, dash: requestBotDash(f) };
      }
      return { mx: dir.x * 0.25, my: dir.y * 0.25, dash: f.dashSeen };
    }

    return {
      mx: dir.x,
      my: dir.y,
      dash:
        hurry && d > 140 && f.dashCooldown <= 0 && rng.chance(dt * 7)
          ? requestBotDash(f)
          : f.dashSeen,
    };
  },
};
