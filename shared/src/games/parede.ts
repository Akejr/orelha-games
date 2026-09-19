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
import { clamp, clamp01, normalize, round2 } from '../math';
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
 * PAREDE!
 *
 * Paredes atravessam a arena com uma única passagem. É o jogo mais "legível" do
 * portal: qualquer pessoa entende em um segundo olhando a tela, e a tensão vem
 * de escolher a passagem certa com tempo contado.
 *
 * Códigos do snapshot: k=0 parede (retângulo), k=1 aviso de parede nascendo.
 */

const TIME_LIMIT = 95;
const LIVES = 3;
const WALL_THICKNESS = 34;
const GAP_MIN = 98;
const GAP_MAX = 185;
const FIRST_WALL = 2.5;

interface Wall {
  /** 0 = horizontal indo para baixo/cima, 1 = vertical indo para os lados */
  vertical: boolean;
  /** posição atual do eixo de deslocamento */
  pos: number;
  dir: number;
  speed: number;
  /** centro e largura da passagem no eixo transversal */
  gapCenter: number;
  gapWidth: number;
  warn: number;
  hit: Record<string, boolean>;
}

export interface ParedeState extends BaseMatchState {
  walls: Wall[];
  spawnTimer: number;
  spawned: number;
  dodges: Record<string, number>;
  rng: Rng;
}

function makeWall(state: ParedeState): Wall {
  const rng = state.rng;
  const vertical = rng.chance(0.5);
  const dir = rng.chance(0.5) ? 1 : -1;
  // cada parede entra um pouco mais rápida que a anterior
  const speed = clamp(230 + state.spawned * 22, 230, 580);
  const along = vertical ? ARENA.h : ARENA.w;
  const start = vertical ? ARENA.y : ARENA.x;
  // a passagem também vai apertando conforme a partida avança
  const gapWidth = rng.range(GAP_MIN + 40, GAP_MAX) - Math.min(60, state.spawned * 5);
  // o eixo de viagem é X nas paredes verticais e Y nas horizontais
  const travelStart = vertical ? ARENA.x : ARENA.y;
  const travelEnd = vertical ? ARENA.x + ARENA.w : ARENA.y + ARENA.h;
  return {
    vertical,
    pos: dir > 0 ? travelStart - 40 : travelEnd + 40,
    dir,
    speed,
    gapCenter: rng.range(start + gapWidth * 0.6, start + along - gapWidth * 0.6),
    gapWidth: Math.max(GAP_MIN, gapWidth),
    warn: 0.9,
    hit: {},
  };
}

/** Segmentos sólidos da parede: antes e depois da passagem. */
function segments(wall: Wall): { x: number; y: number; w: number; h: number }[] {
  const half = wall.gapWidth / 2;
  if (wall.vertical) {
    // parede vertical viajando no eixo X, passagem no eixo Y
    const topEnd = wall.gapCenter - half;
    const bottomStart = wall.gapCenter + half;
    return [
      { x: wall.pos - WALL_THICKNESS / 2, y: ARENA.y, w: WALL_THICKNESS, h: Math.max(0, topEnd - ARENA.y) },
      {
        x: wall.pos - WALL_THICKNESS / 2,
        y: bottomStart,
        w: WALL_THICKNESS,
        h: Math.max(0, ARENA.y + ARENA.h - bottomStart),
      },
    ];
  }
  const leftEnd = wall.gapCenter - half;
  const rightStart = wall.gapCenter + half;
  return [
    { x: ARENA.x, y: wall.pos - WALL_THICKNESS / 2, w: Math.max(0, leftEnd - ARENA.x), h: WALL_THICKNESS },
    {
      x: rightStart,
      y: wall.pos - WALL_THICKNESS / 2,
      w: Math.max(0, ARENA.x + ARENA.w - rightStart),
      h: WALL_THICKNESS,
    },
  ];
}

