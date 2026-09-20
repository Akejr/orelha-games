import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  containInCircle,
  createBaseState,
  createFighter,
  hurt,
  moveConfig,
  nearestOther,
  requestBotDash,
  resolveFighterCollisions,
  ringSpawns,
  stepDead,
  stepFighter,
} from '../engine';
import { clamp, clamp01, dist, normalize, round1, round2 } from '../math';
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
import { emptyInput, WORLD } from '../types';

/**
 * BOMB!
 *
 * Batata quente com duas regras que mudam tudo:
 *   1. o pavio NÃO reseta ao passar — ele encurta 10% a cada passe, então uma
 *      troca frenética entre dois jogadores acaba explodindo na mão de alguém;
 *   2. com 4 ou 5 jogadores vivos existem DUAS bombas ao mesmo tempo, o que
 *      acaba com a tática de ficar parado longe do portador.
 */

interface Bomb {
  holder: string | null;
  fuse: number;
  fuseMax: number;
  lastGiver: string | null;
  passLock: number;
  nextTick: number;
  respawn: number;
}

export interface BombState extends BaseMatchState {
  cx: number;
  cy: number;
  radius: number;
  radiusStart: number;
  radiusMin: number;
  bombs: Bomb[];
  passes: Record<string, number>;
  eliminations: number;
  rng: Rng;
  shrinkBeat: number;
}

const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };
const RADIUS_START = 300;
const RADIUS_MIN = 178;
const TIME_LIMIT = 110;
/** Quanto o pavio encurta a cada passe. */
const PASS_HEAT = 0.94;
/**
 * Duas vidas: explodir uma vez não te tira da partida. Foi o que transformou a
 * rodada de 8 segundos (uma explosão = um eliminado) em uma disputa de verdade,
 * e ainda deixa o jogo mais gostoso — errar não é game over.
 */
const LIVES = 2;

const CFG = moveConfig({
  accel: 5400,
  maxSpeed: 440,
  friction: 0.858,
  radius: 26,
  dashSpeed: 1180,
  dashTime: 0.19,
  dashCooldown: 0.55,
  knockback: 620,
  bounce: 0.5,
});

function desiredBombs(alive: number): number {
  return alive >= 4 ? 2 : 1;
}

function rollFuse(state: BombState): number {
  const base = clamp(11 - state.eliminations * 1.1, 5.2, 12);
  return base + state.rng.range(-0.9, 1.1);
}

function newBomb(state: BombState, delay: number): Bomb {
  const fuseMax = rollFuse(state);
  return {
    holder: null,
    fuse: fuseMax,
    fuseMax,
    lastGiver: null,
    passLock: 0,
    nextTick: 0,
    respawn: delay,
  };
}

function holdsBomb(state: BombState, id: string): boolean {
  return state.bombs.some((bomb) => bomb.holder === id);
}

function assign(state: BombState, bomb: Bomb, f: Fighter, giver: Fighter | null): void {
  bomb.holder = f.id;
  bomb.lastGiver = giver?.id ?? null;
  bomb.passLock = 0.4;
  f.squash = 0.6;
  if (giver) {
    // passar esquenta o pavio: a batata fica mais quente a cada troca
    bomb.fuse = Math.max(0.5, bomb.fuse * PASS_HEAT);
    state.passes[giver.id] = (state.passes[giver.id] ?? 0) + 1;
    state.events.push({ k: 'bomb-pass', id: f.id, id2: giver.id, x: f.x, y: f.y });
  }
}

