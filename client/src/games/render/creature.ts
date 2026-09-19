import type { AvatarId, Expression, Palette } from '@shared/index';

/**
 * O elenco do Orelha Games é desenhado por código, em canvas 2D.
 *
 * Isso mantém uma única fonte de verdade para a arte: a mesma função desenha os
 * personagens dentro da partida, nos previews dos cards e nos avatares da
 * interface. Nada de sprite sheet para sair de sincronia — e o bundle continua
 * minúsculo.
 */

const TAU = Math.PI * 2;

export interface CreatureOptions {
  type: AvatarId;
  palette: Palette;
  x: number;
  y: number;
  /** raio base do corpo */
  r: number;
  /** tempo em segundos (animação de respiração / piscada) */
  t: number;
  vx?: number;
  vy?: number;
  /** -1 achatado (impacto), +1 esticado (dash/pulo) */
  squash?: number;
  expression?: Expression;
  /** clarão branco de impacto (0..1) */
  flash?: number;
  alpha?: number;
  facing?: number;
  shadow?: boolean;
  /** fase própria para os personagens não animarem em uníssono */
  phase?: number;
  /** brilho ao redor (portador da coroa, bomba, etc) */
  glow?: string | null;
  glowSize?: number;
  outline?: boolean;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, r: number, points = 5, inner = 0.52): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (i / (points * 2)) * TAU - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * inner;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Corpos
// ---------------------------------------------------------------------------

