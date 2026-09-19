import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  createBaseState,
  createFighter,
  nearestOther,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { clamp01, dist, normalize, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA, ARENA_CENTER, buildResults, closeByScore, pointsLabel, stepBodies } from './kit';

/**
 * BOLHA!
 *
 * Sua bolha enche enquanto você fica PARADO. Cheia, ela estoura e vale ponto.
 * Só que bolha grande deixa você lento, e qualquer pessoa que te encostar fura a
 * sua bolha e leva metade do ar para a dela.
 *
 * Todo o jogo é essa conta: mais um segundo parado ou sai correndo agora.
 */

const TIME_LIMIT = 70;
/** Segundos parado para encher a bolha do zero. */
const INFLATE_TIME = 3.8;
/** Perda por segundo em movimento (dá para desviar sem perder tudo). */
const DEFLATE = 0.24;
/** Acima dessa velocidade a bolha para de encher. */
const STILL_SPEED = 76;
/** Bolha menor que isso não vale roubo nem estouro. */
const MIN_POP = 0.16;
const POP_GRACE = 0.7;

export interface BolhaState extends BaseMatchState {
  /** 0..1 de cada bolha */
  fill: Record<string, number>;
  /** carência depois de estourar/ser furado */
  grace: Record<string, number>;
  popped: Record<string, number>;
  lost: Record<string, number>;
  rng: Rng;
}

/** Raio visual/alcance da bolha. */
export function bolhaRadius(fill: number): number {
  return 28 + fill * 46;
}

export const bolhaGame: GameModule<BolhaState> = {
  id: 'bolha',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): BolhaState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 190);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    return {
      ...createBaseState('bolha', ctx, fighters),
      fill: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      grace: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      popped: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      lost: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    // bolha cheia pesa: quem está carregando ar anda menos
    stepBodies(state, dt, inputs, playing, {
      knockScale: 1.05,
      speedScale: (f) => 1 - (state.fill[f.id] ?? 0) * 0.32,
    });
    if (!playing) return;

    for (const f of state.fighters) {
      if (!f.alive) continue;
      state.grace[f.id] = Math.max(0, (state.grace[f.id] ?? 0) - dt);

      const speed = Math.hypot(f.vx, f.vy);
      const current = state.fill[f.id] ?? 0;
      if (speed < STILL_SPEED && f.stunTimer <= 0) {
        state.fill[f.id] = clamp01(current + dt / INFLATE_TIME);
      } else {
        state.fill[f.id] = clamp01(current - dt * DEFLATE);
      }

      // encheu: estoura sozinha e vale ponto
      if ((state.fill[f.id] ?? 0) >= 1) {
        state.fill[f.id] = 0;
        state.grace[f.id] = POP_GRACE;
        f.score += 1;
        state.popped[f.id] = (state.popped[f.id] ?? 0) + 1;
        f.squash = 0.7;
        state.events.push({ k: 'score', id: f.id, x: f.x, y: f.y, v: 1, i: 1 });
      }
    }

    // furar a bolha do outro: leva metade do ar
    for (const thief of state.fighters) {
      if (!thief.alive || (state.grace[thief.id] ?? 0) > 0) continue;
      for (const victim of state.fighters) {
        if (victim === thief || !victim.alive) continue;
        const air = state.fill[victim.id] ?? 0;
        if (air < MIN_POP) continue;
        const reach = bolhaRadius(air) + thief.radius * 0.6;
        if (dist(thief.x, thief.y, victim.x, victim.y) > reach) continue;

        state.fill[victim.id] = 0;
        state.fill[thief.id] = clamp01((state.fill[thief.id] ?? 0) + air * 0.5);
        state.grace[victim.id] = POP_GRACE;
        state.grace[thief.id] = POP_GRACE * 0.6;
        state.lost[victim.id] = (state.lost[victim.id] ?? 0) + 1;
        victim.squash = -0.8;
        victim.hitFlash = 1;
        victim.stunTimer = Math.max(victim.stunTimer, 0.18);
        const away = normalize(victim.x - thief.x, victim.y - thief.y);
        victim.vx += away.x * 420;
        victim.vy += away.y * 420;
        state.events.push({
          k: 'bomb-explode',
          id: thief.id,
          id2: victim.id,
          x: victim.x,
          y: victim.y,
          v: air,
        });
        break;
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
      'bolha',
      (f) => pointsLabel(f, 'bolha'),
      (f) => {
        const lost = state.lost[f.id] ?? 0;
        return lost > 0 ? `${lost} bolha${lost === 1 ? '' : 's'} furada${lost === 1 ? '' : 's'}` : 'nunca foi furado';
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        // enchimento de cada bolha, na ordem do snapshot
        n: state.fighters.map((f) => round2(state.fill[f.id] ?? 0)),
        ids: state.fighters.filter((f) => (state.fill[f.id] ?? 0) > 0.7).map((f) => f.id),
        s: undefined,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.4, rng.next);
    const myFill = state.fill[f.id] ?? 0;

    // alguém com bolha gorda por perto vale mais que ficar parado
    const target = nearestOther(state.fighters, f, (p) => (state.fill[p.id] ?? 0) > myFill + 0.2);
    if (target && (state.grace[f.id] ?? 0) <= 0) {
      const d = dist(f.x, f.y, target.x, target.y);
      if (d < 300) {
        const dir = normalize(target.x + target.vx * 0.2 - f.x, target.y + target.vy * 0.2 - f.y);
        return {
          mx: dir.x,
          my: dir.y,
          dash: d < 190 && f.dashCooldown <= 0 && rng.chance(0.8) ? requestBotDash(f) : f.dashSeen,
        };
      }
    }

    // ameaça perto e bolha valiosa: sai de perto
    const threat = nearestOther(state.fighters, f);
    const threatD = threat ? dist(f.x, f.y, threat.x, threat.y) : Infinity;
    if (myFill > 0.35 && threatD < 210 && threat) {
      const away = normalize(f.x - threat.x, f.y - threat.y);
      const toCenter = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
      const dir = normalize(away.x + toCenter.x * 0.35, away.y + toCenter.y * 0.35);
      return {
        mx: dir.x,
        my: dir.y,
        dash: threatD < 120 && f.dashCooldown <= 0 && rng.chance(dt * 6) ? requestBotDash(f) : f.dashSeen,
      };
    }

    /**
     * Senão: canto próprio e ficar quieto.
     *
     * O canto vem do slot, não do jitter — com canto sorteado a cada pensamento o
     * bot ficava indo e voltando e a bolha nunca enchia (partida inteira com zero
     * bolha estourada).
     */
    const corner = {
      x: f.slot % 2 === 0 ? ARENA.x + 150 : ARENA.x + ARENA.w - 150,
      y: f.slot % 4 < 2 ? ARENA.y + 130 : ARENA.y + ARENA.h - 130,
    };
    const d = dist(f.x, f.y, corner.x, corner.y);
    if (d < 90) return { mx: 0, my: 0, dash: f.dashSeen };
    const dir = normalize(corner.x - f.x, corner.y - f.y);
    return { mx: dir.x, my: dir.y, dash: f.dashSeen };
  },
};
