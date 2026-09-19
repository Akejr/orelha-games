import type { BaseMatchState, GameId, GameModule } from '../types';
import { bolhaGame } from './bolha';
import { bombGame } from './bomb';
import { buracoGame } from './buraco';
import { cacaGame } from './caca';
import { cadeirasGame } from './cadeiras';
import { carimboGame } from './carimbo';
import { coletaGame } from './coleta';
import { coresGame } from './cores';
import { corridaGame } from './corrida';
import { crownGame } from './crown';
import { doisGame } from './dois';
import { dontFallGame } from './dontFall';
import { espelhoGame } from './espelho';
import { gangorraGame } from './gangorra';
import { imaGame } from './ima';
import { golGame } from './gol';
import { ladraoGame } from './ladrao';
import { meteoroGame } from './meteoro';
import { minaGame } from './mina';
import { ondaGame } from './onda';
import { paintGame } from './paint';
import { paredeGame } from './parede';
import { pesoGame } from './peso';
import { pushGame } from './push';
import { raioGame } from './raio';
import { rastroGame } from './rastro';
import { semaforoGame } from './semaforo';
import { sombraGame } from './sombra';
import { tremGame } from './trem';
import { zonaGame } from './zona';

/**
 * Registro dos módulos de jogo.
 *
 * Adicionar um jogo novo = criar o módulo, registrar aqui e adicionar a entrada
 * no catálogo. Lobby, sala, HUD, resultado, previews e navegação se adaptam
 * sozinhos a partir do catálogo.
 */
export const GAME_MODULES = {
  push: pushGame,
  crown: crownGame,
  bomb: bombGame,
  paint: paintGame,
  'dont-fall': dontFallGame,
  coleta: coletaGame,
  zona: zonaGame,
  parede: paredeGame,
  gol: golGame,
  corrida: corridaGame,
  cores: coresGame,
  raio: raioGame,
  mina: minaGame,
  rastro: rastroGame,
  meteoro: meteoroGame,
  sombra: sombraGame,
  buraco: buracoGame,
  peso: pesoGame,
  ladrao: ladraoGame,
  cadeiras: cadeirasGame,
  onda: ondaGame,
  semaforo: semaforoGame,
  carimbo: carimboGame,
  trem: tremGame,
  gangorra: gangorraGame,
  bolha: bolhaGame,
  ima: imaGame,
  espelho: espelhoGame,
  dois: doisGame,
  caca: cacaGame,
} as const;

export type AnyGameModule = GameModule<any>;

export function getGameModule(id: GameId): AnyGameModule {
  return (GAME_MODULES[id] ?? GAME_MODULES.push) as AnyGameModule;
}

export type AnyMatchState = BaseMatchState;

export {
  bolhaGame,
  bombGame,
  buracoGame,
  cacaGame,
  cadeirasGame,
  carimboGame,
  coletaGame,
  coresGame,
  corridaGame,
  crownGame,
  doisGame,
  dontFallGame,
  espelhoGame,
  gangorraGame,
  golGame,
  imaGame,
  ladraoGame,
  meteoroGame,
  minaGame,
  ondaGame,
  paintGame,
  paredeGame,
  pesoGame,
  pushGame,
  raioGame,
  rastroGame,
  semaforoGame,
  sombraGame,
  tremGame,
  zonaGame,
};
export { PAINT_CELL, PAINT_COLS, PAINT_ROWS, PAINT_TOTAL } from './paint';
export {
  FALL_COLS,
  FALL_GAP,
  FALL_OX,
  FALL_OY,
  FALL_PITCH,
  FALL_ROWS,
  FALL_TILE,
  FALL_TOTAL,
  tileCenter,
  tileIndexAt,
  tileStage,
} from './dontFall';
export { ARENA, ARENA_CENTER, STD_MOVE } from './kit';
export { CORES_NAMES } from './cores';
export { CARIMBO_NAMES } from './carimbo';
export { bolhaRadius } from './bolha';
export { mirrorOf } from './espelho';
export { GROUP_RANGE } from './dois';
export { MINA_COLS, MINA_ROWS, MINA_TOTAL, minaCellCenter, minaCellSize } from './mina';
