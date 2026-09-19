import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  createBaseState,
  createFighter,
  hurt,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { dist, normalize } from '../math';
import { rleEncode } from '../rle';
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
 * MINA!
 *
 * Tabuleiro fechado: cada bloco novo que você pisa vale ponto — a não ser que
 * seja uma mina. É o jogo de ganância do portal: dá para jogar seguro e ficar
 * atrás, ou abrir caminho no escuro e liderar até explodir.
 *
 * Grid (RLE): 0 fechado, 1..5 revelado seguro (slot+1), 6 mina estourada.
 * Códigos de item: k=0 clarão de explosão recente.
 */

const TIME_LIMIT = 90;
const LIVES = 3;
export const MINA_COLS = 14;
export const MINA_ROWS = 9;
export const MINA_TOTAL = MINA_COLS * MINA_ROWS;
const MINE_COUNT = 14;
const BLAST_RADIUS = 165;
/**
 * Tempo mínimo entre revelações do mesmo jogador. Sem isso um jogador varria o
 * tabuleiro a 4 blocos por segundo e a rodada acabava em 4 segundos — o jogo não
 * tinha tempo de criar a tensão que é o ponto dele.
 */
const REVEAL_COOLDOWN = 0.95;

export interface MinaState extends BaseMatchState {
  /** true onde existe mina */
  mines: Uint8Array;
  /** 0 fechado, 1..5 dono, 6 mina estourada */
  cells: Uint8Array;
  revealed: number;
  blasts: { x: number; y: number; life: number }[];
  hits: Record<string, number>;
  /** espera até poder revelar o próximo bloco */
  cooldown: Record<string, number>;
  rng: Rng;
}

export function minaCellSize(): { w: number; h: number } {
  return { w: ARENA.w / MINA_COLS, h: ARENA.h / MINA_ROWS };
}

export function minaCellCenter(index: number): { x: number; y: number } {
  const { w, h } = minaCellSize();
  const col = index % MINA_COLS;
  const row = Math.floor(index / MINA_COLS);
  return { x: ARENA.x + col * w + w / 2, y: ARENA.y + row * h + h / 2 };
}

function cellAt(x: number, y: number): number {
  const { w, h } = minaCellSize();
  const col = Math.floor((x - ARENA.x) / w);
  const row = Math.floor((y - ARENA.y) / h);
  if (col < 0 || col >= MINA_COLS || row < 0 || row >= MINA_ROWS) return -1;
  return row * MINA_COLS + col;
}

export const minaGame: GameModule<MinaState> = {
  id: 'mina',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): MinaState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 130);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = LIVES;

    const mines = new Uint8Array(MINA_TOTAL);
    const cells = new Uint8Array(MINA_TOTAL);
    // nenhuma mina embaixo de quem está nascendo
    const banned = new Set<number>();
    for (const spawn of spawns) {
      const index = cellAt(spawn.x, spawn.y);
      if (index >= 0) banned.add(index);
    }
    let placed = 0;
    while (placed < MINE_COUNT) {
      const index = rng.int(0, MINA_TOTAL - 1);
      if (mines[index] || banned.has(index)) continue;
      mines[index] = 1;
      placed += 1;
    }

    return {
      ...createBaseState('mina', ctx, fighters),
      mines,
      cells,
      revealed: 0,
      blasts: [],
      hits: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      cooldown: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 0.95 });
    if (!playing) return;

    for (let i = state.blasts.length - 1; i >= 0; i -= 1) {
      state.blasts[i].life -= dt;
      if (state.blasts[i].life <= 0) state.blasts.splice(i, 1);
    }

    for (const f of state.fighters) {
      if (!f.alive) continue;
      state.cooldown[f.id] = Math.max(0, (state.cooldown[f.id] ?? 0) - dt);
      if (state.cooldown[f.id] > 0) continue;

      const index = cellAt(f.x, f.y);
      if (index < 0 || state.cells[index] !== 0) continue;

      const center = minaCellCenter(index);
      const cell = minaCellSize();
      // precisa entrar de verdade no bloco, não só roçar a borda
      if (dist(f.x, f.y, center.x, center.y) > Math.min(cell.w, cell.h) * 0.42) continue;

      state.revealed += 1;
      state.cooldown[f.id] = REVEAL_COOLDOWN;

      if (state.mines[index]) {
        state.cells[index] = 6;
        state.blasts.push({ x: center.x, y: center.y, life: 0.6 });
        state.events.push({ k: 'mine-boom', id: f.id, x: center.x, y: center.y, v: 1 });

        // onda de choque empurra todo mundo por perto
        for (const other of state.fighters) {
          if (!other.alive) continue;
          const d = dist(other.x, other.y, center.x, center.y);
          if (d > BLAST_RADIUS) continue;
          const n = normalize(other.x - center.x, other.y - center.y);
          const force = (1 - d / BLAST_RADIUS) * 620;
          other.vx += n.x * force;
          other.vy += n.y * force;
          other.squash = -0.5;
        }
        state.hits[f.id] = (state.hits[f.id] ?? 0) + 1;
        hurt(state, f, { invuln: 1.6, x: center.x, y: center.y, kind: 'life-lost' });
      } else {
        state.cells[index] = f.slot + 1;
        f.score += 1;
        state.events.push({ k: 'mine-safe', id: f.id, x: center.x, y: center.y, v: 0.4 });
      }
    }

    const alive = aliveFighters(state);
    const done = state.revealed >= MINA_TOTAL;
    if (alive.length <= 1 || done || state.elapsed >= TIME_LIMIT) {
      // quem explodiu ainda concorre: aqui vale o número de blocos abertos
      closeByScore(state);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'mina',
      (f) => pointsLabel(f, 'bloco'),
      (f) => {
        const boom = state.hits[f.id] ?? 0;
        return boom > 0 ? `${boom} mina${boom === 1 ? '' : 's'} na cara` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        grid: rleEncode(state.cells),
        items: state.blasts.map((blast) =>
          item(blast.x, blast.y, BLAST_RADIUS, 0, { v: Math.round((blast.life / 0.6) * 100) / 100 }),
        ),
        n: [MINA_TOTAL - state.revealed],
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.6, rng.next);

    // heurística: bloco fechado vizinho de área já limpa é aposta melhor
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let index = 0; index < MINA_TOTAL; index += 1) {
      if (state.cells[index] !== 0) continue;
      const center = minaCellCenter(index);
      const d = dist(f.x, f.y, center.x, center.y);

      let safeNeighbours = 0;
      const col = index % MINA_COLS;
      const row = Math.floor(index / MINA_COLS);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= MINA_COLS || nr < 0 || nr >= MINA_ROWS) continue;
        const neighbour = state.cells[nr * MINA_COLS + nc];
        if (neighbour >= 1 && neighbour <= 5) safeNeighbours += 1;
        if (neighbour === 6) safeNeighbours -= 1;
      }

      const score = 420 / (d + 90) + safeNeighbours * 0.22 + f.ai.aggression * 0.1;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) {
      const dir = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
      return { mx: dir.x, my: dir.y, dash: f.dashSeen };
    }

    const center = minaCellCenter(bestIndex);
    const dir = normalize(center.x - f.x, center.y - f.y);
    const d = dist(f.x, f.y, center.x, center.y);
    return {
      mx: dir.x,
      my: dir.y,
      dash: d > 210 && f.dashCooldown <= 0 && rng.chance(dt * 2) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
