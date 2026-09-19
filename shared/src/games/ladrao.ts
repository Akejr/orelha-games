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
import { clamp, dist, normalize, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA, ARENA_CENTER, buildResults, closeByScore, freeSpot, item, pointsLabel, stepBodies } from './kit';

/**
 * LADRÃO!
 *
 * Moedas aparecem no chão, mas elas não valem ponto enquanto estão na sua mão:
 * é preciso depositar no cofre. E quem te encostar rouba tudo o que você está
 * carregando. O jogo vive dessa decisão — voltar para o cofre agora ou arriscar
 * mais uma moeda.
 *
 * Códigos do snapshot: k=0 moeda, k=1 cofre.
 */

const TIME_LIMIT = 80;
const COIN_VALUE = 1;
const MAX_COINS = 7;
const SPAWN_EVERY = 1.1;
const BANK_RADIUS = 74;
const BANK_MOVE_EVERY = 14;
const STEAL_GRACE = 1.1;

export interface LadraoState extends BaseMatchState {
  coins: { x: number; y: number }[];
  spawnTimer: number;
  bank: { x: number; y: number };
  bankTimer: number;
  /** moedas na mão (perde tudo se for pego) */
  bag: Record<string, number>;
  /** carência após roubar/ser roubado */
  grace: Record<string, number>;
  steals: Record<string, number>;
  lost: Record<string, number>;
  rng: Rng;
}