function bodyPath(ctx: CanvasRenderingContext2D, type: AvatarId, r: number, t: number): void {
  switch (type) {
    case 'blob': {
      const w = r * 1.03;
      const h = r * 0.99;
      const wobble = Math.sin(t * 2.4) * r * 0.04;
      ctx.beginPath();
      ctx.moveTo(-w, wobble * 0.4);
      ctx.bezierCurveTo(-w - wobble, -h * 1.42, w + wobble, -h * 1.42, w, wobble * 0.4);
      ctx.bezierCurveTo(w, h * 0.9, w * 0.52, h * 1.02, 0, h * 1.02);
      ctx.bezierCurveTo(-w * 0.52, h * 1.02, -w, h * 0.9, -w, wobble * 0.4);
      ctx.closePath();
      break;
    }
    case 'monstro': {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.04, r * 1.02, r * 0.98, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'robo': {
      roundRect(ctx, -r * 0.92, -r * 0.9, r * 1.84, r * 1.8, r * 0.46);
      break;
    }
    case 'fantasma': {
      const y = r * 0.62;
      const wave = Math.sin(t * 3.1) * r * 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, 0);
      ctx.lineTo(r, y * 0.35);
      ctx.quadraticCurveTo(r * 0.66, y * 1.3 + wave, r * 0.33, y * 0.5);
      ctx.quadraticCurveTo(0, y * 1.34 - wave, -r * 0.33, y * 0.5);
      ctx.quadraticCurveTo(-r * 0.66, y * 1.3 + wave, -r, y * 0.35);
      ctx.closePath();
      break;
    }
    case 'gato': {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.06, r * 1.0, r * 0.94, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'cachorro': {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.05, r * 1.04, r * 0.95, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'sapo': {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.16, r * 1.14, r * 0.8, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'capivara': {
      roundRect(ctx, -r * 1.02, -r * 0.86, r * 2.04, r * 1.78, r * 0.62);
      break;
    }
    case 'pinguim': {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.04, r * 0.9, r * 1.06, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'polvo': {
      // cúpula: meia-lua em cima com base reta
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r, Math.PI, 0);
      ctx.lineTo(r, r * 0.42);
      ctx.quadraticCurveTo(0, r * 0.62, -r, r * 0.42);
      ctx.closePath();
      break;
    }
    case 'jacare': {
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.02, r * 1.08, r * 0.88, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'caveira': {
      // crânio: círculo com maçãs estreitando embaixo
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.1);
      ctx.bezierCurveTo(-r, -r * 1.3, r, -r * 1.3, r, -r * 0.1);
      ctx.bezierCurveTo(r, r * 0.5, r * 0.62, r * 0.62, r * 0.48, r * 0.96);
      ctx.lineTo(-r * 0.48, r * 0.96);
      ctx.bezierCurveTo(-r * 0.62, r * 0.62, -r, r * 0.5, -r, -r * 0.1);
      ctx.closePath();
      break;
    }
    case 'alien': {
      // gota invertida: cabeçorra em cima, queixo fino
      ctx.beginPath();
      ctx.moveTo(0, r * 1.02);
      ctx.bezierCurveTo(-r * 1.12, r * 0.34, -r * 1.06, -r * 1.16, 0, -r * 1.06);
      ctx.bezierCurveTo(r * 1.06, -r * 1.16, r * 1.12, r * 0.34, 0, r * 1.02);
      ctx.closePath();
      break;
    }
    case 'nuvem': {
      ctx.beginPath();
      ctx.arc(-r * 0.52, r * 0.1, r * 0.6, 0, TAU);
      ctx.arc(0, -r * 0.24, r * 0.76, 0, TAU);
      ctx.arc(r * 0.56, r * 0.12, r * 0.58, 0, TAU);
      ctx.arc(0, r * 0.3, r * 0.66, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'banana': {
      // crescente: dois arcos que se encontram nas pontas
      ctx.beginPath();
      ctx.arc(r * 0.12, r * 0.18, r * 1.05, Math.PI * 0.86, Math.PI * 2.1);
      ctx.arc(r * 0.34, r * 0.02, r * 0.86, Math.PI * 2.05, Math.PI * 0.9, true);
      ctx.closePath();
      break;
    }
    case 'pao': {
      ctx.beginPath();
      ctx.moveTo(-r * 1.02, r * 0.86);
      ctx.lineTo(-r * 0.92, -r * 0.12);
      ctx.bezierCurveTo(-r * 0.92, -r * 1.12, r * 0.92, -r * 1.12, r * 0.92, -r * 0.12);
      ctx.lineTo(r * 1.02, r * 0.86);
      ctx.quadraticCurveTo(0, r * 1.06, -r * 1.02, r * 0.86);
      ctx.closePath();
      break;
    }
    case 'abacaxi': {
      roundRect(ctx, -r * 0.84, -r * 0.92, r * 1.68, r * 1.9, r * 0.5);
      break;
    }
    case 'cogumelo': {
      // chapéu largo, o pé fica atrás
      ctx.beginPath();
      ctx.moveTo(-r * 1.12, r * 0.3);
      ctx.bezierCurveTo(-r * 1.16, -r * 1.16, r * 1.16, -r * 1.16, r * 1.12, r * 0.3);
      ctx.quadraticCurveTo(0, r * 0.66, -r * 1.12, r * 0.3);
      ctx.closePath();
      break;
    }
    case 'peixe': {
      ctx.beginPath();
      ctx.ellipse(r * 0.06, r * 0.04, r * 1.06, r * 0.84, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'coelho': {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.08, r * 0.96, r * 0.94, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'dragao': {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.04, r * 1.02, r * 0.96, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'ovo': {
      // clara irregular de ovo frito
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, r * 0.1);
      ctx.bezierCurveTo(-r * 1.2, -r * 0.8, -r * 0.3, -r * 1.16, r * 0.2, -r * 0.92);
      ctx.bezierCurveTo(r * 0.9, -r * 1.2, r * 1.24, -r * 0.4, r * 1.04, r * 0.18);
      ctx.bezierCurveTo(r * 1.22, r * 0.78, r * 0.4, r * 1.14, -r * 0.08, r * 0.9);
      ctx.bezierCurveTo(-r * 0.7, r * 1.16, -r * 1.16, r * 0.7, -r * 1.1, r * 0.1);
      ctx.closePath();
      break;
    }
    case 'unicornio': {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.06, r * 1.0, r * 0.94, 0, 0, TAU);
      ctx.closePath();
      break;
    }
    case 'estrela':
    default: {
      starPath(ctx, r * 1.04, 5, 0.56);
      break;
    }
  }
}

/** Detalhes que ficam ATRÁS do corpo (orelhas, chifres, cauda, antena). */
function drawBehind(
  ctx: CanvasRenderingContext2D,
  type: AvatarId,
  palette: Palette,
  r: number,
  t: number,
  ink: string,
  lw: number,
): void {
  ctx.lineWidth = lw;
  ctx.strokeStyle = ink;
  ctx.lineJoin = 'round';

  switch (type) {
    case 'monstro': {
      // chifrinhos
      const horns = [
        [-0.52, -0.82, -0.62],
        [0, -1.02, 0],
        [0.52, -0.82, 0.62],
      ];
      for (const [hx, hy, tipx] of horns) {
        ctx.beginPath();
        ctx.moveTo(hx * r - r * 0.2, hy * r + r * 0.24);
        ctx.lineTo(tipx * r, hy * r - r * 0.28);
        ctx.lineTo(hx * r + r * 0.2, hy * r + r * 0.24);
        ctx.closePath();
        ctx.fillStyle = palette.shade;
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'gato': {
      // orelhas
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.28, -r * 0.72);
        ctx.lineTo(side * r * 0.82, -r * 1.24);
        ctx.lineTo(side * r * 0.9, -r * 0.5);
        ctx.closePath();
        ctx.fillStyle = palette.base;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * r * 0.44, -r * 0.7);
        ctx.lineTo(side * r * 0.76, -r * 1.06);
        ctx.lineTo(side * r * 0.8, -r * 0.58);
        ctx.closePath();
        ctx.fillStyle = palette.accent;
        ctx.fill();
      }
      // cauda
      ctx.beginPath();
      ctx.moveTo(r * 0.72, r * 0.42);
      ctx.quadraticCurveTo(
        r * 1.45,
        r * 0.3 + Math.sin(t * 3) * r * 0.18,
        r * 1.22,
        -r * 0.34 + Math.cos(t * 3) * r * 0.12,
      );
      ctx.lineWidth = r * 0.3;
      ctx.strokeStyle = palette.base;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineWidth = lw;
      ctx.strokeStyle = ink;
      break;
    }
    case 'robo': {
      // antena
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.88);
      ctx.lineTo(0, -r * 1.32);
      ctx.lineWidth = r * 0.13;
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 1.44, r * 0.19, 0, TAU);
      ctx.fillStyle = palette.accent;
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case 'cachorro': {
      // orelhas caídas nas laterais
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * r * 0.92, r * 0.06, r * 0.32, r * 0.56, side * 0.28, 0, TAU);
        ctx.fillStyle = palette.shade;
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'capivara': {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * r * 0.66, -r * 0.92, r * 0.22, 0, TAU);
        ctx.fillStyle = palette.shade;
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'polvo': {
      // tentáculos balançando
      for (let i = 0; i < 4; i += 1) {
        const x = -r * 0.72 + i * r * 0.48;
        const wobble = Math.sin(t * 3 + i) * r * 0.12;
        ctx.beginPath();
        ctx.moveTo(x, r * 0.3);
        ctx.quadraticCurveTo(x + wobble, r * 0.86, x + wobble * 1.6, r * 1.12);
        ctx.lineWidth = r * 0.3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = palette.shade;
        ctx.stroke();
        ctx.lineWidth = lw;
        ctx.strokeStyle = ink;
      }
      break;
    }
    case 'alien': {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.4, -r * 0.94);
        ctx.quadraticCurveTo(side * r * 0.74, -r * 1.5, side * r * 0.52, -r * 1.72);
        ctx.lineWidth = r * 0.11;
        ctx.strokeStyle = ink;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(side * r * 0.52, -r * 1.8, r * 0.16, 0, TAU);
        ctx.fillStyle = palette.accent;
        ctx.fill();
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      break;
    }
    case 'abacaxi': {
      // coroa de folhas
      for (const [dx, tip] of [
        [-0.42, -1.5],
        [0, -1.72],
        [0.42, -1.5],
      ]) {
        ctx.beginPath();
        ctx.moveTo(dx * r - r * 0.2, -r * 0.8);
        ctx.lineTo(dx * r, tip * r);
        ctx.lineTo(dx * r + r * 0.2, -r * 0.8);
        ctx.closePath();
        ctx.fillStyle = '#2BD9A8';
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'cogumelo': {
      // pé do cogumelo
      roundRect(ctx, -r * 0.42, r * 0.02, r * 0.84, r * 1.1, r * 0.3);
      ctx.fillStyle = '#FFF3DF';
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'peixe': {
      // cauda e barbatana de cima
      ctx.beginPath();
      ctx.moveTo(-r * 0.86, 0);
      ctx.lineTo(-r * 1.58, -r * 0.52);
      ctx.lineTo(-r * 1.38, 0);
      ctx.lineTo(-r * 1.58, r * 0.52);
      ctx.closePath();
      ctx.fillStyle = palette.shade;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 0.8);
      ctx.lineTo(r * 0.1, -r * 1.34);
      ctx.lineTo(r * 0.44, -r * 0.72);
      ctx.closePath();
      ctx.fillStyle = palette.shade;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'coelho': {
      // orelhonas (é o mascote da casa)
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * r * 0.38, -r * 1.26, r * 0.24, r * 0.7, side * 0.16, 0, TAU);
        ctx.fillStyle = palette.base;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(side * r * 0.38, -r * 1.22, r * 0.12, r * 0.48, side * 0.16, 0, TAU);
        ctx.fillStyle = palette.accent;
        ctx.fill();
      }
      break;
    }
    case 'dragao': {
      // asinhas e chifres
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.7, -r * 0.2);
        ctx.quadraticCurveTo(side * r * 1.7, -r * 0.86, side * r * 1.5, r * 0.2);
        ctx.quadraticCurveTo(side * r * 1.1, r * 0.1, side * r * 0.7, r * 0.3);
        ctx.closePath();
        ctx.fillStyle = palette.light;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * r * 0.3, -r * 0.88);
        ctx.lineTo(side * r * 0.5, -r * 1.42);
        ctx.lineTo(side * r * 0.66, -r * 0.78);
        ctx.closePath();
        ctx.fillStyle = '#FFF3C4';
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'unicornio': {
      // chifre e topete
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.82);
      ctx.lineTo(0, -r * 1.68);
      ctx.lineTo(r * 0.2, -r * 0.82);
      ctx.closePath();
      ctx.fillStyle = '#FFC93C';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.46, -r * 0.82, r * 0.24, 0, TAU);
      ctx.arc(r * 0.46, -r * 0.82, r * 0.24, 0, TAU);
      ctx.fillStyle = '#FF9BC6';
      ctx.fill();
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/** Detalhes que ficam NA FRENTE do corpo (brilho, bochechas, visor). */
function drawFront(
  ctx: CanvasRenderingContext2D,
  type: AvatarId,
  palette: Palette,
  r: number,
  ink: string,
  lw: number,
): void {
  // brilho de topo, dá volume sem sombreamento complexo
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, -r * 0.46, r * 0.3, r * 0.19, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (type === 'robo') {
    ctx.fillStyle = palette.shade;
    roundRect(ctx, -r * 0.36, r * 0.34, r * 0.72, r * 0.26, r * 0.12);
    ctx.fill();
    ctx.lineWidth = lw * 0.7;
    ctx.strokeStyle = ink;
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(-r * 0.2 + i * r * 0.2, r * 0.47, r * 0.045, 0, TAU);
      ctx.fillStyle = palette.accent;
      ctx.fill();
    }
  }

  if (type === 'gato' || type === 'fantasma' || type === 'blob') {
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = 0.75;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.62, r * 0.2, r * 0.17, r * 0.11, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (type === 'gato') {
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 0.55;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.5, r * 0.16 + i * r * 0.14);
        ctx.lineTo(side * r * 0.98, r * 0.06 + i * r * 0.2);
        ctx.stroke();
      }
    }
  }

  if (type === 'monstro' || type === 'dragao') {
    // barriga clarinha
    ctx.fillStyle = palette.light;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.42, r * 0.46, r * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // --- detalhes do elenco novo ---

  if (type === 'sapo') {
    // as bolhas dos olhos: o rosto padrão é desenhado em cima delas
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.34, -r * 0.1, r * 0.3, 0, TAU);
      ctx.fillStyle = palette.light;
      ctx.fill();
      ctx.lineWidth = lw * 0.8;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
  }

  if (type === 'cachorro' || type === 'capivara') {
    ctx.fillStyle = type === 'capivara' ? palette.light : '#FFF3E4';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.5, r * 0.44, r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.36, r * 0.13, r * 0.1, 0, 0, TAU);
    ctx.fillStyle = ink;
    ctx.fill();
  }

  if (type === 'pinguim') {
    ctx.fillStyle = '#FFFDF5';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, r * 0.52, r * 0.62, 0, 0, TAU);
    ctx.fill();
    // bico
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, r * 0.36);
    ctx.lineTo(r * 0.2, r * 0.36);
    ctx.lineTo(0, r * 0.62);
    ctx.closePath();
    ctx.fillStyle = '#FFC93C';
    ctx.fill();
    ctx.lineWidth = lw * 0.7;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  if (type === 'jacare') {
    // focinho com dentes
    roundRect(ctx, -r * 0.5, r * 0.3, r * 1.0, r * 0.46, r * 0.18);
    ctx.fillStyle = palette.light;
    ctx.fill();
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.42 + i * r * 0.21, r * 0.3);
      ctx.lineTo(-r * 0.32 + i * r * 0.21, r * 0.48);
      ctx.lineTo(-r * 0.22 + i * r * 0.21, r * 0.3);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (type === 'caveira') {
    ctx.fillStyle = ink;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.13, r * 0.3, r * 0.07, r * 0.1, 0, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 0.6;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.3 + i * r * 0.3, r * 0.66);
      ctx.lineTo(-r * 0.3 + i * r * 0.3, r * 0.94);
      ctx.stroke();
    }
  }

  if (type === 'banana') {
    ctx.fillStyle = palette.shade;
    ctx.beginPath();
    ctx.ellipse(-r * 0.62, -r * 0.62, r * 0.16, r * 0.1, -0.6, 0, TAU);
    ctx.fill();
  }

  if (type === 'pao') {
    ctx.strokeStyle = palette.shade;
    ctx.lineWidth = lw * 1.1;
    ctx.lineCap = 'round';
    for (const dx of [-0.34, 0.06]) {
      ctx.beginPath();
      ctx.moveTo(r * dx, -r * 0.66);
      ctx.lineTo(r * (dx + 0.34), -r * 0.34);
      ctx.stroke();
    }
  }

  if (type === 'abacaxi') {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = palette.shade;
    ctx.lineWidth = lw * 0.7;
    for (let i = -3; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * (i * 0.3 - 0.2));
      ctx.lineTo(r * 0.8, r * (i * 0.3 + 0.3));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * (i * 0.3 + 0.3));
      ctx.lineTo(r * 0.8, r * (i * 0.3 - 0.2));
      ctx.stroke();
    }
    ctx.restore();
  }

  if (type === 'cogumelo') {
    ctx.fillStyle = '#FFFDF5';
    for (const [dx, dy, rr] of [
      [-0.62, -0.5, 0.2],
      [0, -0.86, 0.17],
      [0.66, -0.44, 0.22],
    ]) {
      ctx.beginPath();
      ctx.arc(r * dx, r * dy, r * rr, 0, TAU);
      ctx.fill();
    }
  }

  if (type === 'peixe') {
    ctx.strokeStyle = palette.shade;
    ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    ctx.arc(-r * 0.34, r * 0.04, r * 0.44, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();
  }

  if (type === 'ovo') {
    ctx.beginPath();
    ctx.arc(0, r * 0.26, r * 0.46, 0, TAU);
    const yolk = ctx.createRadialGradient(-r * 0.12, r * 0.14, r * 0.08, 0, r * 0.26, r * 0.46);
    yolk.addColorStop(0, '#FFE38C');
    yolk.addColorStop(1, '#F5AE10');
    ctx.fillStyle = yolk;
    ctx.fill();
    ctx.lineWidth = lw * 0.7;
    ctx.strokeStyle = '#B87400';
    ctx.stroke();
  }

  if (type === 'unicornio' || type === 'coelho' || type === 'capivara' || type === 'sapo') {
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = 0.7;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.66, r * 0.26, r * 0.16, r * 0.1, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Rosto
// ---------------------------------------------------------------------------

function drawFace(
  ctx: CanvasRenderingContext2D,
  r: number,
  expression: Expression,
  look: { x: number; y: number },
  ink: string,
  blink: number,
  type: AvatarId,
): void {
  const eyeY = type === 'robo' ? -r * 0.12 : -r * 0.08;
  const eyeX = r * 0.34;
  const eyeR = r * 0.215;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawEyeWhite = (side: number, scaleY = 1): void => {
    ctx.beginPath();
    ctx.ellipse(side * eyeX, eyeY, eyeR, eyeR * scaleY, 0, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  };

  const drawPupil = (side: number, size = 0.52, offsetY = 0): void => {
    ctx.beginPath();
    ctx.arc(
      side * eyeX + look.x * eyeR * 0.5,
      eyeY + look.y * eyeR * 0.5 + offsetY,
      eyeR * size,
      0,
      TAU,
    );
    ctx.fillStyle = ink;
    ctx.fill();
    // brilho do olho
    ctx.beginPath();
    ctx.arc(
      side * eyeX + look.x * eyeR * 0.5 - eyeR * 0.16,
      eyeY + look.y * eyeR * 0.5 - eyeR * 0.2 + offsetY,
      eyeR * 0.14,
      0,
      TAU,
    );
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  };

  const closedEyes = (curve: number): void => {
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.11;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * eyeX - eyeR * 0.9, eyeY + curve * eyeR * 0.5);
      ctx.quadraticCurveTo(side * eyeX, eyeY - curve * eyeR, side * eyeX + eyeR * 0.9, eyeY + curve * eyeR * 0.5);
      ctx.stroke();
    }
  };

  if (blink > 0 && expression !== 'dizzy' && expression !== 'cheer') {
    closedEyes(0.6);
  } else {
    switch (expression) {
      case 'cheer': {
        closedEyes(1);
        break;
      }
      case 'dizzy': {
        ctx.strokeStyle = ink;
        ctx.lineWidth = r * 0.1;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * eyeX - eyeR * 0.7, eyeY - eyeR * 0.7);
          ctx.lineTo(side * eyeX + eyeR * 0.7, eyeY + eyeR * 0.7);
          ctx.moveTo(side * eyeX + eyeR * 0.7, eyeY - eyeR * 0.7);
          ctx.lineTo(side * eyeX - eyeR * 0.7, eyeY + eyeR * 0.7);
          ctx.stroke();
        }
        break;
      }
      case 'scared': {
        for (const side of [-1, 1]) {
          drawEyeWhite(side, 1.18);
          drawPupil(side, 0.34, -eyeR * 0.12);
        }
        break;
      }
      case 'angry': {
        for (const side of [-1, 1]) {
          drawEyeWhite(side, 0.86);
          drawPupil(side, 0.5);
        }
        ctx.strokeStyle = ink;
        ctx.lineWidth = r * 0.12;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * (eyeX - eyeR), eyeY - eyeR * 1.5);
          ctx.lineTo(side * (eyeX + eyeR * 0.8), eyeY - eyeR * 0.95);
          ctx.stroke();
        }
        break;
      }
      case 'sad': {
        for (const side of [-1, 1]) {
          drawEyeWhite(side, 0.8);
          drawPupil(side, 0.46, eyeR * 0.12);
        }
        ctx.strokeStyle = ink;
        ctx.lineWidth = r * 0.1;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * (eyeX + eyeR * 0.9), eyeY - eyeR * 1.4);
          ctx.lineTo(side * (eyeX - eyeR * 0.7), eyeY - eyeR * 1);
          ctx.stroke();
        }
        break;
      }
      default: {
        for (const side of [-1, 1]) {
          drawEyeWhite(side);
          drawPupil(side);
        }
        break;
      }
    }
  }

  // boca
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.12;
  const mouthY = r * 0.42;
  switch (expression) {
    case 'cheer': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.26, mouthY - r * 0.08);
      ctx.quadraticCurveTo(0, mouthY + r * 0.42, r * 0.26, mouthY - r * 0.08);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.fill();
      break;
    }
    case 'scared': {
      ctx.beginPath();
      ctx.ellipse(0, mouthY + r * 0.04, r * 0.15, r * 0.19, 0, 0, TAU);
      ctx.fillStyle = ink;
      ctx.fill();
      break;
    }
    case 'angry': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.24, mouthY + r * 0.1);
      ctx.quadraticCurveTo(0, mouthY - r * 0.14, r * 0.24, mouthY + r * 0.1);
      ctx.stroke();
      break;
    }
    case 'dizzy': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.24, mouthY);
      ctx.quadraticCurveTo(-r * 0.08, mouthY + r * 0.16, 0, mouthY);
      ctx.quadraticCurveTo(r * 0.08, mouthY - r * 0.16, r * 0.24, mouthY);
      ctx.stroke();
      break;
    }
    case 'sad': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, mouthY + r * 0.12);
      ctx.quadraticCurveTo(0, mouthY - r * 0.1, r * 0.2, mouthY + r * 0.12);
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.moveTo(-r * 0.22, mouthY - r * 0.04);
      ctx.quadraticCurveTo(0, mouthY + r * 0.24, r * 0.22, mouthY - r * 0.04);
      ctx.stroke();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Desenho principal
