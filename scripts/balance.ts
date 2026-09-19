/**
 * Playtest de balanceamento em velocidade máxima.
 *
 * Roda a simulação direto (sem servidor, sem rede, sem tempo real) com bots em
 * todos os slots e reporta duração, eliminações e placar. É o instrumento que
 * define os números de cada jogo: um ajuste de constante é medido em segundos.
 *
 * Uso: npx tsx scripts/balance.ts [idDoJogo]
 */
import { GAME_CATALOG } from '../shared/src/catalog';
import { getGameModule } from '../shared/src/games';
import type { BaseMatchState, GameId, InputState } from '../shared/src/types';

const DT = 1 / 60;
const MAX_SECONDS = 200;
const SEEDS = [101, 2024, 777, 31337];
const COUNTS = [2, 4, 5];

interface Outcome {
  seconds: number;
  outs: number[];
  winnerScore: number;
  loserScore: number;
  label: string;
}

function play(gameId: GameId, players: number, seed: number): Outcome {
  const module = getGameModule(gameId);
  const state = module.create({
    seed,
    round: 1,
    players: Array.from({ length: players }, (_, i) => ({
      id: `p${i + 1}`,
      slot: i,
      bot: true,
      connected: true,
    })),
  }) as BaseMatchState;

  const outs: number[] = [];
  let ticks = 0;

  while (ticks < MAX_SECONDS * 60) {
    const inputs: Record<string, InputState> = {};
    for (const fighter of state.fighters) {
      if (!fighter.alive) continue;
      inputs[fighter.id] = module.bot(state, fighter, DT);
    }
    module.step(state, DT, inputs);
    for (const event of state.events) {
      if (event.k === 'out') outs.push(Math.round(state.elapsed * 10) / 10);
    }
    state.events.length = 0;
    ticks += 1;
    if (module.isOver(state) && state.sinceOver > 1.3) break;
  }

  const results = module.results(state);
  const rows = results.rows.slice().sort((a, b) => a.place - b.place);
  return {
    seconds: Math.round(state.elapsed * 10) / 10,
    outs,
    winnerScore: rows[0]?.score ?? 0,
    loserScore: rows[rows.length - 1]?.score ?? 0,
    label: rows[0]?.scoreLabel ?? '—',
  };
}

const only = process.argv[2];
const games = only ? GAME_CATALOG.filter((game) => game.id === only) : GAME_CATALOG;

console.log(
  `jogo        |  n |  alvo do catálogo | duração média (mín–máx) | vencedor         | eliminações`,
);
console.log('-'.repeat(118));

let warnings = 0;

for (const game of games) {
  for (const count of COUNTS) {
    // jogo que exige sala maior (DOIS!) não é medido com menos gente do que precisa
    if (count < game.minPlayers) continue;
    const runs = SEEDS.map((seed) => play(game.id, count, seed));
    const times = runs.map((run) => run.seconds);
    const average = times.reduce((sum, value) => sum + value, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const outs = runs.map((run) => run.outs.length).reduce((a, b) => a + b, 0) / runs.length;

    // o alvo é a média declarada no catálogo, com tolerância generosa
    const target = game.avgSeconds;
    const off = average < target * 0.45 || average > target * 1.7;
    if (off) warnings += 1;

    console.log(
      [
        game.id.padEnd(11),
        String(count).padStart(2),
        `${String(target).padStart(3)}s`.padStart(17),
        `${average.toFixed(1)}s (${min.toFixed(0)}–${max.toFixed(0)})`.padStart(23),
        runs[0].label.slice(0, 16).padEnd(16),
        outs.toFixed(1).padStart(4),
        off ? '  <-- fora do alvo' : '',
      ].join(' | '),
    );
  }
}

console.log('-'.repeat(118));
console.log(
  warnings === 0
    ? 'todas as durações dentro do alvo'
    : `${warnings} configuração(ões) fora do alvo do catálogo`,
);
