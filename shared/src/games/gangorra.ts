import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  eliminate,
  moveConfig,
  requestBotDash,
  resolveFighterCollisions,
  ringSpawns,
  stepDead,
  stepFighter,
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
import { emptyInput } from '../types';
import { ARENA, ARENA_CENTER, buildResults, item } from './kit';

/**
 * GANGORRA!
 *
 * A arena é uma prancha apoiada no meio. Ela inclina para o lado onde tem mais
 * gente, todo mundo escorrega para baixo, e caixotes caem do céu para bagunçar a
 * conta. Ninguém empurra ninguém para fora aqui: quem empurra é o próprio chão.
 *
 * O detalhe que faz o jogo: caixote pode ser empurrado. Levar um caixote para o
 * outro lado é a jogada que decide a partida.
 *
 * Códigos do snapshot: k=0 caixote, k=1 prancha (a = inclinação).
 */

const TIME_LIMIT = 80;
/**
 * Escorregão no lado baixo — cresce com o tempo.
 *
 * O número que importa é a aceleração do jogador (5300). Enquanto o escorregão
 * fica abaixo dela, sempre dá para subir a ladeira e ninguém cai: a primeira
 * versão terminava em 80 segundos com zero eliminações. O fim da rampa passa de
 * propósito desse teto — a partir de certa altura o lado baixo é sentença.
 */
const SLIDE_START = 1300;
const SLIDE_END = 6300;
/** Tranco quando a prancha vira de vez. */
const SLAM_TILT = 0.82;
const SLAM_IMPULSE = 430;
/**
 * Balanço do mar.
 *
 * É a parte da inclinação que NINGUÉM controla, e é o que impede a partida de
 * virar cinco pessoas equilibradas no apoio até o tempo acabar. Cresce até ficar
 * mais forte do que a perna de qualquer um.
 */
const WOBBLE_MAX = 0.92;
const CRATE_EVERY = 5.2;
const CRATE_RADIUS = 34;
const CRATE_WEIGHT = 2.3;
const MAX_CRATES = 4;
/**
 * Peso necessário de um lado para a prancha virar de vez.
 *
 * Número alto de propósito: com escala baixa, cinco jogadores conseguiam
 * equilibrar a prancha entre eles e a partida acabava no tempo sem nenhuma
 * queda. Aqui gente pesa, mas caixote pesa muito mais — e caixote é o que se
 * empurra.
 */
const TORQUE_SCALE = 4.2;
/**
 * A prancha vai se partindo nas pontas.
 *
 * Sem isso o miolo da arena era abrigo permanente: os bots se equilibravam perto
 * do apoio e a partida terminava no tempo sem ninguém cair. Com as pontas caindo,
 * o espaço seguro acaba — e aí a inclinação decide.
 */
const PLANK_HALF_MIN = 196;
const BREAK_AT = 8;
const BREAK_DURATION = 44;

const CFG = moveConfig({
  accel: 5300,
  maxSpeed: 440,
  friction: 0.88,
  radius: 26,
  dashSpeed: 1150,
  dashTime: 0.19,
  dashCooldown: 0.58,
  knockback: 620,
  bounce: 0.45,
});

interface Crate {
  x: number;
  y: number;
  vx: number;
}

export interface GangorraState extends BaseMatchState {
  crates: Crate[];
  crateTimer: number;
  /** -1 (esquerda no chão) a 1 (direita no chão) */
  tilt: number;
  /** lado do último tranco, para não repetir no mesmo mergulho */
  slammed: number;
  rng: Rng;
}

function slideFor(elapsed: number): number {
  return SLIDE_START + (SLIDE_END - SLIDE_START) * clamp01(elapsed / 52);
}

/** Meia-largura da prancha que ainda existe. */
function plankHalfFor(elapsed: number): number {
  const full = ARENA.w / 2;
  return full - (full - PLANK_HALF_MIN) * clamp01((elapsed - BREAK_AT) / BREAK_DURATION);
}

/** Torque de um corpo: peso × distância do apoio, normalizado pela meia-prancha. */
function torqueOf(x: number, weight: number): number {
  return ((x - ARENA_CENTER.x) / (ARENA.w / 2)) * weight;
}

