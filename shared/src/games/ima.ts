import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  eliminate,
  isOutsideCircle,
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
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { emptyInput, WORLD } from '../types';
import { buildResults, item } from './kit';

/**
 * ÍMÃ!
 *
 * Cada um vira um ímã. Polaridade igual se repele, diferente se atrai — e a
 * polaridade de todo mundo é sorteada de novo a cada poucos segundos, com aviso.
 * Quando troca, quem estava colado voa, e quem estava fugindo é puxado de volta.
 *
 * Códigos do snapshot: k=0 borda da arena; n = [aviso, polaridade de cada
 * jogador na ordem do snapshot].
 */

const TIME_LIMIT = 75;
const RADIUS_START = 340;
/** A plataforma fecha para o duelo não empatar no relógio. */
const RADIUS_MIN = 252;
const SHRINK_AT = 22;
const SHRINK_DURATION = 40;
const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };
/**
 * Força base do campo.
 *
 * Tem que ficar abaixo da aceleração do jogador (4400) somando TODOS os pares,
 * senão não existe jogo: a primeira versão jogava a sala inteira fora da
 * plataforma em três segundos. Por isso o total também é dividido pelo número de
 * vizinhos — sala cheia não pode virar liquidificador.
 */
const FIELD = 1350;
const FLIP_EVERY = 6;
const WARN_TIME = 1.2;

/**
 * Dash mais curto que o padrão.
 *
 * A plataforma tem 330 de raio e o dash padrão avança ~224 unidades: dar dash do
 * meio para o alvo caía fora do mundo, e a partida acabava em quatro segundos com
 * todo mundo se suicidando. Aqui o dash anda ~185 e sobra chão para frear.
 */
const CFG = moveConfig({
  accel: 4400,
  maxSpeed: 430,
  friction: 0.87,
  radius: 26,
  dashSpeed: 1030,
  dashTime: 0.18,
  dashCooldown: 0.56,
  /**
   * Trombada fraca de propósito.
   *
   * O campo já junta as pessoas à força; com o knockback padrão (700) a
   * atração virava um canhão — dois se atraem, trombam e os dois saem voando
   * para fora da plataforma. A partida acabava em 11 segundos. Aqui quem
   * expulsa é o campo, não a pancada.
   */
  knockback: 420,
  bounce: 0.6,
});

export interface ImaState extends BaseMatchState {
  /** 1 ou -1 por jogador */
  pole: Record<string, number>;
  radius: number;
  timer: number;
  /** próxima polaridade, já sorteada durante o aviso */
  next: Record<string, number>;
  rng: Rng;
}

/** Sorteia polaridades garantindo que existam os dois sinais. */
function rollPoles(state: ImaState): Record<string, number> {
  const alive = aliveFighters(state);
  const poles: Record<string, number> = {};
  for (const f of state.fighters) poles[f.id] = state.rng.chance(0.5) ? 1 : -1;
  if (alive.length > 1) {
    const allSame = alive.every((f) => poles[f.id] === poles[alive[0].id]);
    if (allSame) poles[alive[state.rng.int(0, alive.length - 1)].id] *= -1;
  }
  return poles;
}