export const ladraoGame: GameModule<LadraoState> = {
  id: 'ladrao',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): LadraoState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 180);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const state: LadraoState = {
      ...createBaseState('ladrao', ctx, fighters),
      coins: [],
      spawnTimer: 0,
      bank: { x: ARENA_CENTER.x, y: ARENA.y + 96 },
      bankTimer: BANK_MOVE_EVERY,
      bag: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      grace: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      steals: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      lost: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
    for (let i = 0; i < 5; i += 1) {
      state.coins.push(freeSpot(rng, fighters, 80, 130));
    }
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 0.9 });
    if (!playing) return;

    for (const f of state.fighters) {
      state.grace[f.id] = Math.max(0, (state.grace[f.id] ?? 0) - dt);
    }

    // moedas novas
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.coins.length < MAX_COINS) {
      state.spawnTimer = SPAWN_EVERY;
      state.coins.push(freeSpot(state.rng, state.fighters, 80, 90));
    }

    // o cofre muda de canto de vez em quando
    state.bankTimer -= dt;
    if (state.bankTimer <= 0) {
      state.bankTimer = BANK_MOVE_EVERY;
      state.bank = freeSpot(state.rng, state.fighters, 120, 200);
      state.events.push({ k: 'zone-move', x: state.bank.x, y: state.bank.y, v: 0.6 });
    }

    for (const f of state.fighters) {
      if (!f.alive) continue;

      // catar moeda
      for (let i = state.coins.length - 1; i >= 0; i -= 1) {
        const coin = state.coins[i];
        if (dist(f.x, f.y, coin.x, coin.y) > f.radius + 20) continue;
        state.coins.splice(i, 1);
        state.bag[f.id] = (state.bag[f.id] ?? 0) + COIN_VALUE;
        state.events.push({ k: 'pickup', id: f.id, x: coin.x, y: coin.y, v: 0.3, i: COIN_VALUE });
      }

      // depositar
      const carried = state.bag[f.id] ?? 0;
      if (carried > 0 && dist(f.x, f.y, state.bank.x, state.bank.y) < BANK_RADIUS) {
        state.bag[f.id] = 0;
        f.score += carried;
        state.events.push({ k: 'score', id: f.id, x: f.x, y: f.y, v: 1, i: carried });
      }
    }

    // roubo por toque: leva o saco inteiro
    for (const thief of state.fighters) {
      if (!thief.alive || (state.grace[thief.id] ?? 0) > 0) continue;
      for (const victim of state.fighters) {
        if (victim === thief || !victim.alive) continue;
        const carried = state.bag[victim.id] ?? 0;
        if (carried <= 0) continue;
        if (dist(thief.x, thief.y, victim.x, victim.y) > thief.radius + victim.radius + 4) continue;

        state.bag[victim.id] = 0;
        state.bag[thief.id] = (state.bag[thief.id] ?? 0) + carried;
        state.grace[thief.id] = STEAL_GRACE;
        state.grace[victim.id] = STEAL_GRACE;
        state.steals[thief.id] = (state.steals[thief.id] ?? 0) + carried;
        state.lost[victim.id] = (state.lost[victim.id] ?? 0) + carried;
        victim.squash = -0.7;
        victim.hitFlash = 1;
        state.events.push({
          k: 'crown-steal',
          id: thief.id,
          id2: victim.id,
          x: victim.x,
          y: victim.y,
          i: carried,
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
      'ladrao',
      (f) => pointsLabel(f, 'moeda'),
      (f) => {
        const stolen = state.steals[f.id] ?? 0;
        const lost = state.lost[f.id] ?? 0;
        if (stolen > 0) return `roubou ${stolen}`;
        return lost > 0 ? `perdeu ${lost} no assalto` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          item(state.bank.x, state.bank.y, BANK_RADIUS, 1, {
            v: round2(clamp(state.bankTimer / BANK_MOVE_EVERY, 0, 1)),
          }),
          ...state.coins.map((coin) => item(coin.x, coin.y, 20, 0)),
        ],
        // saco de cada jogador, na ordem do snapshot
        n: state.fighters.map((f) => state.bag[f.id] ?? 0),
        ids: state.fighters.filter((f) => (state.bag[f.id] ?? 0) > 0).map((f) => f.id),
        s: undefined,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const beat = aiThink(f, dt, 0.4, rng.next);
    const carried = state.bag[f.id] ?? 0;
    const bankDist = dist(f.x, f.y, state.bank.x, state.bank.y);

    // alguém por perto com saco cheio? vale mais que qualquer moeda
    const victim = nearestOther(state.fighters, f, (p) => (state.bag[p.id] ?? 0) > carried);
    if (victim && (state.grace[f.id] ?? 0) <= 0) {
      const d = dist(f.x, f.y, victim.x, victim.y);
      if (d < 260) {
        const dir = normalize(victim.x + victim.vx * 0.2 - f.x, victim.y + victim.vy * 0.2 - f.y);
        return {
          mx: dir.x,
          my: dir.y,
          dash: beat && d < 170 && f.dashCooldown <= 0 && rng.chance(0.75) ? requestBotDash(f) : f.dashSeen,
        };
      }
    }

    // saco cheio ou ameaça perto: corre para o cofre
    const threat = nearestOther(state.fighters, f);
    const threatD = threat ? dist(f.x, f.y, threat.x, threat.y) : Infinity;
    const shouldBank = carried >= 3 || (carried > 0 && threatD < 200) || (carried > 0 && bankDist < 160);
    if (shouldBank) {
      const dir = normalize(state.bank.x - f.x, state.bank.y - f.y);
      return {
        mx: dir.x,
        my: dir.y,
        dash: bankDist > 200 && f.dashCooldown <= 0 && rng.chance(dt * 3) ? requestBotDash(f) : f.dashSeen,
      };
    }

    // senão, cata a moeda mais próxima
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const coin of state.coins) {
      const d = dist(f.x, f.y, coin.x, coin.y);
      if (d < bestD) {
        bestD = d;
        best = coin;
      }
    }
    if (!best) {
      const dir = normalize(state.bank.x - f.x, state.bank.y - f.y);
      return { mx: dir.x, my: dir.y, dash: f.dashSeen };
    }
    const dir = normalize(best.x - f.x, best.y - f.y);
    return {
      mx: dir.x,
      my: dir.y,
      dash: bestD > 230 && f.dashCooldown <= 0 && rng.chance(dt * 2) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