export const gangorraGame: GameModule<GangorraState> = {
  id: 'gangorra',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): GangorraState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 150);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    return {
      ...createBaseState('gangorra', ctx, fighters),
      crates: [],
      crateTimer: 3.4,
      tilt: 0,
      slammed: 0,
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    const slide = slideFor(state.elapsed);
    const plankHalf = plankHalfFor(state.elapsed);

    for (const f of state.fighters) {
      if (!f.alive) {
        stepDead(f, dt);
        continue;
      }
      const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
      stepFighter(f, input, CFG, dt, state.events);

      if (playing) {
        // escorregão para o lado baixo
        f.vx += state.tilt * slide * dt;
        f.survived = state.elapsed;
        f.score = f.survived;
      }

      // a prancha prende em cima e embaixo; nas laterais não tem nada
      const top = ARENA.y + f.radius;
      const bottom = ARENA.y + ARENA.h - f.radius;
      if (f.y < top) {
        f.y = top;
        f.vy = Math.abs(f.vy) * 0.4;
      } else if (f.y > bottom) {
        f.y = bottom;
        f.vy = -Math.abs(f.vy) * 0.4;
      }
    }

    resolveFighterCollisions(state.fighters, CFG, state.events, { knockScale: 1 });

    if (!playing) return;

    // caixotes novos
    state.crateTimer -= dt;
    if (state.crateTimer <= 0 && state.crates.length < MAX_CRATES) {
      state.crateTimer = CRATE_EVERY;
      // cai de preferência no lado que está em cima: sempre reinicia a discussão
      const side = state.tilt > 0.15 ? -1 : state.tilt < -0.15 ? 1 : state.rng.sign();
      const x = ARENA_CENTER.x + side * state.rng.range(ARENA.w * 0.12, ARENA.w * 0.4);
      state.crates.push({
        x,
        y: state.rng.range(ARENA.y + 110, ARENA.y + ARENA.h - 110),
        vx: 0,
      });
      state.events.push({ k: 'wall-spawn', x, y: ARENA_CENTER.y, v: 0.8 });
    }

    // caixotes escorregam, empurram e caem da prancha
    for (let i = state.crates.length - 1; i >= 0; i -= 1) {
      const crate = state.crates[i];
      crate.vx += state.tilt * slide * 1.05 * dt;
      crate.vx *= 0.985;
      crate.x += crate.vx * dt;

      for (const f of state.fighters) {
        if (!f.alive) continue;
        const dx = f.x - crate.x;
        const dy = f.y - crate.y;
        const distance = Math.hypot(dx, dy);
        const minimum = CRATE_RADIUS + f.radius;
        if (distance >= minimum || distance === 0) continue;

        const n = { x: dx / distance, y: dy / distance };
        const overlap = minimum - distance;
        // o caixote é pesado, mas dá para empurrar: 3/4 do afastamento é do jogador
        f.x += n.x * overlap * 0.75;
        f.y += n.y * overlap * 0.75;
        crate.x -= n.x * overlap * 0.25;

        const closing = (f.vx - crate.vx) * n.x + f.vy * n.y;
        if (closing < 0) {
          f.vx -= n.x * closing * 1.1;
          f.vy -= n.y * closing * 1.1;
          crate.vx += n.x * closing * 0.5;
          if (Math.abs(closing) > 300) {
            f.squash = -0.4;
            state.events.push({ k: 'hit', id: f.id, x: f.x, y: f.y, v: 0.5 });
          }
        }
      }

      if (Math.abs(crate.x - ARENA_CENTER.x) > plankHalf + CRATE_RADIUS) {
        state.crates.splice(i, 1);
        state.events.push({ k: 'tile-fall', x: crate.x, y: crate.y, v: 0.6 });
      }
    }

    // inclinação: soma dos torques + balanço que cresce com o tempo
    let torque = 0;
    for (const f of state.fighters) {
      if (!f.alive) continue;
      torque += torqueOf(f.x, 1);
    }
    for (const crate of state.crates) {
      torque += torqueOf(crate.x, CRATE_WEIGHT);
    }
    const wobble = Math.sin(state.elapsed * 1.05) * WOBBLE_MAX * clamp01(state.elapsed / 42);
    const target = clamp(torque / TORQUE_SCALE + wobble, -1, 1);
    state.tilt += (target - state.tilt) * Math.min(1, dt * 2.4);

    // virou de vez: tranco que joga todo mundo ladeira abaixo
    const side = state.tilt > SLAM_TILT ? 1 : state.tilt < -SLAM_TILT ? -1 : 0;
    if (side !== 0 && side !== state.slammed) {
      state.slammed = side;
      for (const f of state.fighters) {
        if (!f.alive) continue;
        f.vx += side * SLAM_IMPULSE;
        f.squash = -0.4;
      }
      for (const crate of state.crates) crate.vx += side * SLAM_IMPULSE * 0.7;
      state.events.push({ k: 'shrink', v: 1 });
    } else if (side === 0 && Math.abs(state.tilt) < SLAM_TILT * 0.55) {
      state.slammed = 0;
    }

    // quem passou da ponta caiu
    for (const f of state.fighters) {
      if (!f.alive) continue;
      if (Math.abs(f.x - ARENA_CENTER.x) > plankHalf + 10) eliminate(state, f, { v: 1 });
    }

    const alive = aliveFighters(state);
    if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.survived - a.survived || a.stagger - b.stagger);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'gangorra',
      (f) => `${f.survived.toFixed(1)}s em pé`,
      (f) => (f.place === 1 ? 'equilibrista' : null),
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          ...state.crates.map((crate) => item(crate.x, crate.y, CRATE_RADIUS, 0)),
          item(ARENA_CENTER.x, ARENA_CENTER.y, 0, 1, {
            w: Math.round(plankHalfFor(state.elapsed) * 2),
            h: Math.round(ARENA.h),
            a: round2(state.tilt),
          }),
        ],
        n: [round2(state.tilt), Math.round(plankHalfFor(state.elapsed))],
        s:
          state.tilt > 0.55
            ? 'A DIREITA ESTÁ AFUNDANDO!'
            : state.tilt < -0.55
              ? 'A ESQUERDA ESTÁ AFUNDANDO!'
              : undefined,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.26, rng.next);

    const center = ARENA_CENTER.x;
    const plankHalf = plankHalfFor(state.elapsed);
    // distância até a ponta da prancha: é o que mata aqui
    const margin = plankHalf - Math.abs(f.x - center);

    /**
     * O bot lê a inclinação com atraso (memória em ai.tx).
     *
     * Com leitura instantânea, cinco bots surfavam o balanço em perfeita sintonia
     * e ninguém caía nunca. Atraso é o que um humano tem de verdade.
     */
    f.ai.tx += (state.tilt - f.ai.tx) * Math.min(1, dt * (1.1 + f.ai.aggression));
    const readTilt = f.ai.tx;

    // subir a ladeira: alvo é o lado alto, sem passar da ponta
    const highSide = readTilt > 0 ? -1 : 1;
    const wantX = center + highSide * Math.min(ARENA.w * 0.26, plankHalf * 0.55);

    // caixote perto? empurrar para o lado baixo tira peso de cima de você
    let push: Crate | null = null;
    let pushD = Infinity;
    for (const crate of state.crates) {
      const d = dist(f.x, f.y, crate.x, crate.y);
      const helpful = Math.sign(crate.x - center) === highSide;
      if (helpful && d < 190 && d < pushD) {
        pushD = d;
        push = crate;
      }
    }

    if (push && rng.chance(0.6)) {
      const dir = normalize(push.x - f.x, push.y - f.y);
      return {
        mx: dir.x,
        my: dir.y,
        dash: pushD < 90 && f.dashCooldown <= 0 && rng.chance(dt * 4) ? requestBotDash(f) : f.dashSeen,
      };
    }

    const dir = normalize(wantX - f.x, ARENA_CENTER.y + f.ai.jitterY * 0.5 - f.y);
    const emergency = margin < 90;
    return {
      mx: dir.x,
      my: dir.y,
      dash:
        emergency && f.dashCooldown <= 0 && rng.chance(dt * 8) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
