import {
  clamp01,
  getGameMeta,
  paletteForSlot,
  type GameId,
  type GameTheme,
} from '@shared/index';
import { drawBomb, drawCreature, drawCrown } from '@/games/render/creature';

/**
 * Previews dos cards.
 *
 * Cada minijogo tem uma cena curta em loop que explica o conceito sem texto: o
 * jogador bate o olho e entende. As cenas são desenhadas no mesmo canvas e com
 * os mesmos personagens da partida real, então o preview nunca "mente" sobre o
 * jogo.
 *
 * Espaço lógico fixo de 320x180 — o componente escala para o tamanho do card.
 */

export const PREVIEW_W = 320;
export const PREVIEW_H = 180;

export interface PreviewInfo {
  ctx: CanvasRenderingContext2D;
  t: number;
  /** progresso do loop, 0..1 */
  p: number;
  /** true no primeiro frame depois do loop reiniciar */
  wrapped: boolean;
  theme: GameTheme;
  store: Record<string, unknown>;
}

export type PreviewScene = (info: PreviewInfo) => void;

const TAU = Math.PI * 2;

/** Progresso dentro de um trecho da linha do tempo. */
function seg(p: number, from: number, to: number): number {
  return clamp01((p - from) / (to - from));
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

function easeIn(t: number): number {
  const x = clamp01(t);
  return x * x;
}

function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function bob(t: number, amount = 2, speed = 6): number {
  return Math.sin(t * speed) * amount;
}

// ---------------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------------

function backdrop(ctx: CanvasRenderingContext2D, theme: GameTheme): void {
  const gradient = ctx.createLinearGradient(0, 0, PREVIEW_W, PREVIEW_H);
  gradient.addColorStop(0, theme.from);
  gradient.addColorStop(1, theme.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(40 + i * 110, 26 + (i % 2) * 18, 42, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function platform(
  ctx: CanvasRenderingContext2D,
  theme: GameTheme,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#1B1233';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.34, r * 1.02, r * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, TAU);
  ctx.fillStyle = theme.arena;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = theme.arenaEdge;
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.06, r * 0.72, r * 0.26, 0, 0, TAU);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function trail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: string,
  length = 34,
): void {
  const gradient = ctx.createLinearGradient(x, y, x - dx * length, y - dy * length);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dx * length, y - dy * length);
  ctx.stroke();
}

function burst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  color: string,
  count = 8,
  spread = 46,
): void {
  if (progress <= 0 || progress >= 1) return;
  const r = easeOut(progress) * spread;
  const alpha = 1 - progress;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU + progress * 1.4;
    const size = 4.5 * (1 - progress) + 1.2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r, size, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = alpha * 0.7;
  ctx.lineWidth = 3 * (1 - progress);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.1, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// PUSH!
// ---------------------------------------------------------------------------

const pushScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  const cx = 150;
  const cy = 112;
  const r = 84;
  platform(ctx, theme, cx, cy, r);

  const walk = seg(p, 0, 0.3);
  const dash = seg(p, 0.3, 0.42);
  const fly = seg(p, 0.42, 0.78);
  const cheer = seg(p, 0.46, 1);

  const ax = 82 + easeInOut(walk) * 26 + easeOut(dash) * 44 - easeOut(seg(p, 0.42, 0.55)) * 8;
  const ay = cy - 6 + bob(t, 2.2, 7);

  const bxStart = 176;
  const bx = bxStart + easeIn(fly) * 150;
  const by = cy - 14 - Math.sin(clamp01(fly) * Math.PI) * 54 + easeIn(fly) * 96;
  const bAlpha = 1 - clamp01(seg(p, 0.6, 0.78));
  const bScale = 1 - clamp01(fly) * 0.4;

  if (dash > 0 && dash < 1) {
    trail(ctx, ax, ay, 1, 0, 'rgba(255,255,255,0.75)', 40);
  }

  // vítima voando
  if (bAlpha > 0.01) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(easeIn(fly) * 3.4);
    drawCreature(ctx, {
      type: 'monstro',
      palette: paletteForSlot(1),
      x: 0,
      y: 0,
      r: 21 * bScale,
      t,
      squash: fly > 0 ? -0.35 + fly * 0.5 : 0,
      expression: fly > 0.02 ? 'scared' : 'idle',
      alpha: bAlpha,
      shadow: fly < 0.05,
      phase: 2,
    });
    ctx.restore();
  }

  // herói
  drawCreature(ctx, {
    type: 'blob',
    palette: paletteForSlot(0),
    x: ax,
    y: ay + (cheer > 0 ? -Math.abs(Math.sin(t * 7)) * 6 : 0),
    r: 22,
    t,
    vx: dash > 0 && dash < 1 ? 400 : walk > 0 && walk < 1 ? 120 : 0,
    squash: dash > 0 && dash < 1 ? 0.5 : 0,
    expression: cheer > 0.08 ? 'cheer' : 'happy',
    phase: 0,
  });

  burst(ctx, ax + 26, ay, seg(p, 0.42, 0.62), '#FFC93C', 9, 40);
};

// ---------------------------------------------------------------------------
// CROWN!
// ---------------------------------------------------------------------------

const crownScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);

  // piso do salão
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.moveTo(0, 118);
  ctx.lineTo(PREVIEW_W, 96);
  ctx.lineTo(PREVIEW_W, PREVIEW_H);
  ctx.lineTo(0, PREVIEW_H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = theme.arenaEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 118);
  ctx.lineTo(PREVIEW_W, 96);
  ctx.stroke();

  const chase = seg(p, 0, 0.62);
  const steal = seg(p, 0.62, 0.72);
  const escape = seg(p, 0.72, 1);

  const runnerX = 236 - easeInOut(chase) * 132 - easeOut(escape) * 40;
  const runnerY = 130 + Math.sin(p * 9) * 5;
  const chaserX = runnerX + 66 - easeOut(steal) * 34 + easeOut(escape) * 96;
  const chaserY = 136 + Math.sin(p * 9 + 1.2) * 5;

  const crownOnRunner = p < 0.66;
  const crownX = crownOnRunner ? runnerX : chaserX;
  const crownY = (crownOnRunner ? runnerY : chaserY) - 32;

  // perseguidor
  drawCreature(ctx, {
    type: 'gato',
    palette: paletteForSlot(2),
    x: chaserX,
    y: chaserY,
    r: 21,
    t,
    vx: -180,
    expression: escape > 0.05 ? 'cheer' : 'angry',
    phase: 1.4,
  });

  // portador
  drawCreature(ctx, {
    type: 'estrela',
    palette: paletteForSlot(3),
    x: runnerX,
    y: runnerY,
    r: 21,
    t,
    vx: -220,
    squash: steal > 0 && steal < 1 ? -0.4 : 0,
    expression: escape > 0.05 ? 'sad' : p > 0.4 ? 'scared' : 'happy',
    phase: 0.6,
  });

  drawCrown(ctx, crownX, crownY, 13, t);
  burst(ctx, runnerX, runnerY - 10, steal, '#FFF0B8', 10, 38);

  // medidor de tempo de coroa
  const meter = crownOnRunner ? easeInOut(chase) * 0.72 : 0.14;
  ctx.save();
  ctx.fillStyle = 'rgba(27,18,51,0.28)';
  ctx.beginPath();
  ctx.roundRect(20, 22, 130, 12, 6);
  ctx.fill();
  ctx.fillStyle = '#FFC93C';
  ctx.beginPath();
  ctx.roundRect(20, 22, 130 * meter, 12, 6);
  ctx.fill();
  ctx.restore();
};

// ---------------------------------------------------------------------------
// BOMB!
// ---------------------------------------------------------------------------

const bombScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  platform(ctx, theme, 160, 116, 96);

  const spots = [
    { x: 92, y: 108, type: 'blob' as const, slot: 0, phase: 0 },
    { x: 168, y: 84, type: 'robo' as const, slot: 4, phase: 1.1 },
    { x: 236, y: 116, type: 'monstro' as const, slot: 1, phase: 2.2 },
  ];

  const pass1 = seg(p, 0.24, 0.36);
  const pass2 = seg(p, 0.52, 0.64);
  const boom = seg(p, 0.82, 1);
  const holder = p < 0.3 ? 0 : p < 0.58 ? 1 : 2;

  // fuga dos outros
  const flee = easeOut(seg(p, 0.64, 0.92)) * 16;

  spots.forEach((spot, index) => {
    const isHolder = index === holder;
    const away = index === 2 ? 0 : index === 0 ? -flee : flee * 0.6;
    const gone = index === 2 ? clamp01(seg(p, 0.86, 1)) : 0;
    drawCreature(ctx, {
      type: spot.type,
      palette: paletteForSlot(spot.slot),
      x: spot.x + away,
      y: spot.y - (isHolder ? Math.abs(Math.sin(t * 9)) * 3 : 0),
      r: 21 * (1 - gone * 0.5),
      t,
      vx: away * 12,
      squash: isHolder ? -0.12 : 0,
      expression: gone > 0.05 ? 'dizzy' : isHolder ? 'scared' : p > 0.6 ? 'happy' : 'idle',
      alpha: 1 - gone,
      phase: spot.phase,
    });
  });

  // bomba: pousada ou em arco entre dois jogadores
  let bx: number;
  let by: number;
  if (pass1 > 0 && pass1 < 1) {
    bx = spots[0].x + (spots[1].x - spots[0].x) * pass1;
    by = spots[0].y - 34 + (spots[1].y - spots[0].y) * pass1 - Math.sin(pass1 * Math.PI) * 30;
  } else if (pass2 > 0 && pass2 < 1) {
    bx = spots[1].x + (spots[2].x - spots[1].x) * pass2;
    by = spots[1].y - 34 + (spots[2].y - spots[1].y) * pass2 - Math.sin(pass2 * Math.PI) * 30;
  } else {
    bx = spots[holder].x;
    by = spots[holder].y - 34;
  }

  const fuse = 1 - p / 0.86;
  if (boom <= 0) drawBomb(ctx, bx, by, 11, t, Math.max(0, fuse));

  if (boom > 0) {
    burst(ctx, spots[2].x, spots[2].y - 12, boom, '#FFC93C', 12, 70);
    burst(ctx, spots[2].x, spots[2].y - 12, clamp01(boom * 1.4), '#FF7A59', 8, 52);
  }
};

