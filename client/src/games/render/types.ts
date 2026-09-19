import type { AvatarId, Expression, GameTheme, Palette, Snapshot } from '@shared/index';
import type { FighterView } from '@/multiplayer/snapshotBuffer';
import type { FxLayer } from './fx';

export interface PlayerMeta {
  id: string;
  name: string;
  avatar: AvatarId;
  slot: number;
  palette: Palette;
  isSelf: boolean;
  bot: boolean;
  connected: boolean;
}

/** Estado visual que vive só no cliente (não vale a pena gastar rede com isso). */
export interface FighterFx {
  squash: number;
  lastFlash: number;
  wasDashing: boolean;
  wasAlive: boolean;
  deadAt: number | null;
  expression: Expression;
  expressionUntil: number;
  emphasis: number;
}

export interface RenderView {
  ctx: CanvasRenderingContext2D;
  /** tamanho lógico do canvas em px CSS */
  width: number;
  height: number;
  /** fator mundo → tela */
  scale: number;
  t: number;
  dt: number;
  snapshot: Snapshot;
  fighters: FighterView[];
  fx: FxLayer;
  meta: Map<string, PlayerMeta>;
  local: Map<string, FighterFx>;
  selfId: string | null;
  theme: GameTheme;
  countdown: boolean;
  /** vencedor definido (fase final) */
  winnerId: string | null;
}

export type GameRenderer = (view: RenderView) => void;

export function createFighterFx(): FighterFx {
  return {
    squash: 0,
    lastFlash: 0,
    wasDashing: false,
    wasAlive: true,
    deadAt: null,
    expression: 'idle',
    expressionUntil: 0,
    emphasis: 0,
  };
}
