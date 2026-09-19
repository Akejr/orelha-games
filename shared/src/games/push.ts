import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  containInCircle,
  createBaseState,
  createFighter,
  eliminate,
  isOutsideCircle,
  moveConfig,
  nearestOther,
  requestBotDash,
  resolveFighterCollisions,
  ringSpawns,
  stepDead,
  stepFighter,
} from '../engine';
import { clamp, clamp01, dist, len, normalize, round1, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  Fighter,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  PushModifier,
  Snapshot,
} from '../types';
import { emptyInput, WORLD } from '../types';

/**
 * PUSH!
 * Arena flutuante que encolhe. Dash empurra, borda elimina. Cada rodada sorteia
 * modificadores para que duas partidas nunca sejam iguais.
 */

interface Polar {
  a: number;
  d: number;
  r: number;
  x: number;
  y: number;
}

interface MovingWall {
  a: number;
  d: number;
  w: number;
  h: number;
  speed: number;
  x: number;
  y: number;
  angle: number;
}

export interface PushState extends BaseMatchState {
  cx: number;
  cy: number;
  radius: number;
  radiusStart: number;
  radiusMin: number;
  spin: number;
  spinSpeed: number;
  mods: PushModifier[];
  holes: Polar[];
  springs: Polar[];
  walls: MovingWall[];
  fan: { a: number; p: number; on: boolean; timer: number } | null;
  hits: Record<string, number>;
  /** tempo de voo restante fora da plataforma (-1 = está no chão) */
  air: Record<string, number>;
  /** já gastou o dash de salvamento neste voo? */
  usedRecovery: Record<string, boolean>;
  /** contador de dash no instante em que saiu da plataforma */
  airDash: Record<string, number>;
  saves: Record<string, number>;
  rng: Rng;
  shrinkBeat: number;
}

const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };
const RADIUS_START = 292;
/**
 * Fim do primeiro estágio de encolhimento.
 *
 * Importante: o dash percorre ~200 u. Se a arena ficar menor que ~1,6x isso, o
 * dash vira suicídio e o jogo trava — foi exatamente o que aconteceu quando a
 * arena fechava até raio 76 e ninguém mais se atacava.
 */
const RADIUS_MIN = 208;
/** Morte súbita: aperta mais, sem inviabilizar o dash. */
const RADIUS_FLOOR = 164;
const SHRINK_DELAY = 5;
const SHRINK_DURATION = 42;
const SUDDEN_DEATH_AT = 48;
const SUDDEN_DEATH_DURATION = 34;
const TIME_LIMIT = 92;

/**
 * Recuperação aérea: sair da plataforma não é morte imediata. Você tem uma
 * fração de segundo no ar e UM dash de salvamento, que empurra de volta para o
 * centro. É o que transforma "fui empurrado, perdi" em "quase morri, voltei" —
 * e o que faz a rodada durar mais sem deixar o jogo lento.
 */
const AIR_TIME = 0.5;
const RECOVER_SPEED = 820;
/**
 * O salvamento tem alcance: se a trombada te jogou longe demais, não tem dash
 * que resolva. Sem esse limite os bots viravam imortais e a rodada batia no
 * tempo limite com duas eliminações.
 */
const RECOVER_RANGE = 48;

const MOD_POOL: PushModifier[][] = [
  ['holes'],
  ['springs'],
  ['ice'],
  ['spin'],
  ['fan'],
  ['ice', 'springs'],
  ['spin', 'holes'],
  ['fan', 'springs'],
  ['holes', 'springs'],
  ['walls'],
];