// ---------------------------------------------------------------------------
// PAINT!
// ---------------------------------------------------------------------------

const PAINT_COLS = 16;
const PAINT_ROWS = 9;
const PAINT_CELL = PREVIEW_W / PAINT_COLS;

const paintScene: PreviewScene = ({ ctx, t, p, wrapped, theme, store }) => {
  if (!store.cells || wrapped) {
    store.cells = new Uint8Array(PAINT_COLS * PAINT_ROWS);
  }
  const cells = store.cells as Uint8Array;

  ctx.fillStyle = theme.arena;
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

  // dois pintores em rotas cruzadas
  const painters = [
    {
      slot: 2,
      type: 'blob' as const,
      x: 40 + Math.sin(p * TAU) * 78 + p * 90,
      y: 52 + Math.sin(p * TAU * 1.6) * 26,
    },
    {
      slot: 1,
      type: 'fantasma' as const,
      x: 280 - Math.cos(p * TAU * 1.1) * 74 - p * 70,
      y: 132 - Math.sin(p * TAU * 1.3) * 30,
    },
  ];

  for (const painter of painters) {
    const owner = painter.slot + 1;
    const col = Math.floor(painter.x / PAINT_CELL);
    const row = Math.floor(painter.y / PAINT_CELL);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const c = col + dx;
        const rw = row + dy;
        if (c < 0 || c >= PAINT_COLS || rw < 0 || rw >= PAINT_ROWS) continue;
        if (dx !== 0 && dy !== 0) continue;
        cells[rw * PAINT_COLS + c] = owner;
      }
    }
  }

  for (let row = 0; row < PAINT_ROWS; row += 1) {
    for (let col = 0; col < PAINT_COLS; col += 1) {
      const owner = cells[row * PAINT_COLS + col];
      if (owner === 0) continue;
      const palette = paletteForSlot(owner - 1);
      ctx.fillStyle = palette.base;
      const x = col * PAINT_CELL;
      const y = row * PAINT_CELL;
      ctx.beginPath();
      ctx.roundRect(x + 0.6, y + 0.6, PAINT_CELL - 1.2, PAINT_CELL - 1.2, 5);
      ctx.fill();
    }
  }

  // grade sutil por cima
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1;
  for (let col = 1; col < PAINT_COLS; col += 1) {
    ctx.beginPath();
    ctx.moveTo(col * PAINT_CELL, 0);
    ctx.lineTo(col * PAINT_CELL, PREVIEW_H);
    ctx.stroke();
  }
  for (let row = 1; row < PAINT_ROWS; row += 1) {
    ctx.beginPath();
    ctx.moveTo(0, row * PAINT_CELL);
    ctx.lineTo(PREVIEW_W, row * PAINT_CELL);
    ctx.stroke();
  }
  ctx.restore();

  painters.forEach((painter, index) => {
    drawCreature(ctx, {
      type: painter.type,
      palette: paletteForSlot(painter.slot),
      x: painter.x,
      y: painter.y,
      r: 19,
      t,
      vx: index === 0 ? 160 : -160,
      expression: 'happy',
      phase: index * 1.7,
    });
  });

  // placar de porcentagem
  let a = 0;
  let b = 0;
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] === 3) a += 1;
    else if (cells[i] === 2) b += 1;
  }
  const total = cells.length;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath();
  ctx.roundRect(12, 12, 120, 16, 8);
  ctx.fill();
  ctx.fillStyle = paletteForSlot(2).base;
  ctx.beginPath();
  ctx.roundRect(14, 14, 116 * (a / total), 12, 6);
  ctx.fill();
  ctx.fillStyle = paletteForSlot(1).base;
  ctx.beginPath();
  ctx.roundRect(14 + 116 * (a / total), 14, 116 * (b / total), 12, 6);
  ctx.fill();
  ctx.restore();
};

// ---------------------------------------------------------------------------
// DON'T FALL!
// ---------------------------------------------------------------------------

const FALL_COLS = 6;
const FALL_ROWS = 3;
const FALL_TILE = 44;
const FALL_GAP = 5;

const dontFallScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);

  const gridW = FALL_COLS * (FALL_TILE + FALL_GAP) - FALL_GAP;
  const gridH = FALL_ROWS * (FALL_TILE + FALL_GAP) - FALL_GAP;
  const ox = (PREVIEW_W - gridW) / 2;
  const oy = (PREVIEW_H - gridH) / 2 + 6;

  const runnerP = easeInOut(seg(p, 0.05, 0.85));
  const runnerX = ox + 22 + runnerP * (gridW - 44);
  const runnerRow = 1;
  const runnerY = oy + runnerRow * (FALL_TILE + FALL_GAP) + FALL_TILE / 2 - 16;

  for (let row = 0; row < FALL_ROWS; row += 1) {
    for (let col = 0; col < FALL_COLS; col += 1) {
      const x = ox + col * (FALL_TILE + FALL_GAP);
      const y = oy + row * (FALL_TILE + FALL_GAP);

      // o bloco pisado racha e cai pouco depois
      let life = 1;
      if (row === runnerRow) {
        const passAt = 0.05 + (col / (FALL_COLS - 1)) * 0.8;
        life = 1 - clamp01((p - passAt - 0.06) / 0.34);
      } else if (row === 2 && col === 4) {
        life = 1 - clamp01((p - 0.5) / 0.3);
      }
      if (life <= 0) continue;

      const fall = 1 - life;
      ctx.save();
      ctx.globalAlpha = life;
      ctx.translate(x + FALL_TILE / 2, y + FALL_TILE / 2 + fall * fall * 60);
      ctx.rotate(fall * 0.5);
      ctx.beginPath();
      ctx.roundRect(-FALL_TILE / 2, -FALL_TILE / 2, FALL_TILE, FALL_TILE, 10);
      ctx.fillStyle = life > 0.7 ? theme.arena : life > 0.4 ? '#FFE38C' : '#FF9BC6';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.arenaEdge;
      ctx.stroke();
      if (life < 0.85) {
        ctx.strokeStyle = 'rgba(75,16,80,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -12);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-8, 8);
        ctx.moveTo(4, -10);
        ctx.lineTo(10, 4);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // quem caiu com o bloco
  const dropP = clamp01(seg(p, 0.56, 0.92));
  if (dropP < 1) {
    const dx = ox + 4 * (FALL_TILE + FALL_GAP) + FALL_TILE / 2;
    const dy = oy + 2 * (FALL_TILE + FALL_GAP) + FALL_TILE / 2 - 16;
    ctx.save();
    ctx.translate(dx, dy + easeIn(dropP) * 90);
    ctx.rotate(dropP * 2.2);
    drawCreature(ctx, {
      type: 'monstro',
      palette: paletteForSlot(1),
      x: 0,
      y: 0,
      r: 19 * (1 - dropP * 0.35),
      t,
      expression: dropP > 0.05 ? 'scared' : 'idle',
      alpha: 1 - dropP * 0.9,
      shadow: dropP < 0.05,
      phase: 2,
    });
    ctx.restore();
  }

  // corredor
  const jump = Math.abs(Math.sin(p * 18)) * 4;
  drawCreature(ctx, {
    type: 'robo',
    palette: paletteForSlot(4),
    x: runnerX,
    y: runnerY - jump,
    r: 19,
    t,
    vx: 200,
    squash: jump > 3 ? 0.2 : 0,
    expression: 'happy',
    phase: 0.4,
  });
};

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cenas da segunda leva
// ---------------------------------------------------------------------------

/** Estrelinha simples usada no preview do COLETA!. */
function tinyStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  gold: boolean,
  spin: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * TAU - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = gold ? '#FFC93C' : '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = gold ? '#6B3D00' : '#B98A00';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

const coletaScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();

  const grab = seg(p, 0.55, 0.68);
  const goldGone = grab > 0.5;

  // estrelas comuns espalhadas
  const commons = [
    [66, 52],
    [250, 62],
    [92, 132],
    [232, 136],
  ];
  commons.forEach(([sx, sy], index) => {
    const taken = p > 0.2 + index * 0.16 && p < 0.9;
    if (taken) return;
    tinyStar(ctx, sx, sy, 9, false, t * 1.2 + index);
  });

  // dourada no centro: o momento de disputa
  if (!goldGone) tinyStar(ctx, 160, 92, 15, true, t * 2.2);

  const runnerX = 96 + easeInOut(seg(p, 0.1, 0.62)) * 56;
  const rivalX = 224 - easeInOut(seg(p, 0.1, 0.62)) * 44;

  drawCreature(ctx, {
    type: 'gato',
    palette: paletteForSlot(2),
    x: rivalX,
    y: 104,
    r: 20,
    t,
    vx: -140,
    expression: goldGone ? 'sad' : 'angry',
    phase: 1.2,
  });
  drawCreature(ctx, {
    type: 'blob',
    palette: paletteForSlot(0),
    x: runnerX,
    y: 96,
    r: 21,
    t,
    vx: 160,
    expression: goldGone ? 'cheer' : 'happy',
    phase: 0,
  });

  burst(ctx, 160, 92, grab, '#FFC93C', 10, 40);
  if (goldGone) {
    ctx.save();
    ctx.globalAlpha = 1 - clamp01(seg(p, 0.68, 0.95));
    ctx.font = '800 26px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(30,20,64,0.8)';
    ctx.strokeText('+3', 160, 64 - easeOut(seg(p, 0.68, 0.95)) * 20);
    ctx.fillStyle = '#FFC93C';
    ctx.fillText('+3', 160, 64 - easeOut(seg(p, 0.68, 0.95)) * 20);
    ctx.restore();
  }
};

const zonaScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();

  const push = seg(p, 0.52, 0.64);
  const contested = p > 0.34 && p < 0.58;

  // zona
  ctx.save();
  const zone = ctx.createRadialGradient(160, 96, 10, 160, 96, 62);
  zone.addColorStop(0, contested ? 'rgba(255,92,163,0.5)' : 'rgba(255,255,255,0.55)');
  zone.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = zone;
  ctx.beginPath();
  ctx.arc(160, 96, 62, 0, TAU);
  ctx.fill();
  ctx.setLineDash([16, 12]);
  ctx.lineDashOffset = -t * 30;
  ctx.lineWidth = 5;
  ctx.strokeStyle = contested ? '#FF5CA3' : theme.from;
  ctx.beginPath();
  ctx.arc(160, 96, 62, 0, TAU);
  ctx.stroke();
  ctx.restore();

  const holderX = 150;
  const invaderX = 250 - easeInOut(seg(p, 0.08, 0.52)) * 68 + easeOut(push) * 96;

  drawCreature(ctx, {
    type: 'estrela',
    palette: paletteForSlot(3),
    x: invaderX,
    y: 104,
    r: 20,
    t,
    vx: push > 0 ? 420 : -150,
    squash: push > 0 && push < 1 ? -0.5 : 0,
    expression: push > 0.1 ? 'dizzy' : 'angry',
    phase: 1.6,
  });
  drawCreature(ctx, {
    type: 'monstro',
    palette: paletteForSlot(1),
    x: holderX,
    y: 96,
    r: 21,
    t,
    vx: push > 0 && push < 1 ? 240 : 0,
    squash: push > 0 && push < 1 ? 0.45 : 0,
    expression: contested ? 'angry' : 'cheer',
    phase: 0.4,
  });

  burst(ctx, 200, 100, push, '#FFFFFF', 8, 34);

  // medidor de domínio
  const meter = contested ? 0.32 : clamp01(0.32 + seg(p, 0.64, 1) * 0.6);
  ctx.fillStyle = 'rgba(27,18,51,0.3)';
  ctx.beginPath();
  ctx.roundRect(110, 156, 100, 10, 5);
  ctx.fill();
  ctx.fillStyle = contested ? '#FF5CA3' : '#FFC93C';
  ctx.beginPath();
  ctx.roundRect(110, 156, 100 * meter, 10, 5);
  ctx.fill();
};

const paredeScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();

  // parede atravessando com uma passagem
  const wallX = -30 + p * (PREVIEW_W + 60);
  const gapY = 104;
  const gapH = 52;

  const drawSegment = (y: number, h: number): void => {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(wallX - 13, y, 26, h, 13);
    const body = ctx.createLinearGradient(wallX - 13, 0, wallX + 13, 0);
    body.addColorStop(0, '#B79BFF');
    body.addColorStop(1, '#5A2FD8');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#2B1466';
    ctx.stroke();
    ctx.restore();
  };
  drawSegment(24, gapY - gapH / 2 - 24);
  drawSegment(gapY + gapH / 2, 156 - (gapY + gapH / 2));

  // quem acerta a passagem
  const safeX = 96;
  drawCreature(ctx, {
    type: 'robo',
    palette: paletteForSlot(4),
    x: safeX,
    y: gapY,
    r: 19,
    t,
    vx: 0,
    expression: Math.abs(wallX - safeX) < 40 ? 'scared' : 'happy',
    phase: 0.7,
  });

  // quem toma a parede
  const hitX = 210;
  const hit = Math.abs(wallX - hitX) < 24;
  const knocked = clamp01(seg(p, 0.62, 0.86));
  drawCreature(ctx, {
    type: 'blob',
    palette: paletteForSlot(1),
    x: hitX + knocked * 44,
    y: 62 + knocked * 8,
    r: 19,
    t,
    vx: knocked > 0 ? 300 : 0,
    squash: hit ? -0.6 : 0,
    expression: knocked > 0.05 ? 'dizzy' : 'scared',
    phase: 2,
  });
  burst(ctx, hitX, 62, seg(p, 0.6, 0.8), '#FFC93C', 8, 30);
};

const golScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(160, 92, 34, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // gol à direita
  const goalX = 282;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = paletteForSlot(1).base;
  ctx.beginPath();
  ctx.arc(goalX, 92, 30, 0, TAU);
  ctx.stroke();
  ctx.restore();

  const kick = seg(p, 0.3, 0.42);
  const travel = easeOut(seg(p, 0.36, 0.72));
  const scored = travel > 0.92;
  const ballX = 150 + travel * (goalX - 150);
  const ballY = 92 - Math.sin(travel * Math.PI) * 14;

  const shooterX = 108 + easeInOut(seg(p, 0.05, 0.36)) * 22 + (kick > 0 ? easeOut(kick) * 16 : 0);
  drawCreature(ctx, {
    type: 'monstro',
    palette: paletteForSlot(2),
    x: shooterX,
    y: 100,
    r: 21,
    t,
    vx: 200,
    squash: kick > 0 && kick < 1 ? 0.5 : 0,
    expression: scored ? 'cheer' : 'angry',
    phase: 0.3,
  });

  // goleiro
  drawCreature(ctx, {
    type: 'fantasma',
    palette: paletteForSlot(1),
    x: 240,
    y: 92 + Math.sin(p * TAU) * 16,
    r: 19,
    t,
    vy: 60,
    expression: scored ? 'sad' : 'scared',
    phase: 1.9,
  });

  if (!scored) {
    ctx.save();
    ctx.translate(ballX, ballY);
    ctx.rotate(travel * 9);
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#25304A';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(3, -2, 3.4, 0, TAU);
    ctx.fillStyle = '#25304A';
    ctx.fill();
    ctx.restore();
  }
  burst(ctx, goalX, 92, seg(p, 0.7, 0.9), '#2BD9A8', 10, 40);
};

const corridaScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();

  const touch = seg(p, 0.6, 0.7);
  const ringX = touch > 0.5 ? 82 : 236;
  const ringY = touch > 0.5 ? 60 : 104;

  ctx.save();
  ctx.translate(ringX, ringY);
  ctx.rotate(t * 1.2);
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 8;
  ctx.strokeStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, TAU);
  ctx.stroke();
  ctx.restore();

  const lead = easeInOut(seg(p, 0.05, 0.62));
  const leadX = 88 + lead * 128;
  const chaseX = 58 + lead * 118;

  trail(ctx, leadX - 14, 108, 1, 0, 'rgba(255,255,255,0.6)', 30);
  drawCreature(ctx, {
    type: 'estrela',
    palette: paletteForSlot(3),
    x: chaseX,
    y: 116,
    r: 19,
    t,
    vx: 240,
    expression: 'angry',
    phase: 1.1,
  });
  drawCreature(ctx, {
    type: 'gato',
    palette: paletteForSlot(0),
    x: leadX,
    y: 104,
    r: 20,
    t,
    vx: 320,
    expression: touch > 0.3 ? 'cheer' : 'happy',
    phase: 0.2,
  });
  burst(ctx, 236, 104, touch, theme.accent, 9, 36);
};

const CORES_PREVIEW = ['#FF4D5E', '#3FC6FF', '#FFC93C', '#2BD9A8', '#8F66FF', '#FF7A59'];

const coresScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  const called = 1;
  const cols = 3;
  const rows = 2;
  const w = (PREVIEW_W - 32) / cols;
  const h = (PREVIEW_H - 46) / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const isCalled = index === called;
      ctx.save();
      ctx.globalAlpha = isCalled ? 1 : 0.75;
      ctx.beginPath();
      ctx.roundRect(16 + col * w + 3, 26 + row * h + 3, w - 6, h - 6, 14);
      ctx.fillStyle = CORES_PREVIEW[index];
      ctx.fill();
      if (isCalled) {
        ctx.globalAlpha = 0.5 + Math.abs(Math.sin(t * 7)) * 0.5;
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // corrida até o bloco chamado (centro superior)
  const targetX = 16 + w * 1.5;
  const targetY = 26 + h * 0.5;
  const run = easeInOut(seg(p, 0.12, 0.72));

  drawCreature(ctx, {
    type: 'blob',
    palette: paletteForSlot(0),
    x: 74 + run * (targetX - 90),
    y: 128 - run * (128 - targetY),
    r: 19,
    t,
    vx: 220,
    expression: run > 0.9 ? 'cheer' : 'scared',
    phase: 0.5,
  });
  drawCreature(ctx, {
    type: 'robo',
    palette: paletteForSlot(4),
    x: 246 - run * 40,
    y: 132,
    r: 18,
    t,
    vx: -160,
    expression: p > 0.85 ? 'sad' : 'scared',
    phase: 1.7,
  });

  ctx.save();
  ctx.font = '800 22px "Baloo 2", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(30,20,64,0.85)';
  ctx.strokeText('AZUL!', 160, 172);
  ctx.fillStyle = CORES_PREVIEW[called];
  ctx.fillText('AZUL!', 160, 172);
  ctx.restore();
};

const raioScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();

  const cx = 160;
  const cy = 94;
  const angle = p * TAU;

  // feixe girando
  for (const offset of [0, Math.PI]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + offset);
    const glow = ctx.createLinearGradient(0, -14, 0, 14);
    glow.addColorStop(0, 'rgba(255,92,163,0)');
    glow.addColorStop(0.5, 'rgba(255,92,163,0.6)');
    glow.addColorStop(1, 'rgba(255,92,163,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, -14, 170, 28);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, -6, 170, 12, 6);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  const core = ctx.createRadialGradient(cx, cy, 2, cx, cy, 24);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(1, 'rgba(143,102,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, TAU);
  ctx.fill();
  ctx.restore();

  // dançando no vão
  const dodgeAngle = angle + Math.PI / 2 + 0.5;
  drawCreature(ctx, {
    type: 'fantasma',
    palette: paletteForSlot(2),
    x: cx + Math.cos(dodgeAngle) * 92,
    y: cy + Math.sin(dodgeAngle) * 52,
    r: 19,
    t,
    vx: -Math.sin(dodgeAngle) * 200,
    expression: 'scared',
    phase: 0.9,
  });
  const hitAngle = angle - 0.12;
  const hit = Math.abs(Math.sin((p - 0.5) * Math.PI)) > 0.985;
  drawCreature(ctx, {
    type: 'monstro',
    palette: paletteForSlot(1),
    x: cx + Math.cos(hitAngle) * 108,
    y: cy + Math.sin(hitAngle) * 58,
    r: 18,
    t,
    squash: hit ? -0.6 : 0,
    expression: hit ? 'dizzy' : 'happy',
    phase: 2.3,
  });
};

const minaScene: PreviewScene = ({ ctx, t, p, wrapped, theme, store }) => {
  backdrop(ctx, theme);
  const cols = 7;
  const rows = 4;
  const w = (PREVIEW_W - 36) / cols;
  const h = (PREVIEW_H - 48) / rows;

  if (!store.revealed || wrapped) store.revealed = new Set<number>();
  const revealed = store.revealed as Set<number>;

  // caminho do jogador revelando blocos
  const path = [16, 17, 18, 11, 12, 13, 6];
  const step = Math.floor(p * (path.length + 2));
  for (let i = 0; i < Math.min(step, path.length); i += 1) revealed.add(path[i]);

  const boomIndex = 13;
  const boom = revealed.has(boomIndex) ? clamp01(seg(p, 0.62, 0.8)) : 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const x = 18 + col * w;
      const y = 28 + row * h;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 8);
      if (!revealed.has(index)) {
        const closed = ctx.createLinearGradient(0, y, 0, y + h);
        closed.addColorStop(0, '#FFE8BF');
        closed.addColorStop(1, '#E8B978');
        ctx.fillStyle = closed;
      } else if (index === boomIndex) {
        ctx.fillStyle = '#3B1B0B';
      } else {
        ctx.fillStyle = paletteForSlot(0).base;
        ctx.globalAlpha = 0.9;
      }
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(107,61,0,0.3)';
      ctx.stroke();
      ctx.restore();
    }
  }

  const walkT = clamp01(p / 0.62);
  const walkX = 40 + walkT * 160;
  drawCreature(ctx, {
    type: 'robo',
    palette: paletteForSlot(0),
    x: walkX,
    y: 96,
    r: 18,
    t,
    vx: 140,
    squash: boom > 0 && boom < 1 ? -0.6 : 0,
    expression: boom > 0.05 ? 'dizzy' : 'happy',
    phase: 0.6,
  });

  if (boom > 0) burst(ctx, walkX, 96, boom, '#FF7A59', 12, 52);
};

const rastroScene: PreviewScene = ({ ctx, t, p, wrapped, theme, store }) => {
  backdrop(ctx, theme);
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();

  if (!store.dots || wrapped) store.dots = [];
  const dots = store.dots as { x: number; y: number; slot: number }[];

  // duas rotas em espiral: uma fecha a outra
  const a = { x: 160 + Math.cos(p * TAU * 1.6) * 92, y: 96 + Math.sin(p * TAU * 1.6) * 52 };
  const b = { x: 160 + Math.cos(p * TAU * 1.6 + 2.2) * 62, y: 96 + Math.sin(p * TAU * 1.6 + 2.2) * 34 };
  if (dots.length < 200) {
    dots.push({ x: a.x, y: a.y, slot: 4 });
    dots.push({ x: b.x, y: b.y, slot: 1 });
  }

  dots.forEach((dot, index) => {
    const palette = paletteForSlot(dot.slot);
    const fade = clamp01(index / Math.max(1, dots.length));
    ctx.save();
    ctx.globalAlpha = 0.25 + fade * 0.55;
    ctx.fillStyle = palette.base;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 6, 0, TAU);
    ctx.fill();
    ctx.restore();
  });

  const crash = seg(p, 0.82, 0.92);
  drawCreature(ctx, {
    type: 'monstro',
    palette: paletteForSlot(1),
    x: b.x,
    y: b.y,
    r: 17,
    t,
    squash: crash > 0 && crash < 1 ? -0.6 : 0,
    expression: crash > 0.05 ? 'dizzy' : 'scared',
    phase: 1.4,
  });
  drawCreature(ctx, {
    type: 'estrela',
    palette: paletteForSlot(4),
    x: a.x,
    y: a.y,
    r: 18,
    t,
    expression: 'happy',
    phase: 0.2,
  });
  if (crash > 0) burst(ctx, b.x, b.y, crash, '#FFFFFF', 8, 30);
};

const meteoroScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();

  // sombra crescendo e impacto
  const warn = clamp01(p / 0.55);
  const impact = clamp01(seg(p, 0.55, 0.72));
  const shadowX = 190;
  const shadowY = 104;
  const radius = 44;

  if (impact <= 0) {
    ctx.save();
    ctx.globalAlpha = 0.25 + warn * 0.4;
    ctx.fillStyle = 'rgba(20,10,45,0.6)';
    ctx.beginPath();
    ctx.arc(shadowX, shadowY, radius * (0.5 + warn * 0.5), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = -t * 30;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#FFC93C';
    ctx.beginPath();
    ctx.arc(shadowX, shadowY, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // a pedra caindo
    ctx.save();
    ctx.translate(shadowX, shadowY - (1 - warn) * 150);
    ctx.rotate(warn * 5);
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, TAU);
    const rock = ctx.createRadialGradient(-5, -5, 3, 0, 0, 15);
    rock.addColorStop(0, '#FFB27A');
    rock.addColorStop(1, '#3C1508');
    ctx.fillStyle = rock;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2A0E05';
    ctx.stroke();
    ctx.restore();
  } else {
    burst(ctx, shadowX, shadowY, impact, '#FFC93C', 14, 64);
  }

  // fugindo da sombra
  const flee = easeOut(clamp01(seg(p, 0.3, 0.8)));
  drawCreature(ctx, {
    type: 'gato',
    palette: paletteForSlot(2),
    x: shadowX - 30 - flee * 74,
    y: shadowY + 4,
    r: 19,
    t,
    vx: -260,
    expression: 'scared',
    phase: 0.8,
  });
  // e quem não saiu
  if (impact > 0) {
    drawCreature(ctx, {
      type: 'blob',
      palette: paletteForSlot(1),
      x: shadowX + 26,
      y: shadowY + 8,
      r: 18 * (1 - impact * 0.3),
      t,
      squash: -0.6,
      expression: 'dizzy',
      alpha: 1 - impact * 0.4,
      phase: 2.1,
    });
  }
};

// ---------------------------------------------------------------------------
// Terceira leva
// ---------------------------------------------------------------------------

/** Piso retangular usado pela maioria das cenas. */
function floorPanel(ctx: CanvasRenderingContext2D, theme: GameTheme): void {
  ctx.fillStyle = theme.arena;
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.fill();
}

/** Aura de caçador em escala de preview. */
function auraMark(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  const halo = ctx.createRadialGradient(x, y, 4, x, y, 34);
  halo.addColorStop(0, 'rgba(18,8,41,0.6)');
  halo.addColorStop(1, 'rgba(18,8,41,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, 34, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(143,102,255,0.8)';
  ctx.beginPath();
  ctx.arc(x, y, 23, t * 2, t * 2 + Math.PI * 1.2);
  ctx.stroke();
  ctx.restore();
}

const sombraScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  const tag = seg(p, 0.48, 0.6);
  const chase = easeInOut(clamp01(p / 0.5));
  const after = easeOut(seg(p, 0.6, 1));

  // caçador original
  const h1 = { x: 46 + chase * 74 + after * 70, y: 118 - after * 14 };
  // presa que vira caçador no meio da cena
  const prey = { x: 132 + after * 62, y: 112 - after * 10 };
  // último fugitivo
  const runner = { x: 226 + after * 52, y: 72 - after * 6 };

  auraMark(ctx, h1.x, h1.y, t);
  if (tag > 0.35) auraMark(ctx, prey.x, prey.y, t + 1.4);

  trail(ctx, h1.x, h1.y, -1, 0.1, 'rgba(143,102,255,0.55)', 28);

  drawCreature(ctx, {
    type: 'caveira',
    palette: paletteForSlot(0),
    x: h1.x,
    y: h1.y,
    r: 18,
    t,
    vx: 210,
    expression: 'angry',
    phase: 0.4,
  });
  drawCreature(ctx, {
    type: 'sapo',
    palette: paletteForSlot(2),
    x: prey.x,
    y: prey.y + bob(t, 1.5, 7),
    r: 18,
    t,
    vx: tag > 0.5 ? 200 : -120,
    squash: tag > 0 && tag < 1 ? -0.55 : 0,
    expression: tag > 0.4 ? 'angry' : 'scared',
    phase: 1.6,
  });
  drawCreature(ctx, {
    type: 'coelho',
    palette: paletteForSlot(3),
    x: runner.x,
    y: runner.y + bob(t, 2, 8),
    r: 18,
    t,
    vx: 240,
    expression: 'scared',
    phase: 2.4,
  });

  if (tag > 0 && tag < 1) burst(ctx, prey.x, prey.y, tag, '#8F66FF', 10, 40);
};

const buracoScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  const cx = 150;
  const cy = 100;

  // anéis correndo para dentro
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 2;
  for (let ring = 1; ring <= 4; ring += 1) {
    const r = 24 + ring * 26 - ((t * 22) % 26);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // buraco
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 1.6);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#3FC6FF';
  ctx.setLineDash([12, 9]);
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const well = ctx.createRadialGradient(cx, cy, 2, cx, cy, 24);
  well.addColorStop(0, '#000000');
  well.addColorStop(1, 'rgba(11,4,32,0.6)');
  ctx.fillStyle = well;
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, TAU);
  ctx.fill();

  // um cai em espiral
  const fall = clamp01(p / 0.78);
  const angle = fall * TAU * 1.9;
  const radius = 84 * (1 - easeIn(fall));
  const fx = cx + Math.cos(angle) * radius;
  const fy = cy + Math.sin(angle) * radius * 0.82;
  if (fall < 0.99) {
    drawCreature(ctx, {
      type: 'pao',
      palette: paletteForSlot(1),
      x: fx,
      y: fy,
      r: 18 * (1 - fall * 0.7),
      t,
      vx: -Math.sin(angle) * 200,
      vy: Math.cos(angle) * 200,
      expression: 'scared',
      alpha: 1 - fall * 0.4,
      phase: 1.2,
    });
  } else {
    burst(ctx, cx, cy, seg(p, 0.78, 0.92), '#8F66FF', 10, 36);
  }

  // o outro escapa de dash
  const escape = easeOut(clamp01(seg(p, 0.25, 0.85)));
  const ex = cx + 62 + escape * 82;
  const ey = cy + 34;
  trail(ctx, ex, ey, 1, 0, 'rgba(63,198,255,0.6)', 40);
  drawCreature(ctx, {
    type: 'pinguim',
    palette: paletteForSlot(4),
    x: ex,
    y: ey,
    r: 18,
    t,
    vx: 320,
    squash: 0.4,
    expression: 'happy',
    phase: 0.9,
  });
};

const pesoScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  platform(ctx, theme, 150, 112, 118);

  const grab = seg(p, 0.16, 0.3);
  const charge = easeIn(clamp01(seg(p, 0.42, 0.68)));
  const hit = seg(p, 0.68, 0.78);
  const fly = easeOut(seg(p, 0.7, 1));

  // haltere no chão (desaparece quando é pego)
  if (grab < 1) {
    const hx = 118;
    const hy = 104;
    ctx.save();
    ctx.translate(hx, hy + bob(t, 1.5, 3));
    ctx.rotate(-0.2);
    ctx.fillStyle = '#D9E6F2';
    ctx.beginPath();
    ctx.roundRect(-13, -3, 26, 6, 3);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(side * 13 - 5, -11, 10, 22, 4);
      ctx.fillStyle = '#FFC93C';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6B3D00';
      ctx.stroke();
    }
    ctx.restore();
  }

  const heavyX = 88 + charge * 62;
  const heavyY = 106;

  // gomos de carga em volta do pesado
  if (grab > 0.4) {
    ctx.save();
    for (let i = 0; i < 5; i += 1) {
      const start = -Math.PI / 2 + i * (TAU / 5) + 0.08;
      ctx.beginPath();
      ctx.arc(heavyX, heavyY, 27, start, start + TAU / 5 - 0.16);
      ctx.lineWidth = i < 3 ? 5 : 2;
      ctx.strokeStyle = i < 3 ? '#FFC93C' : 'rgba(255,255,255,0.3)';
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCreature(ctx, {
    type: 'capivara',
    palette: paletteForSlot(3),
    x: heavyX,
    y: heavyY,
    r: 20,
    t,
    vx: charge * 260,
    squash: hit > 0 && hit < 1 ? -0.4 : 0,
    expression: charge > 0.3 ? 'angry' : 'happy',
    phase: 0.5,
  });

  // o leve toma o arremesso e sai voando da plataforma
  const lightX = 178 + fly * 120;
  const lightY = 104 - fly * 18 + fly * fly * 90;
  drawCreature(ctx, {
    type: 'nuvem',
    palette: paletteForSlot(1),
    x: lightX,
    y: lightY,
    r: 18 * (1 - fly * 0.3),
    t,
    vx: fly * 420,
    squash: hit > 0 && hit < 1 ? -0.7 : 0.3,
    expression: fly > 0.05 ? 'dizzy' : 'scared',
    alpha: 1 - fly * 0.5,
    phase: 1.8,
  });
  if (hit > 0 && hit < 1) burst(ctx, 168, 104, hit, '#FFFFFF', 10, 44);
};

const ladraoScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  const steal = seg(p, 0.46, 0.58);
  const deposit = seg(p, 0.84, 0.96);

  // cofre
  const vx = 262;
  const vy = 60;
  ctx.save();
  const halo = ctx.createRadialGradient(vx, vy, 4, vx, vy, 40);
  halo.addColorStop(0, 'rgba(43,217,168,0.55)');
  halo.addColorStop(1, 'rgba(43,217,168,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(vx, vy, 40, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(vx, vy, 24, 0, TAU);
  ctx.fillStyle = '#2BD9A8';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#0A5741';
  ctx.stroke();
  ctx.save();
  ctx.translate(vx, vy);
  ctx.rotate(t * 0.9);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0A5741';
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 11, Math.sin(angle) * 11);
    ctx.lineTo(-Math.cos(angle) * 11, -Math.sin(angle) * 11);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();

  // moedas ainda no chão
  const coins = [
    { x: 74, y: 128, at: 0.12 },
    { x: 112, y: 96, at: 0.26 },
    { x: 150, y: 132, at: 0.4 },
  ];
  for (const coin of coins) {
    if (p > coin.at) continue;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(coin.x, coin.y + bob(t, 1.6, 5), 8 * Math.abs(Math.cos(t * 2.4 + coin.x)), 8, 0, 0, TAU);
    ctx.fillStyle = '#FFC93C';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6B3D00';
    ctx.stroke();
    ctx.restore();
  }

  const collected = coins.filter((coin) => p > coin.at).length;

  // vítima: junta moedas e perde tudo no toque
  const victimX = 62 + easeInOut(clamp01(p / 0.46)) * 96;
  const victimY = 118;
  const bag = steal > 0.4 ? 0 : collected;

  // ladrão: entra correndo, rouba e vai para o cofre
  const thiefIn = easeIn(clamp01(seg(p, 0.16, 0.5)));
  const thiefOut = easeOut(clamp01(seg(p, 0.58, 0.9)));
  const thiefX = 232 - thiefIn * 62 + thiefOut * (vx - 170);
  const thiefY = 130 - thiefOut * 52;

  const stacks: [number, number, number][] = [
    [victimX, victimY - 34, bag],
    [thiefX, thiefY - 34, steal > 0.4 ? (deposit > 0.5 ? 0 : collected) : 0],
  ];

  trail(ctx, thiefX, thiefY, thiefOut > 0 ? -0.6 : 1, thiefOut > 0 ? 0.6 : 0, 'rgba(255,92,163,0.5)', 26);

  drawCreature(ctx, {
    type: 'jacare',
    palette: paletteForSlot(1),
    x: thiefX,
    y: thiefY,
    r: 19,
    t,
    vx: thiefOut > 0 ? -260 : 260,
    vy: thiefOut > 0 ? -160 : 0,
    expression: steal > 0.4 ? 'happy' : 'angry',
    phase: 0.7,
  });
  drawCreature(ctx, {
    type: 'ovo',
    palette: paletteForSlot(4),
    x: victimX,
    y: victimY,
    r: 19,
    t,
    vx: 120,
    squash: steal > 0 && steal < 1 ? -0.6 : 0,
    expression: steal > 0.3 ? 'sad' : 'happy',
    phase: 1.9,
  });

  // pilha de moedas na mão de cada um
  for (const [sx, sy, count] of stacks) {
    for (let i = 0; i < count; i += 1) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx, sy - i * 6, 8, 3.6, 0, 0, TAU);
      ctx.fillStyle = '#FFC93C';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#6B3D00';
      ctx.stroke();
      ctx.restore();
    }
  }

  if (steal > 0 && steal < 1) burst(ctx, victimX, victimY, steal, '#FFC93C', 8, 32);
  if (deposit > 0 && deposit < 1) burst(ctx, vx, vy, deposit, '#2BD9A8', 12, 48);
};

const cadeirasScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  const music = p < 0.56;
  const whistle = seg(p, 0.56, 0.66);
  const spin = music ? t * 0.9 : Math.floor(t * 0.9 * 6) / 6;

  // notas subindo enquanto a música toca
  if (music) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 4; i += 1) {
      const life = (t * 0.5 + i / 4) % 1;
      const nx = 60 + i * 62;
      const ny = 140 - life * 80;
      ctx.globalAlpha = 0.45 * (1 - life);
      ctx.beginPath();
      ctx.ellipse(nx, ny, 5, 4, -0.4, 0, TAU);
      ctx.fill();
      ctx.fillRect(nx + 3.6, ny - 13, 1.8, 13);
    }
    ctx.restore();
  }

  // duas cadeiras para três jogadores
  const chairs = [0, 1].map((i) => {
    const angle = spin + (i / 2) * TAU;
    return { x: 150 + Math.cos(angle) * 72, y: 104 + Math.sin(angle) * 34 };
  });

  for (const chair of chairs) {
    ctx.save();
    ctx.globalAlpha = music ? 0.3 : 0.6;
    ctx.setLineDash([9, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(chair.x, chair.y, 28, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.translate(chair.x, chair.y);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#7A0E42';
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 11, 0);
      ctx.lineTo(side * 14, 14);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.roundRect(-11, -26, 22, 10, 5);
    ctx.fillStyle = '#FF9BC6';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-13, -9, 26, 10, 5);
    ctx.fillStyle = '#FF5CA3';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // quem senta e quem fica de fora
  const seat = easeOut(clamp01(seg(p, 0.5, 0.68)));
  const sitters: [number, number, string, number][] = [
    [chairs[0].x, chairs[0].y, 'cachorro', 0],
    [chairs[1].x, chairs[1].y, 'gato', 2],
  ];
  sitters.forEach(([sx, sy, type, slot], index) => {
    const startX = index === 0 ? 62 : 250;
    const startY = index === 0 ? 142 : 60;
    drawCreature(ctx, {
      type: type as Parameters<typeof drawCreature>[1]['type'],
      palette: paletteForSlot(slot),
      x: startX + (sx - startX) * seat,
      y: startY + (sy - 14 - startY) * seat,
      r: 18,
      t,
      vx: (sx - startX) * (1 - seat) * 3,
      expression: seat > 0.8 ? 'cheer' : 'happy',
      phase: index * 1.3,
    });
  });

  // o que sobrou: parado no meio, sem cadeira
  drawCreature(ctx, {
    type: 'banana',
    palette: paletteForSlot(3),
    x: 150,
    y: 148,
    r: 18,
    t,
    squash: whistle > 0 && whistle < 1 ? -0.5 : 0,
    expression: whistle > 0.3 ? 'sad' : 'scared',
    phase: 2.2,
  });

  if (!music) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = '800 20px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(30,20,64,0.75)';
    ctx.strokeText('APITO!', 150, 38);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('APITO!', 150, 38);
    ctx.restore();
  }
};

// ---------------------------------------------------------------------------
// Quarta leva
// ---------------------------------------------------------------------------

const ondaScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  // duas pedras
  const rocks = [
    { x: 108, y: 112, r: 34 },
    { x: 214, y: 84, r: 30 },
  ];
  for (const rock of rocks) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(rock.x, rock.y, rock.r, rock.r * 0.8, 0, 0, TAU);
    const body = ctx.createLinearGradient(rock.x, rock.y - rock.r, rock.x, rock.y + rock.r);
    body.addColorStop(0, '#C8D7E8');
    body.addColorStop(1, '#5B708B');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#33465F';
    ctx.stroke();
    ctx.restore();
  }

  // a onda atravessa
  const sweep = clamp01(seg(p, 0.42, 0.9));
  const front = -40 + sweep * (PREVIEW_W + 80);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(16, 20, PREVIEW_W - 32, PREVIEW_H - 40, 22);
  ctx.clip();
  const water = ctx.createLinearGradient(front - 80, 0, front, 0);
  water.addColorStop(0, 'rgba(63,198,255,0.15)');
  water.addColorStop(0.7, 'rgba(63,198,255,0.8)');
  water.addColorStop(1, 'rgba(255,255,255,0.95)');
  ctx.fillStyle = water;
  ctx.fillRect(front - 80, 20, 80, PREVIEW_H - 40);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.arc(front - 6 + Math.sin(t * 6 + i) * 4, 34 + i * 22, 5 + (i % 3) * 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // seta de aviso antes da onda
  if (sweep <= 0) {
    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(t * 12) * 0.25;
    ctx.fillStyle = '#3FC6FF';
    ctx.beginPath();
    ctx.moveTo(56, 100);
    ctx.lineTo(30, 82);
    ctx.lineTo(30, 118);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // quem subiu na pedra e quem foi levado
  const climb = easeOut(clamp01(seg(p, 0.1, 0.42)));
  drawCreature(ctx, {
    type: 'pinguim',
    palette: paletteForSlot(4),
    x: 60 + (rocks[0].x - 60) * climb,
    y: 132 + (rocks[0].y - 22 - 132) * climb,
    r: 17,
    t,
    vx: 200 * (1 - climb),
    expression: climb > 0.9 ? 'happy' : 'scared',
    phase: 0.4,
  });

  const washed = clamp01(seg(p, 0.5, 0.95));
  drawCreature(ctx, {
    type: 'sapo',
    palette: paletteForSlot(2),
    x: 150 + washed * 150,
    y: 140 + Math.sin(washed * 6) * 8,
    r: 17,
    t,
    vx: washed * 400,
    squash: washed > 0.05 ? -0.5 : 0,
    expression: washed > 0.05 ? 'dizzy' : 'idle',
    alpha: 1 - washed * 0.5,
    phase: 1.7,
  });
};

const semaforoScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  // linha de chegada no topo
  for (let i = 0; i < 16; i += 1) {
    for (let row = 0; row < 2; row += 1) {
      ctx.fillStyle = (i + row) % 2 === 0 ? '#FFFFFF' : '#1B2536';
      ctx.fillRect(24 + i * 17, 30 + row * 7, 17, 7);
    }
  }

  // sinal: verde -> vermelho
  const red = p > 0.5;
  const lights = ['#2BD9A8', '#FFC93C', '#FF4D5E'];
  const active = red ? 2 : 0;
  ctx.save();
  ctx.translate(276, 96);
  ctx.beginPath();
  ctx.roundRect(-17, -46, 34, 92, 12);
  ctx.fillStyle = '#25304A';
  ctx.fill();
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(0, -28 + i * 28, 10, 0, TAU);
    ctx.fillStyle = i === active ? lights[i] : 'rgba(255,255,255,0.14)';
    ctx.fill();
  }
  ctx.restore();

  // dois correndo, um trava e o outro é multado
  const run = easeOut(clamp01(p / 0.5));
  const good = { x: 96, y: 140 - run * 74 };
  const bad = { x: 168, y: 140 - run * 64 };
  const punish = seg(p, 0.52, 0.66);

  if (!red) {
    trail(ctx, good.x, good.y, 0, -1, 'rgba(255,255,255,0.5)', 26);
    trail(ctx, bad.x, bad.y, 0, -1, 'rgba(255,255,255,0.5)', 26);
  }

  drawCreature(ctx, {
    type: 'coelho',
    palette: paletteForSlot(0),
    x: good.x,
    y: good.y,
    r: 18,
    t,
    vy: red ? 0 : -260,
    expression: red ? 'scared' : 'happy',
    phase: 0.3,
  });
  drawCreature(ctx, {
    type: 'jacare',
    palette: paletteForSlot(1),
    x: bad.x,
    y: bad.y + punish * 52,
    r: 18,
    t,
    vy: red ? -200 : -260,
    squash: punish > 0 && punish < 1 ? -0.6 : 0,
    expression: punish > 0.2 ? 'dizzy' : 'angry',
    phase: 1.2,
  });
  if (punish > 0 && punish < 1) burst(ctx, bad.x, bad.y, punish, '#FF4D5E', 9, 34);
};

const carimboScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  const colors = ['#FF4D5E', '#3FC6FF', '#FFC93C'];
  const pads = [
    { x: 86, y: 118, kind: 0 },
    { x: 160, y: 74, kind: 1 },
    { x: 238, y: 122, kind: 2 },
  ];
  const step = p < 0.34 ? 0 : p < 0.68 ? 1 : 2;

  pads.forEach((pad, index) => {
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fillStyle = index < step ? 'rgba(255,255,255,0.45)' : '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = index === step ? 5 : 2.5;
    ctx.strokeStyle = colors[index];
    ctx.stroke();

    // símbolo
    ctx.fillStyle = colors[index];
    ctx.beginPath();
    if (pad.kind === 0) {
      ctx.moveTo(0, -11);
      ctx.lineTo(10, 8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
    } else if (pad.kind === 1) {
      ctx.arc(0, 0, 10, 0, TAU);
    } else {
      ctx.roundRect(-9, -9, 18, 18, 4);
    }
    ctx.fill();

    // ordem
    ctx.font = '800 13px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = colors[index];
    ctx.fillText(`${index + 1}`, 0, -18);
    ctx.restore();
  });

  // o personagem cumprindo a sequência
  const from = step === 0 ? { x: 48, y: 140 } : pads[step - 1];
  const to = pads[step];
  const legT = easeInOut(clamp01(((p % 0.34) / 0.34) * 1.35));
  drawCreature(ctx, {
    type: 'cachorro',
    palette: paletteForSlot(3),
    x: from.x + (to.x - from.x) * legT,
    y: from.y + (to.y - from.y) * legT,
    r: 18,
    t,
    vx: (to.x - from.x) * (1 - legT) * 2,
    expression: legT > 0.92 ? 'cheer' : 'happy',
    phase: 0.8,
  });

  if (legT > 0.92) burst(ctx, to.x, to.y, (legT - 0.92) / 0.08, colors[step], 7, 26);
};

const tremScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  // trilho
  const railY = 112;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = 'rgba(30,20,64,0.5)';
  for (let x = 30; x < PREVIEW_W - 20; x += 22) {
    ctx.beginPath();
    ctx.roundRect(x - 3, railY - 20, 6, 40, 3);
    ctx.fill();
  }
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#C8D2E8';
  for (const offset of [-13, 13]) {
    ctx.beginPath();
    ctx.moveTo(26, railY + offset);
    ctx.lineTo(PREVIEW_W - 22, railY + offset);
    ctx.stroke();
  }
  ctx.restore();

  // três vagões com cores de jogadores
  const drift = Math.sin(p * TAU) * 14;
  const wagons = [0, 1, 2].map((i) => ({ x: 86 + i * 74 + drift, slot: [0, 3, 1][i] }));
  const swap = p > 0.55;

  wagons.forEach((wagon, index) => {
    const palette = paletteForSlot(swap && index > 0 ? wagons[3 - index].slot : wagon.slot);
    ctx.save();
    ctx.translate(wagon.x, railY);
    ctx.beginPath();
    ctx.roundRect(-28, -20, 56, 38, 8);
    const body = ctx.createLinearGradient(0, -20, 0, 18);
    body.addColorStop(0, palette.light);
    body.addColorStop(1, palette.base);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.shade;
    ctx.stroke();
    ctx.fillStyle = '#25304A';
    for (const side of [-14, 14]) {
      ctx.beginPath();
      ctx.arc(side, 18, 6, 0, TAU);
      ctx.fill();
    }
    if (index === 0) {
      ctx.beginPath();
      ctx.roundRect(-22, -32, 11, 14, 3);
      ctx.fillStyle = '#25304A';
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 3; i += 1) {
        const life = (t * 0.8 + i / 3) % 1;
        ctx.globalAlpha = 0.3 * (1 - life);
        ctx.beginPath();
        ctx.arc(-17, -38 - life * 22, 5 + life * 6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  });

  // dois jogadores trocando de vagão quando a ordem muda
  const move = easeInOut(clamp01(seg(p, 0.58, 0.92)));
  drawCreature(ctx, {
    type: 'capivara',
    palette: paletteForSlot(3),
    x: wagons[1].x + (wagons[2].x - wagons[1].x) * move,
    y: railY + 34,
    r: 17,
    t,
    vx: (wagons[2].x - wagons[1].x) * (1 - move) * 2,
    expression: swap ? 'scared' : 'happy',
    phase: 0.6,
  });
  drawCreature(ctx, {
    type: 'pao',
    palette: paletteForSlot(1),
    x: wagons[2].x + (wagons[1].x - wagons[2].x) * move,
    y: railY - 40,
    r: 17,
    t,
    vx: (wagons[1].x - wagons[2].x) * (1 - move) * 2,
    expression: swap ? 'angry' : 'idle',
    phase: 1.9,
  });

  if (swap && move < 0.2) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = '800 18px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(30,20,64,0.8)';
    ctx.strokeText('TROCA!', 160, 44);
    ctx.fillStyle = '#FFC93C';
    ctx.fillText('TROCA!', 160, 44);
    ctx.restore();
  }
};

const gangorraScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);

  const pivotX = 160;
  const pivotY = 116;
  const tilt = Math.sin(p * TAU) * 0.9;

  // apoio
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY + 6);
  ctx.lineTo(pivotX - 26, pivotY + 48);
  ctx.lineTo(pivotX + 26, pivotY + 48);
  ctx.closePath();
  const base = ctx.createLinearGradient(pivotX, pivotY, pivotX, pivotY + 48);
  base.addColorStop(0, '#FF9E7A');
  base.addColorStop(1, '#5E2410');
  ctx.fillStyle = base;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3D1330';
  ctx.stroke();
  ctx.restore();

  // prancha inclinada
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(tilt * 0.2);
  ctx.beginPath();
  ctx.roundRect(-124, -16, 248, 26, 10);
  ctx.fillStyle = theme.arenaEdge;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-118, -11, 236, 16, 7);
  ctx.fillStyle = theme.arena;
  ctx.fill();

  // caixote escorregando ladeira abaixo
  const side = tilt > 0 ? 1 : -1;
  const slide = Math.abs(tilt);
  const crateX = side * (28 + slide * 74);
  ctx.save();
  ctx.translate(crateX, -30);
  ctx.beginPath();
  ctx.roundRect(-15, -15, 30, 30, 5);
  const wood = ctx.createLinearGradient(-15, -15, 15, 15);
  wood.addColorStop(0, '#E8B978');
  wood.addColorStop(1, '#A9702F');
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#5E2410';
  ctx.stroke();
  ctx.restore();

  // quem está subindo a ladeira e quem já foi
  drawCreature(ctx, {
    type: 'capivara',
    palette: paletteForSlot(0),
    x: -side * (34 + slide * 34),
    y: -32,
    r: 17,
    t,
    vx: -side * 200,
    expression: slide > 0.6 ? 'scared' : 'happy',
    phase: 0.5,
  });
  ctx.restore();

  // o que caiu da ponta
  const fall = clamp01(seg(p, 0.42, 0.78));
  if (fall > 0 && fall < 1) {
    drawCreature(ctx, {
      type: 'ovo',
      palette: paletteForSlot(1),
      x: pivotX + 132 + fall * 26,
      y: pivotY + 6 + fall * fall * 90,
      r: 17,
      t,
      vy: 380 * fall,
      squash: 0.4,
      expression: 'dizzy',
      alpha: 1 - fall * 0.5,
      phase: 2.2,
    });
  }
};

// ---------------------------------------------------------------------------
// Quinta leva
// ---------------------------------------------------------------------------

/** Bolha do BOLHA!, com brilho e reflexo. */
function bubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  ready: boolean,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  const skin = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.1, 0, 0, radius);
  skin.addColorStop(0, 'rgba(255,255,255,0.55)');
  skin.addColorStop(0.6, 'rgba(63,198,255,0.2)');
  skin.addColorStop(1, 'rgba(143,102,255,0.3)');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.lineWidth = ready ? 4 : 2.5;
  ctx.strokeStyle = ready ? `rgba(255,227,140,${0.6 + Math.sin(t * 12) * 0.3})` : 'rgba(255,255,255,0.6)';
  ctx.stroke();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(-radius * 0.34, -radius * 0.42, radius * 0.2, radius * 0.1, -0.7, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const bolhaScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  // um enche parado, o outro chega correndo e fura
  const grow = clamp01(p / 0.62);
  const pop = seg(p, 0.62, 0.74);
  const radius = 20 + grow * 34;

  const victim = { x: 118, y: 104 };
  const thiefX = 300 - easeIn(clamp01(p / 0.66)) * 150;

  if (pop <= 0) bubble(ctx, victim.x, victim.y, radius, grow > 0.82, t);
  else burst(ctx, victim.x, victim.y, pop, '#8FE3F5', 12, 58);

  drawCreature(ctx, {
    type: 'sapo',
    palette: paletteForSlot(2),
    x: victim.x,
    y: victim.y,
    r: 18,
    t,
    squash: pop > 0 && pop < 1 ? -0.7 : 0,
    expression: pop > 0.1 ? 'sad' : grow > 0.8 ? 'cheer' : 'happy',
    phase: 0.7,
  });

  trail(ctx, thiefX, 118, 1, 0, 'rgba(255,92,163,0.5)', 30);
  drawCreature(ctx, {
    type: 'jacare',
    palette: paletteForSlot(1),
    x: thiefX,
    y: 118,
    r: 18,
    t,
    vx: -280,
    expression: pop > 0.1 ? 'happy' : 'angry',
    phase: 1.5,
  });

  // o ladrão sai com a bolha dele já maior
  if (pop > 0.2) bubble(ctx, thiefX, 118, 16 + pop * 14, false, t);
};

const imaScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  platform(ctx, theme, 160, 110, 120);

  const flipped = p > 0.5;
  const phase = flipped ? seg(p, 0.5, 0.86) : clamp01(p / 0.46);
  // antes: se atraem. depois: se repelem e um sai voando
  const gap = flipped ? 26 + easeOut(phase) * 128 : 120 - easeInOut(phase) * 86;

  const left = { x: 160 - gap / 2, y: 100 };
  const right = { x: 160 + gap / 2, y: 100 };

  // linha de campo
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 4;
  ctx.strokeStyle = flipped ? '#FF7A59' : '#3FC6FF';
  ctx.setLineDash(flipped ? [6, 8] : [14, 8]);
  ctx.lineDashOffset = flipped ? t * 60 : -t * 60;
  ctx.beginPath();
  if (flipped) {
    ctx.moveTo(left.x, left.y);
    ctx.quadraticCurveTo(160, 74, right.x, right.y);
  } else {
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const badge = (x: number, y: number, plus: boolean): void => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.fillStyle = plus ? '#FF7A59' : '#3FC6FF';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    if (plus) {
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
    }
    ctx.stroke();
    ctx.restore();
  };

  drawCreature(ctx, {
    type: 'polvo',
    palette: paletteForSlot(0),
    x: left.x,
    y: left.y,
    r: 18,
    t,
    vx: flipped ? -200 : 160,
    expression: flipped ? 'scared' : 'happy',
    phase: 0.4,
  });
  badge(left.x + 18, left.y - 22, true);

  drawCreature(ctx, {
    type: 'alien',
    palette: paletteForSlot(4),
    x: right.x,
    y: right.y,
    r: 18,
    t,
    vx: flipped ? 240 : -160,
    expression: flipped ? 'dizzy' : 'angry',
    phase: 1.6,
  });
  badge(right.x + 18, right.y - 22, flipped);

  if (flipped && phase > 0.7) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = '800 17px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(30,20,64,0.8)';
    ctx.strokeText('TROCA!', 160, 40);
    ctx.fillStyle = '#FFC93C';
    ctx.fillText('TROCA!', 160, 40);
    ctx.restore();
  }
};

const espelhoScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  const axis = 160 + Math.sin(p * TAU) * 22;

  // o vidro
  ctx.save();
  const glass = ctx.createLinearGradient(axis - 18, 0, axis + 18, 0);
  glass.addColorStop(0, 'rgba(143,226,245,0)');
  glass.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  glass.addColorStop(1, 'rgba(143,226,245,0)');
  ctx.fillStyle = glass;
  ctx.fillRect(axis - 18, 22, 36, PREVIEW_H - 44);
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8FE3F5';
  ctx.beginPath();
  ctx.moveTo(axis, 26);
  ctx.lineTo(axis, PREVIEW_H - 26);
  ctx.stroke();
  ctx.restore();

  // estrela do lado direito, pega pelo reflexo
  const star = { x: axis + 78, y: 78 };
  const grab = seg(p, 0.62, 0.74);
  if (grab <= 0) {
    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.rotate(t);
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * TAU - Math.PI / 2;
      const r = i % 2 === 0 ? 13 : 6;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#FFC93C';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#8A5A00';
    ctx.stroke();
    ctx.restore();
  } else {
    burst(ctx, star.x, star.y, grab, '#FFC93C', 9, 34);
  }

  // o corpo anda para a esquerda; o reflexo vai para a direita
  const walk = easeInOut(clamp01(p / 0.68));
  const bodyX = axis - 30 - walk * 66;
  const twinX = axis * 2 - bodyX;

  drawCreature(ctx, {
    type: 'coelho',
    palette: paletteForSlot(2),
    x: bodyX,
    y: 78,
    r: 18,
    t,
    vx: -180,
    expression: 'happy',
    phase: 0.5,
  });

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.translate(twinX, 78);
  ctx.scale(-1, 1);
  drawCreature(ctx, {
    type: 'coelho',
    palette: paletteForSlot(2),
    x: 0,
    y: 0,
    r: 18,
    t,
    vx: -180,
    expression: 'happy',
    alpha: 0.7,
    shadow: false,
    phase: 0.5,
  });
  ctx.restore();

  // seta indicando a inversão
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(bodyX - 26, 128);
  ctx.lineTo(bodyX - 8, 120);
  ctx.lineTo(bodyX - 8, 136);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(twinX + 26, 128);
  ctx.lineTo(twinX + 8, 120);
  ctx.lineTo(twinX + 8, 136);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const doisScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  // número chamado no chão
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.font = '800 130px "Baloo 2", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.ink;
  ctx.fillText('2', 160, 100);
  ctx.restore();

  const join = easeInOut(clamp01(p / 0.6));
  const pair = [
    { x: 74 + join * 30, y: 118, type: 'cachorro', slot: 0 },
    { x: 150 - join * 26, y: 112, type: 'gato', slot: 2 },
  ];
  const lonely = { x: 246, y: 84 };

  // laço verde entre a dupla
  if (join > 0.75) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#2BD9A8';
    ctx.beginPath();
    ctx.moveTo(pair[0].x, pair[0].y);
    ctx.lineTo(pair[1].x, pair[1].y);
    ctx.stroke();
    ctx.restore();
  }

  for (const member of pair) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 4;
    ctx.strokeStyle = join > 0.75 ? '#2BD9A8' : '#FF4D5E';
    ctx.beginPath();
    ctx.arc(member.x, member.y, 27, 0, TAU);
    ctx.stroke();
    ctx.restore();
    drawCreature(ctx, {
      type: member.type as Parameters<typeof drawCreature>[1]['type'],
      palette: paletteForSlot(member.slot),
      x: member.x,
      y: member.y,
      r: 18,
      t,
      expression: join > 0.75 ? 'cheer' : 'happy',
      phase: member.slot,
    });
  }

  // o que sobrou, com anel vermelho
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#FF4D5E';
  ctx.beginPath();
  ctx.arc(lonely.x, lonely.y, 27, 0, TAU);
  ctx.stroke();
  ctx.restore();
  drawCreature(ctx, {
    type: 'banana',
    palette: paletteForSlot(3),
    x: lonely.x,
    y: lonely.y + bob(t, 2, 5),
    r: 18,
    t,
    expression: p > 0.7 ? 'sad' : 'scared',
    phase: 2.1,
  });

  if (p > 0.78) burst(ctx, lonely.x, lonely.y, seg(p, 0.78, 0.94), '#FF4D5E', 8, 30);
};

const cacaScene: PreviewScene = ({ ctx, t, p, theme }) => {
  backdrop(ctx, theme);
  floorPanel(ctx, theme);

  const chest = { x: 214, y: 112 };
  const walk = easeInOut(clamp01(p / 0.66));
  const x = 70 + walk * 130;
  const y = 116;
  const heat = clamp01(1 - Math.hypot(chest.x - x, chest.y - y) / 150);
  const color = heat > 0.86 ? '#FF2E4C' : heat > 0.6 ? '#FF7A59' : heat > 0.35 ? '#FFC93C' : '#3FC6FF';
  const dig = seg(p, 0.7, 0.82);

  // anel de temperatura
  ctx.save();
  ctx.globalAlpha = 0.3 + heat * 0.4;
  const glow = ctx.createRadialGradient(x, y, 4, x, y, 42);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 42, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 4 + heat * 4;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + Math.max(0.15, heat) * TAU);
  ctx.stroke();
  ctx.restore();

  // termômetro
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(100, 34, 120, 10, 5);
  ctx.fillStyle = 'rgba(20,10,45,0.4)';
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(100, 34, Math.max(5, 120 * heat), 10, 5);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  // baú: só aparece quando é desenterrado
  if (dig > 0.15) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, dig * 2);
    ctx.translate(chest.x, chest.y);
    ctx.beginPath();
    ctx.roundRect(-22, -14, 44, 28, 5);
    const wood = ctx.createLinearGradient(0, -14, 0, 14);
    wood.addColorStop(0, '#E8B978');
    wood.addColorStop(1, '#A9702F');
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#5E2410';
    ctx.stroke();
    ctx.fillStyle = '#FFC93C';
    ctx.beginPath();
    ctx.roundRect(-6, -6, 12, 12, 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    burst(ctx, chest.x, chest.y, dig, '#FFC93C', 10, 46);
  } else {
    // marca de terra fofa onde o baú está enterrado
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#6B2410';
    ctx.beginPath();
    ctx.ellipse(chest.x, chest.y, 30, 16, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  if (dig > 0 && dig < 1) trail(ctx, x, y, 1, 0, 'rgba(255,201,60,0.6)', 30);

  drawCreature(ctx, {
    type: 'cachorro',
    palette: paletteForSlot(0),
    x,
    y,
    r: 18,
    t,
    vx: 200,
    squash: dig > 0 && dig < 1 ? 0.5 : 0,
    expression: heat > 0.86 ? 'cheer' : heat > 0.5 ? 'happy' : 'idle',
    phase: 0.6,
  });
};

interface PreviewDefinition {
  duration: number;
  draw: PreviewScene;
}

export const PREVIEWS: Record<GameId, PreviewDefinition> = {
  push: { duration: 4.2, draw: pushScene },
  crown: { duration: 4.4, draw: crownScene },
  bomb: { duration: 4.8, draw: bombScene },
  paint: { duration: 5.2, draw: paintScene },
  'dont-fall': { duration: 4.6, draw: dontFallScene },
  coleta: { duration: 4.4, draw: coletaScene },
  zona: { duration: 4.6, draw: zonaScene },
  parede: { duration: 3.8, draw: paredeScene },
  gol: { duration: 4.4, draw: golScene },
  corrida: { duration: 4.2, draw: corridaScene },
  cores: { duration: 4.6, draw: coresScene },
  raio: { duration: 5, draw: raioScene },
  mina: { duration: 5.2, draw: minaScene },
  rastro: { duration: 5.4, draw: rastroScene },
  meteoro: { duration: 4, draw: meteoroScene },
  sombra: { duration: 4.6, draw: sombraScene },
  buraco: { duration: 4.8, draw: buracoScene },
  peso: { duration: 4.6, draw: pesoScene },
  ladrao: { duration: 5.4, draw: ladraoScene },
  cadeiras: { duration: 5, draw: cadeirasScene },
  onda: { duration: 4.8, draw: ondaScene },
  semaforo: { duration: 4.6, draw: semaforoScene },
  carimbo: { duration: 5.6, draw: carimboScene },
  trem: { duration: 5.4, draw: tremScene },
  gangorra: { duration: 5, draw: gangorraScene },
  bolha: { duration: 5.2, draw: bolhaScene },
  ima: { duration: 5, draw: imaScene },
  espelho: { duration: 5.4, draw: espelhoScene },
  dois: { duration: 4.8, draw: doisScene },
  caca: { duration: 5.6, draw: cacaScene },
};

export function getPreview(gameId: GameId): PreviewDefinition {
  return PREVIEWS[gameId] ?? PREVIEWS.push;
}

export function previewTheme(gameId: GameId): GameTheme {
  return getGameMeta(gameId).theme;
}
