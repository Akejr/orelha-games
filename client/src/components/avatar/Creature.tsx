import { useEffect, useRef } from 'react';
import { paletteForSlot, type AvatarId, type Expression, type Palette } from '@shared/index';
import { drawCreature } from '@/games/render/creature';
import { useTicker } from '@/hooks/useTicker';
import { cn } from '@/utils/cn';

export interface CreatureProps {
  avatar: AvatarId;
  slot?: number;
  palette?: Palette;
  size?: number;
  expression?: Expression;
  animated?: boolean;
  shadow?: boolean;
  glow?: string | null;
  className?: string;
  phase?: number;
  /** título acessível; use null para marcar como decorativo */
  label?: string | null;
}

/**
 * Avatar da interface desenhado no mesmo canvas dos jogos — garante que o
 * personagem do lobby seja exatamente o personagem da partida.
 */
export function Creature({
  avatar,
  slot = 0,
  palette,
  size = 64,
  expression = 'idle',
  animated = true,
  shadow = true,
  glow = null,
  className,
  phase,
  label,
}: CreatureProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seed = phase ?? (avatar.charCodeAt(0) % 7) + slot * 1.7;
  const colors = palette ?? paletteForSlot(slot);

  const render = (time: number): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetW = Math.round(size * dpr);
    if (canvas.width !== targetW) {
      canvas.width = targetW;
      canvas.height = targetW;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawCreature(ctx, {
      type: avatar,
      palette: colors,
      x: size / 2,
      y: size * 0.47,
      r: size * 0.32,
      t: animated ? time : 1.2,
      squash: 0,
      expression,
      shadow,
      glow,
      phase: seed,
    });
  };

  useTicker((time) => render(time), animated);

  // primeiro frame imediato (evita "piscar" vazio antes do ticker)
  useEffect(() => {
    render(1.2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar, slot, size, expression, palette?.id]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn('block select-none', className)}
      role={label === null ? 'presentation' : 'img'}
      aria-label={label ?? undefined}
    />
  );
}