export const imaGame: GameModule<ImaState> = {
  id: 'ima',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): ImaState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, CENTER.x, CENTER.y, 170);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const state: ImaState = {
      ...createBaseState('ima', ctx, fighters),
      pole: {},
      radius: RADIUS_START,
      timer: FLIP_EVERY,
      next: {},
      rng,
    };
    state.pole = rollPoles(state);
    state.next = {};
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);

    for (const f of state.fighters) {
      if (!f.alive) {
        stepDead(f, dt);
        continue;
      }
      const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
      stepFighter(f, input, CFG, dt, state.events);
      if (playing) {
        f.survived = state.elapsed;
        f.score = f.survived;
      }
    }

    if (playing) {
      // campo magnético entre todos os pares
      const alive = aliveFighters(state);
      const share = 1 / Math.max(1, alive.length - 1);
      for (let i = 0; i < alive.length; i += 1) {
        for (let j = i + 1; j < alive.length; j += 1) {
          const a = alive[i];
          const b = alive[j];
          const d = Math.max(70, dist(a.x, a.y, b.x, b.y));
          const n = normalize(b.x - a.x, b.y - a.y);
          const same = (state.pole[a.id] ?? 1) === (state.pole[b.id] ?? 1);
          // perto o campo é forte, longe ele some
          const strength = FIELD * share * clamp(240 / d, 0.15, 1.6) * (same ? -1 : 1);
          a.vx += n.x * strength * dt;
          a.vy += n.y * strength * dt;
          b.vx -= n.x * strength * dt;
          b.vy -= n.y * strength * dt;
        }
      }
    }

    resolveFighterCollisions(state.fighters, CFG, state.events, { knockScale: 0.8 });

    if (!playing) return;

    state.timer -= dt;
    if (state.timer <= WARN_TIME && Object.keys(state.next).length === 0) {
      state.next = rollPoles(state);
      state.events.push({ k: 'beam-warn', v: 1 });
    }
    if (state.timer <= 0) {
      state.pole = state.next;
      state.next = {};
      state.timer = FLIP_EVERY;
      state.events.push({ k: 'call', v: 1 });
      for (const f of state.fighters) f.squash = 0.4;
    }

    state.radius =
      RADIUS_START -
      (RADIUS_START - RADIUS_MIN) * clamp01((state.elapsed - SHRINK_AT) / SHRINK_DURATION);

    for (const f of state.fighters) {
      if (!f.alive) continue;
      if (isOutsideCircle(f, CENTER.x, CENTER.y, state.radius)) eliminate(state, f, { v: 1 });
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
      'ima',
      (f) => `${f.survived.toFixed(1)}s no campo`,
      (f) => (f.place === 1 ? 'nunca colou na borda' : null),
    );
  },

  snapshot(state, seq, now): Snapshot {
    const warning = Object.keys(state.next).length > 0;
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          item(CENTER.x, CENTER.y, state.radius, 0, {
            v: round2(clamp01((RADIUS_START - state.radius) / (RADIUS_START - RADIUS_MIN))),
          }),
        ],
        n: [
          warning ? round2(1 - state.timer / WARN_TIME) : 0,
          ...state.fighters.map((f) => state.pole[f.id] ?? 1),
        ],
        s: warning ? 'TROCA DE POLARIDADE!' : undefined,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.28, rng.next);
    const margin = state.radius - dist(f.x, f.y, CENTER.x, CENTER.y);
    const toCenter = normalize(CENTER.x - f.x, CENTER.y - f.y);

    // perto da borda nada mais importa
    if (margin < 110) {
      return {
        mx: toCenter.x,
        my: toCenter.y,
        dash:
          margin < 60 && margin > 0 && f.dashCooldown <= 0 && rng.chance(dt * 9)
            ? requestBotDash(f)
            : f.dashSeen,
      };
    }

    // usa o campo: encosta em quem está sendo empurrado para fora
    let victim: { x: number; y: number; d: number } | null = null;
    for (const other of state.fighters) {
      if (other === f || !other.alive) continue;
      const otherMargin = state.radius - dist(other.x, other.y, CENTER.x, CENTER.y);
      if (otherMargin > margin) continue;
      const d = dist(f.x, f.y, other.x, other.y);
      if (!victim || d < victim.d) victim = { x: other.x, y: other.y, d };
    }

    if (victim && victim.d < 240 && rng.chance(0.7)) {
      const dir = normalize(victim.x - f.x, victim.y - f.y);
      // só dá dash se o ponto de chegada continuar na plataforma
      const landing = dist(f.x + dir.x * 190, f.y + dir.y * 190, CENTER.x, CENTER.y);
      const safe = landing < state.radius - 40;
      return {
        mx: dir.x,
        my: dir.y,
        dash:
          safe && victim.d < 150 && f.dashCooldown <= 0 && rng.chance(0.6)
            ? requestBotDash(f)
            : f.dashSeen,
      };
    }

    const dir = normalize(toCenter.x + f.ai.jitterX * 0.004, toCenter.y + f.ai.jitterY * 0.004);
    return { mx: dir.x * 0.7, my: dir.y * 0.7, dash: f.dashSeen };
  },
};
