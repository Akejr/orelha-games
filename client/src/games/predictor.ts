import { DEFAULT_MOVE, clampVector, len } from '@shared/index';
import type { FighterView } from '@/multiplayer/snapshotBuffer';

/**
 * Predição local do próprio personagem.
 *
 * O servidor continua sendo a autoridade — o cliente só antecipa o movimento
 * simples (aceleração + atrito) para que o input pareça instantâneo. Tudo que é
 * "físico de verdade" (dash, knockback, atordoamento) é aceito do servidor sem
 * discussão, porque prever colisão daria divergência visível.
 */
const SNAP_DISTANCE = 130;
const CONVERGE = 7;

export class LocalPredictor {
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private ready = false;

  reset(): void {
    this.ready = false;
  }

  /**
   * @returns posição a ser renderizada para o jogador local.
   */
  update(
    server: FighterView,
    input: { mx: number; my: number },
    dt: number,
    trustServer: boolean,
  ): { x: number; y: number } {
    if (!this.ready || trustServer || !server.alive) {
      this.x = server.x;
      this.y = server.y;
      this.vx = server.vx;
      this.vy = server.vy;
      this.ready = true;
      return { x: server.x, y: server.y };
    }

    const cfg = DEFAULT_MOVE;
    const dir = clampVector(input.mx, input.my);
    if (len(dir.x, dir.y) > 0.08) {
      this.vx += dir.x * cfg.accel * dt;
      this.vy += dir.y * cfg.accel * dt;
    }
    const friction = Math.pow(cfg.friction, dt * 60);
    this.vx *= friction;
    this.vy *= friction;

    const speed = len(this.vx, this.vy);
    if (speed > cfg.maxSpeed) {
      const k = cfg.maxSpeed / speed;
      this.vx *= k;
      this.vy *= k;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // reconciliação suave com a autoridade
    const errorX = server.x - this.x;
    const errorY = server.y - this.y;
    const error = len(errorX, errorY);
    if (error > SNAP_DISTANCE) {
      this.x = server.x;
      this.y = server.y;
      this.vx = server.vx;
      this.vy = server.vy;
    } else {
      const blend = 1 - Math.exp(-CONVERGE * dt);
      this.x += errorX * blend;
      this.y += errorY * blend;
      this.vx += (server.vx - this.vx) * blend * 0.5;
      this.vy += (server.vy - this.vy) * blend * 0.5;
    }

    return { x: this.x, y: this.y };
  }
}