function baseConfig(state: PushState) {
  const icy = state.mods.includes('ice');
  return moveConfig({
    accel: icy ? 2900 : 4500,
    maxSpeed: icy ? 470 : 440,
    friction: icy ? 0.962 : 0.858,
    radius: 27,
    dashSpeed: icy ? 1220 : 1180,
    dashTime: 0.19,
    dashCooldown: 0.6,
    /**
     * No gelo o atrito é ~4x menor, então o MESMO impulso viaja 4x mais longe e
     * qualquer trombada virava ejeção instantânea. O knockback é reduzido para
     * manter a distância percorrida parecida entre os modificadores.
     */
    knockback: icy ? 320 : 760,
    bounce: 0.56,
  });
}

function polar(rng: Rng, minD: number, maxD: number, r: number): Polar {
  const a = rng.range(0, Math.PI * 2);
  const d = rng.range(minD, maxD);
  return { a, d, r, x: CENTER.x + Math.cos(a) * d, y: CENTER.y + Math.sin(a) * d };
}

/**
 * Sorteia uma posição longe de todos os spawns. Buraco ou mola nascendo embaixo
 * de um jogador dava rodada de 1 segundo — o tipo de bug que só aparece em
 * playtest automatizado com várias seeds.
 */
function clearPolar(
  rng: Rng,
  minD: number,
  maxD: number,
  radius: number,
  spawns: { x: number; y: number }[],
  gap = 74,
): Polar {
  let candidate = polar(rng, minD, maxD, radius);
  for (let tries = 0; tries < 30; tries += 1) {
    const clear = spawns.every(
      (spawn) => dist(spawn.x, spawn.y, candidate.x, candidate.y) > candidate.r + gap,
    );
    if (clear) break;
    candidate = polar(rng, minD, maxD, radius);
  }
  return candidate;
}

function updatePolar(p: Polar, spin: number): void {
  p.x = CENTER.x + Math.cos(p.a + spin) * p.d;
  p.y = CENTER.y + Math.sin(p.a + spin) * p.d;
}

