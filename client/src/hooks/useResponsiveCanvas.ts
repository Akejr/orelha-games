import { useEffect, useRef, useState } from 'react';

export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Mantém o canvas com a resolução física correta (retina) e informa o tamanho
 * em CSS pixels. Limita o DPR a 2 para não fritar GPUs móveis.
 */
export function useResponsiveCanvas<T extends HTMLElement>(): {
  containerRef: React.RefObject<T>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  size: CanvasSize;
} {
  const containerRef = useRef<T>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const apply = (): void => {
      const rect = element.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const canvas = canvasRef.current;
      if (canvas) {
        const targetW = Math.round(width * dpr);
        const targetH = Math.round(height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      setSize((previous) =>
        previous.width === width && previous.height === height && previous.dpr === dpr
          ? previous
          : { width, height, dpr },
      );
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    window.addEventListener('orientationchange', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

  return { containerRef, canvasRef, size };
}
