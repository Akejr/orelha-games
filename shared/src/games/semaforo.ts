import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  requestBotDash,
} from '../engine';
import { clamp, round2 } from '../math';
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
import { ARENA, buildResults, item, stepBodies } from './kit';

/**
 * SEMÁFORO!
 *
 * Corrida em linha reta com um sinal mandando em você: no verde corre, no
 * vermelho é estátua — e no amarelo tem que andar DEVAGAR, nem parar nem correr.
 * É o amarelo que faz o jogo: ninguém consegue segurar o dedo no meio.
 *
 * Quem é pego fora da regra volta um trecho. Cada vez que você cruza a linha de
 * chegada vale um ponto e você volta para o começo.
 *
 * Códigos do snapshot: k=0 linha de chegada, k=1 linha de largada.
 */

const TIME_LIMIT = 70;
const FINISH_Y = ARENA.y + 74;
const START_Y = ARENA.y + ARENA.h - 74;
/** Quanto o infrator volta para trás. */
const SETBACK = 145;
/** Acima disso você está "correndo". */
const FAST = 205;
/** Abaixo disso você está "parado". */
const STILL = 48;

type Light = 0 | 1 | 2;

const LIGHT_LABEL: Record<Light, string> = {
  0: 'VERDE! CORRE!',
  1: 'AMARELO! DEVAGAR, SEM PARAR!',
  2: 'VERMELHO! ESTÁTUA!',
};

export interface SemaforoState extends BaseMatchState {
  light: Light;
  timer: number;
  /** tempo desde a última troca de sinal (o bot usa para "reagir") */
  since: number;
  cycle: number;
  laps: Record<string, number>;
  fouls: Record<string, number>;
  rng: Rng;
}

function lightTimeFor(light: Light, cycle: number, rng: Rng): number {
  // o ciclo aperta com o tempo: verde mais curto, vermelho mais traiçoeiro
  if (light === 0) return clamp(rng.range(1.8, 3.4) - cycle * 0.08, 1.1, 3.4);
  if (light === 1) return clamp(rng.range(1.1, 1.8) - cycle * 0.04, 0.8, 1.8);
  return clamp(rng.range(1.5, 2.8) - cycle * 0.05, 1.1, 2.8);
}

/** 0 na largada, 1 na linha de chegada. */
function progressOf(f: Fighter): number {
  return clamp((START_Y - f.y) / (START_Y - FINISH_Y), 0, 1);
}

export const semaforoGame: GameModule<SemaforoState> = {
  id: 'semaforo',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): SemaforoState {
    const rng = createRng(ctx.seed);
    const lane = ARENA.w / (ctx.players.length + 1);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, ARENA.x + lane * (i + 1), START_Y, 26),
    );
    return {
      ...createBaseState('semaforo', ctx, fighters),
      light: 0,
      timer: 2.6,
      since: 0,
      cycle: 0,
      laps: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      fouls: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.05 });
    if (!playing) return;

    state.timer -= dt;
    state.since += dt;
    if (state.timer <= 0) {
      state.light = ((state.light + 1) % 3) as Light;
      if (state.light === 0) state.cycle += 1;
      state.timer = lightTimeFor(state.light, state.cycle, state.rng);
      state.since = 0;
      state.events.push({ k: 'call', i: state.light, v: 1 });
    }

    // uma folga curta depois da troca: ninguém é multado pelo que já estava fazendo
    const enforcing = state.since > 0.28;

    for (const f of state.fighters) {
      if (!f.alive) continue;
      const speed = Math.hypot(f.vx, f.vy);
      let foul = false;
      if (enforcing && f.invuln <= 0) {
        if (state.light === 2) foul = speed > STILL;
        else if (state.light === 1) foul = speed > FAST || speed < STILL * 0.35;
      }

      if (foul) {
        state.fouls[f.id] = (state.fouls[f.id] ?? 0) + 1;
        f.y = Math.min(START_Y, f.y + SETBACK);
        f.vx = 0;
        f.vy = 0;
        f.stunTimer = Math.max(f.stunTimer, 0.45);
        f.invuln = 0.75;
        f.hitFlash = 1;
        f.squash = -0.7;
        state.events.push({ k: 'hit', id: f.id, x: f.x, y: f.y, v: 1 });
      }

      if (f.y <= FINISH_Y) {
        state.laps[f.id] = (state.laps[f.id] ?? 0) + 1;
        f.y = START_Y;
        f.vx = 0;
        f.vy = 0;
        f.invuln = 0.6;
        state.events.push({ k: 'score', id: f.id, x: f.x, y: FINISH_Y, v: 1, i: 1 });
      }

      // ponto = linhas cruzadas; a fração serve de desempate por avanço
      f.score = (state.laps[f.id] ?? 0) + progressOf(f) * 0.9;
    }

    if (state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.score - a.score || a.y - b.y);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'semaforo',
      (f) => {
        const laps = state.laps[f.id] ?? 0;
        if (laps > 0) return `${laps} ${laps === 1 ? 'linha' : 'linhas'}`;
        return `${Math.round(progressOf(f) * 100)}% do caminho`;
      },
      (f) => {
        const fouls = state.fouls[f.id] ?? 0;
        return fouls > 0 ? `${fouls} multa${fouls === 1 ? '' : 's'}` : 'sem multa';
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          item(ARENA.x + ARENA.w / 2, FINISH_Y, 0, 0, { w: Math.round(ARENA.w - 22), h: 16 }),
          item(ARENA.x + ARENA.w / 2, START_Y, 0, 1, { w: Math.round(ARENA.w - 22), h: 10 }),
        ],
        n: [state.light, round2(Math.max(0, state.timer)), round2(state.since)],
        s: LIGHT_LABEL[state.light],
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.28, rng.next);

    // reação humana: o bot leva um instante para obedecer o sinal novo
    const reaction = 0.12 + f.ai.reaction * 1.4;
    const obeying = state.since > reaction;
    const light = obeying ? state.light : (((state.light + 2) % 3) as Light);

    // a corrida é vertical; o jitter lateral evita fila indiana
    const lateral = clamp(f.ai.jitterX / 400, -0.5, 0.5);

    if (light === 0) {
      return {
        mx: lateral,
        my: -1,
        dash:
          f.dashCooldown <= 0 && state.timer > 0.5 && rng.chance(dt * 2.2)
            ? requestBotDash(f)
            : f.dashSeen,
      };
    }

    if (light === 1) {
      // andar devagar é difícil para todo mundo, inclusive para o bot
      const wobble = rng.chance(dt * 1.5) ? 0.7 : 0.26;
      return { mx: lateral * 0.3, my: -wobble, dash: f.dashSeen };
    }

    // vermelho: parado, com escorregada ocasional de dedo nervoso
    if (rng.chance(dt * 0.35)) return { mx: 0, my: -0.5, dash: f.dashSeen };
    return { mx: 0, my: 0, dash: f.dashSeen };
  },
};
