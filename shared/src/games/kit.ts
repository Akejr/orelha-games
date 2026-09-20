import {
  containInRect,
  moveConfig,
  resolveFighterCollisions,
  stepDead,
  stepFighter,
  type MoveConfig,
} from '../engine';
import { round1 } from '../math';
import type {
  BaseMatchState,
  Fighter,
  GameId,
  GenericItem,
  InputState,
  MatchResults,
} from '../types';
import { emptyInput, WORLD } from '../types';

/**
 * Kit dos minijogos.
 *
 * Os cinco primeiros jogos foram escritos um a um e, no fim, estavam repetindo o
 * mesmo bloco de "mover todo mundo, prender na arena, resolver colisão". Aqui
 * está esse bloco, mais os atalhos de resultado e de item de cenário — é o que
 * permite um jogo novo caber em ~150 linhas.
 */

/** Arena retangular padrão dos jogos novos (com margem para a moldura). */
export const ARENA = {
  x: 52,
  y: 62,
  w: WORLD.w - 104,
  h: WORLD.h - 124,
};

export const ARENA_CENTER = {
  x: ARENA.x + ARENA.w / 2,
  y: ARENA.y + ARENA.h / 2,
};

/** Configuração de movimento padrão: mesma sensação em todos os jogos. */
export const STD_MOVE: MoveConfig = moveConfig({
  accel: 5300,
  maxSpeed: 435,
  friction: 0.86,
  radius: 26,
  dashSpeed: 1160,
  dashTime: 0.19,
  dashCooldown: 0.6,
  knockback: 660,
  bounce: 0.5,
});

export interface StepBodiesOptions {
  cfg?: MoveConfig;
  knockScale?: number;
  speedScale?: (f: Fighter) => number;
  /** false para jogos com arena circular ou piso próprio */
  contain?: boolean;
  bounce?: number;
}

/**
 * Move todos os personagens, prende na arena e resolve as colisões.
 * @param playing false durante a contagem regressiva (input ignorado).
 */
export function stepBodies(
  state: BaseMatchState,
  dt: number,
  inputs: Record<string, InputState>,
  playing: boolean,
  options: StepBodiesOptions = {},
): void {
  const cfg = options.cfg ?? STD_MOVE;
  const contain = options.contain ?? true;

  for (const f of state.fighters) {
    if (!f.alive) {
      stepDead(f, dt);
      continue;
    }
    const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
    stepFighter(f, input, cfg, dt, state.events, {
      speedScale: options.speedScale?.(f) ?? 1,
    });
    if (contain) {
      containInRect(f, ARENA.x, ARENA.y, ARENA.w, ARENA.h, options.bounce ?? 0.4);
    }
    if (playing) f.survived = state.elapsed;
  }

  resolveFighterCollisions(state.fighters, cfg, state.events, {
    knockScale: options.knockScale ?? 1,
  });
}

/** Monta as linhas de resultado a partir das colocações já atribuídas. */
export function buildResults(
  state: BaseMatchState,
  gameId: GameId,
  label: (f: Fighter) => string,
  highlight?: (f: Fighter) => string | null,
): MatchResults {
  const rows = state.fighters
    .slice()
    .sort((a, b) => (a.place || 99) - (b.place || 99))
    .map((f) => ({
      playerId: f.id,
      place: f.place || 99,
      score: round1(f.score),
      scoreLabel: label(f),
      highlight: highlight?.(f) ?? null,
    }));
  const winner = rows.find((row) => row.place === 1);
  return {
    gameId,
    rows,
    winnerId: winner?.playerId ?? null,
    duration: round1(state.elapsed),
    round: state.round,
  };
}

/**
 * Fecha a partida ranqueando TODOS por pontuação, inclusive quem foi eliminado.
 *
 * `closeMatch` do engine ordena só os sobreviventes e mantém a ordem de queda
 * para os eliminados — o certo em jogos de sobrevivência. Em jogo de pontos isso
 * dá resultado absurdo: no MINA!, um jogador parado que nunca revelou bloco
 * terminava em primeiro por não ter explodido, na frente de quem abriu 39 blocos.
 */
export function closeByScore(state: BaseMatchState): void {
  if (state.phase === 'over') return;
  const ranked = state.fighters
    .slice()
    .sort((a, b) => b.score - a.score || b.lives - a.lives || b.survived - a.survived);
  ranked.forEach((fighter, index) => {
    fighter.place = index + 1;
  });
  state.phase = 'over';
  state.sinceOver = 0;
  const winner = ranked[0];
  state.events.push({ k: 'finish', id: winner?.id, x: winner?.x, y: winner?.y });
}

export function livesLabel(f: Fighter, unit = 'vida'): string {
  if (f.lives > 0) {
    return `${f.lives} ${f.lives === 1 ? unit : `${unit}s`} · ${round1(f.survived).toFixed(1)}s`;
  }
  return `caiu em ${round1(f.survived).toFixed(1)}s`;
}

export function pointsLabel(f: Fighter, unit = 'ponto'): string {
  const value = Math.round(f.score);
  return `${value} ${value === 1 ? unit : `${unit}s`}`;
}

/** Atalho para montar um item de cenário do canal genérico. */
export function item(
  x: number,
  y: number,
  r: number,
  k: number,
  extra: Partial<GenericItem> = {},
): GenericItem {
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(r), k, ...extra };
}

/** Posição aleatória dentro da arena, longe dos jogadores informados. */
export function freeSpot(
  rng: { range: (min: number, max: number) => number },
  fighters: Fighter[],
  margin = 70,
  clearance = 120,
): { x: number; y: number } {
  let best = { x: ARENA_CENTER.x, y: ARENA_CENTER.y };
  let bestScore = -1;
  for (let tries = 0; tries < 14; tries += 1) {
    const candidate = {
      x: rng.range(ARENA.x + margin, ARENA.x + ARENA.w - margin),
      y: rng.range(ARENA.y + margin, ARENA.y + ARENA.h - margin),
    };
    let nearest = Infinity;
    for (const f of fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - candidate.x, f.y - candidate.y);
      if (d < nearest) nearest = d;
    }
    if (nearest === Infinity) return candidate;
    if (nearest > clearance) return candidate;
    if (nearest > bestScore) {
      bestScore = nearest;
      best = candidate;
    }
  }
  return best;
}
