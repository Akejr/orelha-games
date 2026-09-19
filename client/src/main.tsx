import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/styles/index.css';

/**
 * roundRect é usado em várias partes do render (cards, blocos, HUD do canvas).
 * Navegadores muito antigos não têm — aqui vai um fallback simples para não
 * quebrar a tela inteira por causa de um canto arredondado.
 */
function polyfillRoundRect(): void {
  const proto = window.CanvasRenderingContext2D?.prototype as
    | (CanvasRenderingContext2D & { roundRect?: unknown })
    | undefined;
  if (!proto || typeof proto.roundRect === 'function') return;
  proto.roundRect = function roundRect(
    this: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number | number[] = 0,
  ): void {
    const r = Math.min(Array.isArray(radii) ? Number(radii[0] ?? 0) : Number(radii), w / 2, h / 2);
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
  } as CanvasRenderingContext2D['roundRect'];
}

polyfillRoundRect();

const container = document.getElementById('root');
if (!container) throw new Error('elemento #root não encontrado');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
