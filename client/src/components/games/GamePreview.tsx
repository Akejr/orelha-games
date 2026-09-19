import { useEffect, useRef, useState } from 'react';
import { getGameMeta, type GameId } from '@shared/index';
import { useTicker } from '@/hooks/useTicker';
import { useResponsiveCanvas } from '@/hooks/useResponsiveCanvas';
import { cn } from '@/utils/cn';
import { PREVIEW_H, PREVIEW_W, getPreview } from './previews';

export interface GamePreviewProps {
  gameId: GameId;
  className?: string;
  /** pausa a animação (cards fora da tela, prefers-reduced-motion) */
  paused?: boolean;
  /** velocidade da cena (hover deixa levemente mais rápido) */
  speed?: number;
  rounded?: string;
}

/**
 * Superfície de preview: escala a cena lógica de 320x180 para o tamanho real do
 * card e só anima quando está visível na tela.
 */
export function GamePreview({
  gameId,
  className,
  paused = false,
  speed = 1,
  rounded = 'rounded-3xl',
}: GamePreviewProps): JSX.Element {
  const { containerRef, canvasRef, size } = useResponsiveCanvas<HTMLDivElement>();
  const [visible, setVisible] = useState(false);
  const store = useRef<Record<string, unknown>>({});
  const clock = useRef({ t: 0, lastP: 0 });
  const meta = getGameMeta(gameId);
  const preview = getPreview(gameId);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.08 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  // troca de jogo reinicia o estado da cena
  useEffect(() => {
    store.current = {};
    clock.current = { t: 0, lastP: 0 };
  }, [gameId]);

  const active = visible && !paused && size.width > 0;

  useTicker((_, dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    clock.current.t += dt * speed;
    const p = (clock.current.t % preview.duration) / preview.duration;
    const wrapped = p < clock.current.lastP;
    clock.current.lastP = p;

    const scale = Math.max(size.width / PREVIEW_W, size.height / PREVIEW_H) * size.dpr;
    const offsetX = (size.width * size.dpr - PREVIEW_W * scale) / 2;
    const offsetY = (size.height * size.dpr - PREVIEW_H * scale) / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    preview.draw({
      ctx,
      t: clock.current.t,
      p,
      wrapped,
      theme: meta.theme,
      store: store.current,
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, active);

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden', rounded, className)}
      style={{ background: `linear-gradient(120deg, ${meta.theme.from}, ${meta.theme.to})` }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <span className="sr-only">Prévia animada do minijogo {meta.name}</span>
    </div>
  );
}
