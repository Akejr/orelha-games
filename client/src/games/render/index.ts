import type { GameId } from '@shared/index';
import { createBombRenderer } from './bombRenderer';
import { createCrownRenderer } from './crownRenderer';
import { createDontFallRenderer } from './dontFallRenderer';
import {
  createColetaRenderer,
  createCoresRenderer,
  createCorridaRenderer,
  createGolRenderer,
  createMeteoroRenderer,
  createMinaRenderer,
  createParedeRenderer,
  createRaioRenderer,
  createRastroRenderer,
  createZonaRenderer,
} from './extraRenderers';
import { createPaintRenderer } from './paintRenderer';
import { createPushRenderer } from './pushRenderer';
import type { GameRenderer } from './types';
import {
  createBuracoRenderer,
  createCadeirasRenderer,
  createLadraoRenderer,
  createPesoRenderer,
  createSombraRenderer,
} from './wave3Renderers';
import {
  createCarimboRenderer,
  createGangorraRenderer,
  createOndaRenderer,
  createSemaforoRenderer,
  createTremRenderer,
} from './wave4Renderers';
import {
  createBolhaRenderer,
  createCacaRenderer,
  createDoisRenderer,
  createEspelhoRenderer,
  createImaRenderer,
} from './wave5Renderers';

/**
 * Fábricas de renderer. Cada partida cria uma instância nova — alguns renderers
 * guardam estado local (canvas offscreen do PAINT!, animação de queda dos blocos
 * do DON'T FALL!).
 */
export const RENDERER_FACTORIES: Record<GameId, () => GameRenderer> = {
  push: createPushRenderer,
  crown: createCrownRenderer,
  bomb: createBombRenderer,
  paint: createPaintRenderer,
  'dont-fall': createDontFallRenderer,
  coleta: createColetaRenderer,
  zona: createZonaRenderer,
  parede: createParedeRenderer,
  gol: createGolRenderer,
  corrida: createCorridaRenderer,
  cores: createCoresRenderer,
  raio: createRaioRenderer,
  mina: createMinaRenderer,
  rastro: createRastroRenderer,
  meteoro: createMeteoroRenderer,
  sombra: createSombraRenderer,
  buraco: createBuracoRenderer,
  peso: createPesoRenderer,
  ladrao: createLadraoRenderer,
  cadeiras: createCadeirasRenderer,
  onda: createOndaRenderer,
  semaforo: createSemaforoRenderer,
  carimbo: createCarimboRenderer,
  trem: createTremRenderer,
  gangorra: createGangorraRenderer,
  bolha: createBolhaRenderer,
  ima: createImaRenderer,
  espelho: createEspelhoRenderer,
  dois: createDoisRenderer,
  caca: createCacaRenderer,
};

export function createRenderer(gameId: GameId): GameRenderer {
  const factory = RENDERER_FACTORIES[gameId] ?? RENDERER_FACTORIES.push;
  return factory();
}

export * from './types';
export { FxLayer } from './fx';