export const paredeGame: GameModule<ParedeState> = {
  id: 'parede',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): ParedeState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 150);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = LIVES;
    return {
      ...createBaseState('parede', ctx, fighters),
      walls: [],
      spawnTimer: FIRST_WALL,
      spawned: 0,
      dodges: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 0.9 });
    if (!playing) return;

    // nasce parede nova, cada vez mais junto
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawned += 1;
      state.spawnTimer = clamp(4.2 - state.spawned * 0.22, 1.25, 4.2);
      state.walls.push(makeWall(state));
      state.events.push({ k: 'wall-spawn', v: 1 });
    }

    for (let i = state.walls.length - 1; i >= 0; i -= 1) {
      const wall = state.walls[i];
      wall.warn = Math.max(0, wall.warn - dt);
      if (wall.warn > 0) continue;

      wall.pos += wall.dir * wall.speed * dt;

      // saiu da arena: conta como esquiva para quem sobreviveu
      const limitLow = (wall.vertical ? ARENA.x : ARENA.y) - 80;
      const limitHigh = (wall.vertical ? ARENA.x + ARENA.w : ARENA.y + ARENA.h) + 80;
      if (wall.pos < limitLow || wall.pos > limitHigh) {
        for (const f of state.fighters) {
          if (f.alive && !wall.hit[f.id]) state.dodges[f.id] = (state.dodges[f.id] ?? 0) + 1;
        }
        state.walls.splice(i, 1);
        continue;
      }

      // colisão com os segmentos sólidos
      for (const f of state.fighters) {
        if (!f.alive || f.invuln > 0) continue;
        for (const seg of segments(wall)) {
          if (seg.w <= 0 || seg.h <= 0) continue;
          const nx = clamp(f.x, seg.x, seg.x + seg.w);
          const ny = clamp(f.y, seg.y, seg.y + seg.h);
          if (Math.hypot(f.x - nx, f.y - ny) > f.radius) continue;

          // empurra na direção do movimento da parede antes de tirar a vida
          if (wall.vertical) f.vx += wall.dir * 320;
          else f.vy += wall.dir * 320;
          wall.hit[f.id] = true;
          hurt(state, f, { invuln: 1.5, kind: 'life-lost' });
          break;
        }
      }
    }

    const alive = aliveFighters(state);
    for (const f of alive) f.score = f.survived;
    if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.lives - a.lives || b.survived - a.survived);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'parede',
      (f) => livesLabel(f),
      (f) => {
        const dodges = state.dodges[f.id] ?? 0;
        return dodges > 0 ? `${dodges} parede${dodges === 1 ? '' : 's'} passada${dodges === 1 ? '' : 's'}` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    const items = [];
    for (const wall of state.walls) {
      const kind = wall.warn > 0 ? 1 : 0;
      for (const seg of segments(wall)) {
        if (seg.w <= 0 || seg.h <= 0) continue;
        items.push(
          item(seg.x + seg.w / 2, seg.y + seg.h / 2, 0, kind, {
            w: Math.round(seg.w),
            h: Math.round(seg.h),
            v: round2(wall.warn),
          }),
        );
      }
    }
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: { items, n: [state.walls.length] },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.3, rng.next);

    // parede mais urgente: a que está chegando e ainda vai passar por mim
    let urgent: Wall | null = null;
    let urgency = -Infinity;
    for (const wall of state.walls) {
      const mine = wall.vertical ? f.x : f.y;
      const toMe = (mine - wall.pos) * wall.dir;
      if (toMe < -30) continue;
      const score = 1 / (toMe + 40) + (wall.warn > 0 ? 0 : 0.2);
      if (score > urgency) {
        urgency = score;
        urgent = wall;
      }
    }

    if (urgent) {
      // alinha no centro da passagem e mantém distância da parede
      const cross = urgent.vertical ? f.y : f.x;
      const delta = urgent.gapCenter - cross;
      const mine = urgent.vertical ? f.x : f.y;
      const toMe = (mine - urgent.pos) * urgent.dir;
      const escape = toMe < 150 ? urgent.dir * 0.55 : -urgent.dir * 0.2;
      // erro de leitura proposital: bot que acerta a passagem no milímetro
      // deixava a rodada inteira sem eliminação
      const align = clamp((delta + f.ai.jitterX * 0.16) / 90, -1, 1);

      const mx = urgent.vertical ? escape : align;
      const my = urgent.vertical ? align : escape;
      const needsDash = Math.abs(delta) > 140 && toMe < 130;
      return {
        mx,
        my,
        dash: needsDash && f.dashCooldown <= 0 && rng.chance(dt * 6) ? requestBotDash(f) : f.dashSeen,
      };
    }

    // sem parede: fica pelo meio, onde há mais saída
    const dir = normalize(
      ARENA_CENTER.x - f.x + f.ai.jitterX,
      ARENA_CENTER.y - f.y + f.ai.jitterY,
    );
    return { mx: dir.x * 0.6, my: dir.y * 0.6, dash: f.dashSeen };
  },
};