// ---------------------------------------------------------------------------

export function drawCreature(ctx: CanvasRenderingContext2D, o: CreatureOptions): void {
  const {
    type,
    palette,
    x,
    y,
    r,
    t,
    vx = 0,
    vy = 0,
    squash = 0,
    expression = 'idle',
    flash = 0,
    alpha = 1,
    shadow = true,
    phase = 0,
    glow = null,
    glowSize = 1,
    outline = true,
  } = o;

  const speed = Math.hypot(vx, vy);
  const breathe = Math.sin(t * 2.6 + phase) * 0.032;
  const sq = Math.max(-1, Math.min(1, squash));
  const scaleX = 1 - sq * 0.3 + breathe * 0.5 + Math.min(0.12, speed / 4200);
  const scaleY = 1 + sq * 0.32 - breathe - Math.min(0.1, speed / 5200);
  const tilt = Math.max(-0.26, Math.min(0.26, vx / 1400)) + Math.sin(t * 1.7 + phase) * 0.02;
  const hop = type === 'fantasma' ? Math.sin(t * 2.2 + phase) * r * 0.09 : 0;

  const ink = palette.ink;
  const lw = Math.max(1.4, r * 0.13);

  ctx.save();
  ctx.globalAlpha = alpha;

  // sombra no chão
  if (shadow) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.2;
    ctx.fillStyle = '#2B1466';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.95, r * (0.86 - sq * 0.12), r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  if (glow) {
    ctx.save();
    const gradient = ctx.createRadialGradient(x, y + hop, r * 0.6, x, y + hop, r * 2.1 * glowSize);
    gradient.addColorStop(0, glow);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y + hop, r * 2.1 * glowSize, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.translate(x, y + hop);
  ctx.rotate(tilt);
  ctx.scale(scaleX, scaleY);

  drawBehind(ctx, type, palette, r, t, ink, lw);

  // corpo
  bodyPath(ctx, type, r, t);
  if (type === 'estrela') {
    // truque do contorno: traça grosso no ink e depois fino na cor base
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.44 + lw * 2;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.lineWidth = r * 0.44;
    ctx.strokeStyle = palette.base;
    ctx.stroke();
    ctx.fillStyle = palette.base;
    ctx.fill();
  } else {
    const gradient = ctx.createLinearGradient(0, -r, 0, r * 1.1);
    gradient.addColorStop(0, palette.light);
    gradient.addColorStop(0.55, palette.base);
    gradient.addColorStop(1, palette.shade);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = alpha * (type === 'fantasma' ? 0.94 : 1);
    ctx.fill();
    ctx.globalAlpha = alpha;
    if (outline) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = ink;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  drawFront(ctx, type, palette, r, ink, lw);

  const look = speed > 12 ? { x: vx / Math.max(speed, 1), y: vy / Math.max(speed, 1) } : { x: 0, y: 0 };
  const blinkCycle = (t * 0.55 + phase * 0.37) % 1;
  const blink = blinkCycle > 0.955 ? 1 : 0;
  drawFace(ctx, r, expression, look, ink, blink, type);

  // clarão de impacto
  if (flash > 0.01) {
    bodyPath(ctx, type, r, t);
    ctx.globalAlpha = alpha * Math.min(1, flash) * 0.75;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Acessórios
// ---------------------------------------------------------------------------

export function drawCrown(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  t: number,
  options: { grounded?: boolean; alpha?: number } = {},
): void {
  const { grounded = false, alpha = 1 } = options;
  const bob = grounded ? Math.sin(t * 4) * size * 0.06 : Math.sin(t * 5) * size * 0.08;
  const spin = grounded ? Math.sin(t * 2) * 0.18 : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + bob);
  ctx.rotate(spin);

  // aura
  const glow = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 2.4);
  glow.addColorStop(0, 'rgba(255,214,64,0.55)');
  glow.addColorStop(1, 'rgba(255,214,64,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.4, 0, TAU);
  ctx.fill();

  const w = size;
  const h = size * 0.78;
  ctx.beginPath();
  ctx.moveTo(-w, h * 0.45);
  ctx.lineTo(-w, -h * 0.25);
  ctx.lineTo(-w * 0.5, h * 0.12);
  ctx.lineTo(0, -h * 0.62);
  ctx.lineTo(w * 0.5, h * 0.12);
  ctx.lineTo(w, -h * 0.25);
  ctx.lineTo(w, h * 0.45);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, -h, 0, h);
  gradient.addColorStop(0, '#FFF0B8');
  gradient.addColorStop(0.5, '#FFC93C');
  gradient.addColorStop(1, '#E08A00');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.16);
  ctx.strokeStyle = '#6B3D00';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // pedra central
  ctx.beginPath();
  ctx.arc(0, h * 0.1, size * 0.16, 0, TAU);
  ctx.fillStyle = '#FF5CA3';
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.09);
  ctx.stroke();

  ctx.restore();
}