export const pushGame: GameModule<PushState> = {
  id: 'push',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): PushState {
    const rng = createRng(ctx.seed);
    // nascer mais para dentro: com 168 uma trombada logo no início já ejetava
    const spawns = ringSpawns(ctx.players.length, CENTER.x, CENTER.y, 132);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 27),
    );
    const base = createBaseState('push', ctx, fighters);
    const mods = rng.pick(MOD_POOL).slice();

    const state: PushState = {
      ...base,
      cx: CENTER.x,
      cy: CENTER.y,
      radius: RADIUS_START,
      radiusStart: RADIUS_START,
      radiusMin: RADIUS_MIN,
      spin: 0,
      spinSpeed: mods.includes('spin') ? (rng.chance(0.5) ? 0.34 : -0.34) : 0,
      mods,
      holes: [],
      springs: [],
      walls: [],
      fan: mods.includes('fan')
        ? { a: rng.range(0, Math.PI * 2), p: 210, on: false, timer: 2.4 }
        : null,
      hits: {},
      air: {},
      usedRecovery: {},
      airDash: {},
      saves: {},
      rng,
      shrinkBeat: RADIUS_START,
    };

    if (mods.includes('holes')) {
      const count = ctx.players.length >= 4 ? 3 : 2;
      for (let i = 0; i < count; i += 1) {
        state.holes.push(clearPolar(rng, 70, RADIUS_MIN - 20, rng.range(30, 40), spawns));
      }
    }
    if (mods.includes('springs')) {
      for (let i = 0; i < 3; i += 1) {
        state.springs.push(clearPolar(rng, 90, RADIUS_START - 70, 30, spawns));
      }
    }
    if (mods.includes('walls')) {
      const count = 2;
      for (let i = 0; i < count; i += 1) {
        const a = rng.range(0, Math.PI * 2);
        state.walls.push({
          a,
          d: rng.range(70, 150),
          w: 150,
          h: 26,
          speed: rng.sign() * rng.range(0.5, 0.8),
          x: CENTER.x,
          y: CENTER.y,
          angle: a,
        });
      }
    }

    for (const f of fighters) {
      state.hits[f.id] = 0;
      state.saves[f.id] = 0;
      state.air[f.id] = -1;
      state.usedRecovery[f.id] = false;
    }
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    const cfg = baseConfig(state);

    if (playing) {
      // arena encolhendo: estágio 1 (suave) e depois morte súbita
      const shrinkT = clamp01((state.elapsed - SHRINK_DELAY) / SHRINK_DURATION);
      const eased = shrinkT * shrinkT * (3 - 2 * shrinkT);
      state.radius = state.radiusStart - (state.radiusStart - state.radiusMin) * eased;
      if (state.elapsed > SUDDEN_DEATH_AT) {
        const sudden = clamp01((state.elapsed - SUDDEN_DEATH_AT) / SUDDEN_DEATH_DURATION);
        state.radius = state.radiusMin - (state.radiusMin - RADIUS_FLOOR) * sudden;
      }
      if (state.shrinkBeat - state.radius > 26) {
        state.shrinkBeat = state.radius;
        state.events.push({ k: 'shrink', v: 1 - shrinkT });
      }

      state.spin += state.spinSpeed * dt;
      for (const h of state.holes) updatePolar(h, state.spin);
      for (const s of state.springs) updatePolar(s, state.spin);
      for (const w of state.walls) {
        w.a += w.speed * dt;
        w.x = state.cx + Math.cos(w.a) * w.d;
        w.y = state.cy + Math.sin(w.a) * w.d;
        w.angle = w.a + Math.PI / 2;
      }

      if (state.fan) {
        state.fan.timer -= dt;
        if (state.fan.timer <= 0) {
          state.fan.on = !state.fan.on;
          state.fan.timer = state.fan.on ? 2.6 : 2.2;
          if (state.fan.on) {
            state.fan.a = state.rng.range(0, Math.PI * 2);
            state.events.push({ k: 'shrink', v: 0.4 });
          }
        }
      }
    }

    for (const f of state.fighters) {
      if (!f.alive) {
        stepDead(f, dt);
        continue;
      }
      if (playing) f.survived = state.elapsed;
      const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
      stepFighter(f, input, cfg, dt, state.events);

      if (!playing) continue;

      // ventilador
      if (state.fan?.on) {
        f.vx += Math.cos(state.fan.a) * state.fan.p * dt;
        f.vy += Math.sin(state.fan.a) * state.fan.p * dt;
      }

      // plataforma girando arrasta os jogadores
      if (state.spinSpeed !== 0) {
        const dx = f.x - state.cx;
        const dy = f.y - state.cy;
        const targetVx = -dy * state.spinSpeed;
        const targetVy = dx * state.spinSpeed;
        f.vx += (targetVx - f.vx) * Math.min(1, dt * 1.6);
        f.vy += (targetVy - f.vy) * Math.min(1, dt * 1.6);
      }

      // molas
      for (const s of state.springs) {
        const d = dist(f.x, f.y, s.x, s.y);
        const min = s.r + f.radius;
        if (d < min && d > 1e-4) {
          const n = normalize(f.x - s.x, f.y - s.y);
          f.x = s.x + n.x * min;
          f.y = s.y + n.y * min;
          const speed = Math.max(360, len(f.vx, f.vy) * 1.25);
          f.vx = n.x * speed;
          f.vy = n.y * speed;
          f.squash = 0.6;
          state.events.push({ k: 'hit', x: s.x, y: s.y, v: 0.55 });
        }
      }

      // paredes móveis
      for (const w of state.walls) {
        const cos = Math.cos(-w.angle);
        const sin = Math.sin(-w.angle);
        const rx = (f.x - w.x) * cos - (f.y - w.y) * sin;
        const ry = (f.x - w.x) * sin + (f.y - w.y) * cos;
        const hw = w.w / 2 + f.radius;
        const hh = w.h / 2 + f.radius;
        if (Math.abs(rx) < hw && Math.abs(ry) < hh) {
          const pushX = hw - Math.abs(rx);
          const pushY = hh - Math.abs(ry);
          let lx = 0;
          let ly = 0;
          if (pushX < pushY) lx = Math.sign(rx) * pushX;
          else ly = Math.sign(ry) * pushY;
          const wx = lx * Math.cos(w.angle) - ly * Math.sin(w.angle);
          const wy = lx * Math.sin(w.angle) + ly * Math.cos(w.angle);
          f.x += wx;
          f.y += wy;
          const n = normalize(wx, wy);
          const radial = f.vx * n.x + f.vy * n.y;
          if (radial < 0) {
            f.vx -= n.x * radial * 1.7;
            f.vy -= n.y * radial * 1.7;
          }
          f.vx += n.x * 120;
          f.vy += n.y * 120;
        }
      }
    }

    if (playing) {
      resolveFighterCollisions(state.fighters, cfg, state.events, {
        // a pancada acumula rápido: as primeiras trombadas empurram pouco, as
        // últimas arremessam — é o que cria a virada no fim da rodada
        staggerGrowth: 0.16,
        onHit: (attacker) => {
          state.hits[attacker.id] = (state.hits[attacker.id] ?? 0) + 1;
        },
      });

      for (const f of state.fighters) {
        if (!f.alive) continue;
        // buracos eliminam
        for (const h of state.holes) {
          if (dist(f.x, f.y, h.x, h.y) < h.r * 0.72) {
            eliminate(state, f, { v: 0.6 });
            break;
          }
        }
        if (!f.alive) continue;

        const outside = isOutsideCircle(f, state.cx, state.cy, state.radius);
        if (!outside) {
          state.air[f.id] = -1;
          state.usedRecovery[f.id] = false;
          continue;
        }

        // acabou de sair da plataforma: começa o tempo de voo
        if ((state.air[f.id] ?? -1) < 0) {
          state.air[f.id] = AIR_TIME;
          state.airDash[f.id] = f.dashSeen;
          state.usedRecovery[f.id] = false;
        }

        // dash de salvamento — precisa ter sido iniciado JÁ no ar, senão o
        // próprio dash ofensivo que te jogou fora te traria de volta de graça
        const reachable =
          dist(f.x, f.y, state.cx, state.cy) < state.radius + RECOVER_RANGE;
        if (
          !state.usedRecovery[f.id] &&
          reachable &&
          f.dashTimer > 0 &&
          f.dashSeen > (state.airDash[f.id] ?? f.dashSeen)
        ) {
          state.usedRecovery[f.id] = true;
          state.saves[f.id] = (state.saves[f.id] ?? 0) + 1;
          const back = normalize(state.cx - f.x, state.cy - f.y);
          f.vx = back.x * RECOVER_SPEED;
          f.vy = back.y * RECOVER_SPEED;
          f.squash = 0.8;
          state.events.push({ k: 'recover', id: f.id, x: f.x, y: f.y });
        }

        state.air[f.id] -= dt;
        if (state.air[f.id] <= 0) eliminate(state, f, { v: 1 });
      }

      const alive = aliveFighters(state);
      for (const f of alive) f.score = f.survived;
      if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
        // vários sobreviventes no tempo limite têm o MESMO tempo de vida, então
        // o desempate é quem empurrou mais e quem tomou menos pancada
        closeMatch(
          state,
          (a, b) =>
            b.survived - a.survived ||
            (state.hits[b.id] ?? 0) - (state.hits[a.id] ?? 0) ||
            a.stagger - b.stagger,
        );
      }
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
        const hits = state.hits[f.id] ?? 0;
        const saves = state.saves[f.id] ?? 0;
        const highlight =
          saves > 0
            ? `${saves} ${saves === 1 ? 'salvamento' : 'salvamentos'} no ar`
            : hits > 0
              ? `${hits} ${hits === 1 ? 'empurrão' : 'empurrões'}`
              : null;
        return {
          playerId: f.id,
          place: f.place || 99,
          score: round1(f.survived),
          scoreLabel: `${round1(f.survived).toFixed(1)}s de pé`,
          highlight,
        };
      });
    const winner = rows.find((r) => r.place === 1);
    return {
      gameId: 'push',
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
      push: {
        r: round1(state.radius),
        sp: round2(state.spin),
        mods: state.mods,
        holes: state.holes.map((h) => ({ x: round1(h.x), y: round1(h.y), r: round1(h.r) })),
        springs: state.springs.map((s) => ({ x: round1(s.x), y: round1(s.y), r: round1(s.r) })),
        fan: state.fan
          ? { a: round2(state.fan.a), p: state.fan.p, on: state.fan.on ? 1 : 0 }
          : null,
        walls: state.walls.map((w) => ({
          x: round1(w.x),
          y: round1(w.y),
          w: w.w,
          h: w.h,
          a: round2(w.angle),
        })),
        alive: aliveFighters(state).length,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    // decisões só acontecem no "beat" da IA — dashar a cada tick deixava o bot
    // sobre-humano e a partida acabava em segundos.
    const beat = aiThink(f, dt, 0.45, rng.next);

    const centerDist = dist(f.x, f.y, state.cx, state.cy);
    // margem em pixels até a borda (absoluta, não proporcional): numa arena
    // pequena o critério proporcional deixava o bot parado no centro sem atacar
    const margin = state.radius - centerDist;
    let tx = state.cx;
    let ty = state.cy;
    let dash = f.dashSeen;

    // está caindo: usa o dash de salvamento imediatamente (é agora ou nunca)
    if ((state.air[f.id] ?? -1) >= 0) {
      const back = normalize(state.cx - f.x, state.cy - f.y);
      return {
        mx: back.x,
        my: back.y,
        dash: !state.usedRecovery[f.id] && f.dashCooldown <= 0 ? requestBotDash(f) : f.dashSeen,
      };
    }

    const target = nearestOther(state.fighters, f);

    if (margin < 40) {
      // prioridade máxima: voltar para o miolo
      const n = normalize(state.cx - f.x, state.cy - f.y);
      tx = f.x + n.x * 200;
      ty = f.y + n.y * 200;
      if (margin < 18 && beat && f.dashCooldown <= 0 && rng.chance(0.5)) dash = requestBotDash(f);
    } else if (target) {
      tx = target.x + f.ai.jitterX * 0.25;
      ty = target.y + f.ai.jitterY * 0.25;
      const d = dist(f.x, f.y, target.x, target.y);

      // a vítima está mais exposta que eu? então é hora de ir pra cima
      const targetMargin = state.radius - dist(target.x, target.y, state.cx, state.cy);
      const opportunity = targetMargin < margin + 40 || targetMargin < 95;
      const kill = targetMargin < 70;

      // ...desde que o próprio dash não me jogue fora junto
      const aim = normalize(target.x - f.x, target.y - f.y);
      const landing = dist(f.x + aim.x * 200, f.y + aim.y * 200, state.cx, state.cy);
      const safe = landing < state.radius - 26;

      if (
        beat &&
        d < 180 &&
        f.dashCooldown <= 0 &&
        safe &&
        (kill || opportunity) &&
        rng.chance(kill ? 0.9 : 0.6)
      ) {
        dash = requestBotDash(f);
      }
    }

    // desviar de buracos
    let avoidX = 0;
    let avoidY = 0;
    for (const h of state.holes) {
      const d = dist(f.x, f.y, h.x, h.y);
      if (d < h.r + 78) {
        const n = normalize(f.x - h.x, f.y - h.y);
        const w = 1 - clamp01(d / (h.r + 78));
        avoidX += n.x * w * 260;
        avoidY += n.y * w * 260;
      }
    }

    const dir = normalize(tx - f.x + avoidX, ty - f.y + avoidY);
    return { mx: dir.x, my: dir.y, dash };
  },
};