export const bombGame: GameModule<BombState> = {
  id: 'bomb',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): BombState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, CENTER.x, CENTER.y, 190);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = LIVES;
    const base = createBaseState('bomb', ctx, fighters);
    const state: BombState = {
      ...base,
      cx: CENTER.x,
      cy: CENTER.y,
      radius: RADIUS_START,
      radiusStart: RADIUS_START,
      radiusMin: RADIUS_MIN,
      bombs: [],
      passes: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      eliminations: 0,
      rng,
      shrinkBeat: RADIUS_START,
    };

    const count = desiredBombs(fighters.length);
    const order = rng.shuffle(fighters.slice());
    for (let i = 0; i < count; i += 1) {
      const bomb = newBomb(state, 0);
      assign(state, bomb, order[i], null);
      bomb.passLock = 0.3;
      state.bombs.push(bomb);
    }
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);

    if (playing && state.eliminations > 0) {
      const t = clamp01((state.elapsed - 14) / 62);
      state.radius = state.radiusStart - (state.radiusStart - state.radiusMin) * t;
      if (state.shrinkBeat - state.radius > 28) {
        state.shrinkBeat = state.radius;
        state.events.push({ k: 'shrink', v: 0.6 });
      }
    }

    const speedRamp = playing ? 1 + clamp01(state.elapsed / 90) * 0.08 : 1;

    for (const f of state.fighters) {
      if (!f.alive) {
        stepDead(f, dt);
        continue;
      }
      const carrying = holdsBomb(state, f.id);
      const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
      stepFighter(f, input, CFG, dt, state.events, {
        speedScale: (carrying ? 1.08 : 1) * speedRamp,
      });
      containInCircle(f, state.cx, state.cy, state.radius, 0.34);
      if (playing) f.survived = state.elapsed;
    }

    resolveFighterCollisions(state.fighters, CFG, state.events, { knockScale: 0.85 });

    if (!playing) return;

    const alive = aliveFighters(state);

    for (const bomb of state.bombs) {
      bomb.passLock = Math.max(0, bomb.passLock - dt);

      // aguardando dono depois de uma explosão
      if (!bomb.holder) {
        bomb.respawn = Math.max(0, bomb.respawn - dt);
        if (bomb.respawn > 0 || alive.length <= 1) continue;
        // quem acabou de explodir tem alguns segundos de paz
        const free = alive.filter((f) => !holdsBomb(state, f.id) && f.invuln <= 0);
        const pool = free.length > 0 ? free : alive.filter((f) => !holdsBomb(state, f.id));
        if (pool.length === 0) continue;
        bomb.fuseMax = rollFuse(state);
        bomb.fuse = bomb.fuseMax;
        bomb.nextTick = 0;
        assign(state, bomb, pool[state.rng.int(0, pool.length - 1)], null);
        continue;
      }

      const holder = state.fighters.find((f) => f.id === bomb.holder);
      if (!holder || !holder.alive) {
        bomb.holder = null;
        bomb.respawn = 0.8;
        continue;
      }

      bomb.fuse = Math.max(0, bomb.fuse - dt);

      // tique acelerando conforme queima
      const ratio = bomb.fuse / Math.max(0.001, bomb.fuseMax);
      bomb.nextTick -= dt;
      if (bomb.nextTick <= 0) {
        bomb.nextTick = 0.16 + ratio * 0.5;
        state.events.push({ k: 'bomb-tick', id: holder.id, v: 1 - ratio });
      }

      // passe por toque — quem já segura uma bomba não recebe a segunda
      if (bomb.passLock <= 0) {
        for (const other of state.fighters) {
          if (!other.alive || other.id === holder.id) continue;
          if (holdsBomb(state, other.id) || other.invuln > 0) continue;
          if (dist(other.x, other.y, holder.x, holder.y) < other.radius + holder.radius + 6) {
            assign(state, bomb, other, holder);
            break;
          }
        }
      }

      if (bomb.fuse <= 0) {
        state.events.push({ k: 'bomb-explode', id: holder.id, x: holder.x, y: holder.y, v: 1 });
        for (const other of state.fighters) {
          if (!other.alive || other.id === holder.id) continue;
          const d = dist(other.x, other.y, holder.x, holder.y);
          if (d < 200) {
            const n = normalize(other.x - holder.x, other.y - holder.y);
            const force = (1 - d / 200) * 620;
            other.vx += n.x * force;
            other.vy += n.y * force;
            other.hitFlash = 1;
            other.squash = -0.6;
          }
        }
        hurt(state, holder, { invuln: 1.8, kind: 'life-lost' });
        state.eliminations += 1;
        bomb.holder = null;
        bomb.respawn = 1.05;
      }
    }

    // ajusta a quantidade de bombas conforme a sala vai esvaziando
    const survivors = aliveFighters(state);
    const target = desiredBombs(survivors.length);
    if (state.bombs.length > target) {
      const idle = state.bombs.findIndex((bomb) => !bomb.holder);
      if (idle >= 0) state.bombs.splice(idle, 1);
    } else if (state.bombs.length < target && survivors.length > 1) {
      state.bombs.push(newBomb(state, 1.2));
    }

    for (const f of survivors) f.score = f.survived;
    if (survivors.length <= 1 || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.survived - a.survived);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    const rows = state.fighters
      .slice()
      .sort((a, b) => (a.place || 99) - (b.place || 99))
      .map((f) => {
        const passes = state.passes[f.id] ?? 0;
        return {
          playerId: f.id,
          place: f.place || 99,
          score: round1(f.survived),
          scoreLabel:
            f.lives > 0
              ? `${round1(f.survived).toFixed(1)}s e ${f.lives} ${f.lives === 1 ? 'vida' : 'vidas'}`
              : `${round1(f.survived).toFixed(1)}s na partida`,
          highlight: passes > 0 ? `${passes} ${passes === 1 ? 'passe' : 'passes'}` : null,
        };
      });
    const winner = rows.find((r) => r.place === 1);
    return {
      gameId: 'bomb',
      rows,
      winnerId: winner?.playerId ?? null,
      duration: round1(state.elapsed),
      round: state.round,
    };
  },

  snapshot(state, seq, now): Snapshot {
    const remaining = Math.max(0, TIME_LIMIT - state.elapsed);
    return {
      ...baseSnapshotFields(state, seq, now, remaining),
      bomb: {
        bombs: state.bombs.map((bomb) => ({
          h: bomb.holder,
          fz: round2(clamp01(bomb.fuse / Math.max(0.001, bomb.fuseMax))),
          cd: round2(bomb.passLock),
        })),
        r: round1(state.radius),
        alive: aliveFighters(state).length,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const beat = aiThink(f, dt, 0.36, rng.next);
    let dash = f.dashSeen;
    let tx: number;
    let ty: number;

    const myBomb = state.bombs.find((bomb) => bomb.holder === f.id) ?? null;

    if (myBomb) {
      // procura alguém sem bomba para passar
      const prey = nearestOther(state.fighters, f, (p) => {
        if (holdsBomb(state, p.id) || p.invuln > 0) return false;
        if (myBomb.passLock > 0 && p.id === myBomb.lastGiver) return false;
        return true;
      });
      if (prey) {
        tx = prey.x + prey.vx * 0.2 + f.ai.jitterX * 0.18;
        ty = prey.y + prey.vy * 0.2 + f.ai.jitterY * 0.18;
        const d = dist(f.x, f.y, prey.x, prey.y);
        const desperate = myBomb.fuse < 1.8;
        if (
          (beat || desperate) &&
          f.dashCooldown <= 0 &&
          d < (desperate ? 300 : 200) &&
          rng.chance(desperate ? 0.1 : 0.5)
        ) {
          dash = requestBotDash(f);
        }
      } else {
        tx = state.cx;
        ty = state.cy;
      }
    } else {
      // foge da bomba mais próxima, tangenciando para não prender na borda
      let threat: Fighter | null = null;
      let threatD = Infinity;
      for (const bomb of state.bombs) {
        if (!bomb.holder) continue;
        const carrier = state.fighters.find((p) => p.id === bomb.holder);
        if (!carrier || !carrier.alive) continue;
        const d = dist(f.x, f.y, carrier.x, carrier.y);
        if (d < threatD) {
          threatD = d;
          threat = carrier;
        }
      }
      if (threat) {
        const away = normalize(f.x - threat.x, f.y - threat.y);
        const radial = normalize(f.x - state.cx, f.y - state.cy);
        const edge = clamp01(dist(f.x, f.y, state.cx, state.cy) / state.radius);
        const side = f.ai.jitterX >= 0 ? 1 : -1;
        const tangent = { x: -radial.y, y: radial.x };
        tx = f.x + (away.x * (1 - edge * 0.75) + tangent.x * side * edge * 1.25) * 300;
        ty = f.y + (away.y * (1 - edge * 0.75) + tangent.y * side * edge * 1.25) * 300;
        if (beat && threatD < 170 && f.dashCooldown <= 0 && rng.chance(0.6)) {
          dash = requestBotDash(f);
        }
      } else {
        tx = state.cx + f.ai.jitterX;
        ty = state.cy + f.ai.jitterY;
      }
    }

    const dir = normalize(tx - f.x, ty - f.y);
    return { mx: dir.x, my: dir.y, dash };
  },
};