export function drawBomb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  t: number,
  fuse: number,
): void {
  // fuse: 1 = acabou de pegar, 0 = vai explodir
  const danger = 1 - fuse;
  const pulse = 1 + Math.sin(t * (6 + danger * 26)) * (0.05 + danger * 0.16);
  const shake = danger > 0.55 ? (Math.random() - 0.5) * size * danger * 0.28 : 0;

  ctx.save();
  ctx.translate(x + shake, y + shake * 0.6);
  ctx.scale(pulse, pulse);

  const glow = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 2.6);
  glow.addColorStop(0, `rgba(255,90,60,${0.25 + danger * 0.45})`);
  glow.addColorStop(1, 'rgba(255,90,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.6, 0, TAU);
  ctx.fill();

  // corpo
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, TAU);
  const body = ctx.createRadialGradient(-size * 0.3, -size * 0.35, size * 0.15, 0, 0, size);
  body.addColorStop(0, '#6B6480');
  body.addColorStop(0.5, '#33294F');
  body.addColorStop(1, '#1B1233');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, size * 0.16);
  ctx.strokeStyle = '#120B26';
  ctx.stroke();

  // brilho
  ctx.beginPath();
  ctx.ellipse(-size * 0.32, -size * 0.36, size * 0.24, size * 0.14, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();

  // tampa e pavio
  ctx.beginPath();
  ctx.moveTo(-size * 0.22, -size * 0.9);
  ctx.lineTo(size * 0.22, -size * 0.9);
  ctx.lineTo(size * 0.16, -size * 1.16);
  ctx.lineTo(-size * 0.16, -size * 1.16);
  ctx.closePath();
  ctx.fillStyle = '#FFC93C';
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, size * 0.11);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -size * 1.16);
  ctx.quadraticCurveTo(size * 0.5, -size * 1.5, size * 0.28, -size * 1.85);
  ctx.lineWidth = Math.max(1.4, size * 0.13);
  ctx.strokeStyle = '#8A5A2B';
  ctx.lineCap = 'round';
  ctx.stroke();

  // faísca
  const sparkR = size * (0.24 + Math.random() * 0.16) * (0.7 + danger * 0.8);
  const spark = ctx.createRadialGradient(size * 0.28, -size * 1.9, 0, size * 0.28, -size * 1.9, sparkR * 2);
  spark.addColorStop(0, '#FFFFFF');
  spark.addColorStop(0.35, '#FFD54A');
  spark.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = spark;
  ctx.beginPath();
  ctx.arc(size * 0.28, -size * 1.9, sparkR * 2, 0, TAU);
  ctx.fill();

  ctx.restore();
}
