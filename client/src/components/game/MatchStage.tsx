import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  WORLD,
  clamp01,
  getGameMeta,
  paletteForSlot,
  type GameEvent,
  type GameId,
  type PlayerPublic,
} from '@shared/index';
import { sound } from '@/audio/SoundManager';
import { LocalPredictor } from '@/games/predictor';
import { useMatchInput } from '@/games/useMatchInput';
import { FxLayer, createRenderer, type FighterFx, type PlayerMeta, type RenderView } from '@/games/render';
import { useResponsiveCanvas } from '@/hooks/useResponsiveCanvas';
import { useTicker } from '@/hooks/useTicker';
import { useRoom } from '@/multiplayer/RoomProvider';
import type { FighterView } from '@/multiplayer/snapshotBuffer';
import { cn } from '@/utils/cn';
import { MatchHud, type HudPlayer, type HudState } from './MatchHud';
import { TouchControls } from './TouchControls';

const EMPTY_HUD: HudState = {
  phase: 'countdown',
  countdown: 3,
  elapsed: 0,
  remaining: 0,
  alive: 0,
  total: 0,
  players: [],
  target: 0,
  crownHolder: null,
  crownMultiplier: 1,
  bombFuse: 1,
  bombHolder: null,
  bombHolders: [],
  paintRush: false,
  objective: null,
  seriesRound: 0,
  seriesRounds: 0,
};

/** Intervalo mínimo entre dois desenhos (~60 fps). */
const MIN_FRAME = 1 / 62;

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/**
 * Palco da partida: canvas + HUD + controles.
 *
 * Só o canvas roda a 60 fps; o HUD em React é atualizado ~10x por segundo para
 * não gastar reconciliação com números que ninguém consegue ler mais rápido.
 */
export function MatchStage({
  gameId,
  onLeave,
}: {
  gameId: GameId;
  onLeave: () => void;
}): JSX.Element {
  const { buffer, room, selfId, sendInput, latency, matchInfo } = useRoom();
  const { containerRef, canvasRef, size } = useResponsiveCanvas<HTMLDivElement>();
  const meta = getGameMeta(gameId);

  const fxRef = useRef(new FxLayer());
  const localFx = useRef(new Map<string, FighterFx>());
  const fighterMap = useRef(new Map<string, FighterView>());
  const predictor = useRef(new LocalPredictor());
  const rendererRef = useRef(createRenderer(gameId));
  const soundGate = useRef<Record<string, number>>({});
  const zoom = useRef(1);
  const hudClock = useRef(0);
  const tensionClock = useRef(0);
  const drawClock = useRef(0);
  const lastCountdownBeep = useRef(-1);
  const confettiDone = useRef(false);

  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [touch, setTouch] = useState(false);
  const [dashReady, setDashReady] = useState(true);

  useEffect(() => setTouch(isTouchDevice()), []);

  // recria o renderer a cada partida: alguns guardam estado (rastro acumulado,
  // canvas offscreen da tinta, animação de queda dos blocos)
  useEffect(() => {
    rendererRef.current = createRenderer(gameId);
    fxRef.current.reset();
    localFx.current.clear();
    fighterMap.current.clear();
    predictor.current.reset();
    confettiDone.current = false;
    lastCountdownBeep.current = -1;
    zoom.current = 1;
  }, [gameId, matchInfo?.round]);

  const players = useMemo<Map<string, PlayerMeta>>(() => {
    const map = new Map<string, PlayerMeta>();
    const list: PlayerPublic[] = room?.players ?? [];
    for (const player of list) {
      map.set(player.id, {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        slot: player.slot,
        palette: paletteForSlot(player.slot),
        isSelf: player.id === selfId,
        bot: player.bot,
        connected: player.connected,
      });
    }
    return map;
  }, [room?.players, selfId]);

  const input = useMatchInput({
    enabled: true,
    onSend: sendInput,
    onDash: () => {
      setDashReady(false);
      window.setTimeout(() => setDashReady(true), 780);
    },
  });

  // -------------------------------------------------------------------------
  // Eventos do servidor → som e partículas
  // -------------------------------------------------------------------------

  const gate = (key: string, gap: number, now: number): boolean => {
    const last = soundGate.current[key] ?? -Infinity;
    if (now - last < gap) return false;
    soundGate.current[key] = now;
    return true;
  };

  const handleEvents = (events: GameEvent[], t: number, view: RenderView): void => {
    const fx = fxRef.current;
    for (const event of events) {
      const palette = event.id ? players.get(event.id)?.palette : undefined;
      const color = palette?.base ?? '#ffffff';
      switch (event.k) {
        case 'go':
          sound.play('go');
          fx.flash('#ffffff', 0.3);
          fx.floatingText({ x: WORLD.w / 2, y: WORLD.h / 2 - 60, text: 'VAI!', color: '#FFC93C', size: 74 });
          break;
        case 'dash':
          if (gate(`dash-${event.id}`, 90, t)) {
            sound.play('dash', { volume: players.get(event.id ?? '')?.isSelf ? 0.85 : 0.4 });
          }
          fx.smoke({ x: event.x ?? 0, y: event.y ?? 0, count: 3, size: 12, life: 0.4, color: 'rgba(255,255,255,0.4)' });
          break;
        case 'hit': {
          const power = event.v ?? 0.4;
          if (gate('hit', 60, t)) {
            sound.play(power > 0.6 ? 'bigHit' : 'hit', { volume: 0.5 + power * 0.5 });
          }
          fx.spark({
            x: event.x ?? 0,
            y: event.y ?? 0,
            count: Math.round(5 + power * 12),
            color: '#FFFFFF',
            speed: 180 + power * 320,
            size: 5,
            life: 0.42,
          });
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: 'rgba(255,255,255,0.85)', size: 10, growth: 340 });
          fx.addShake(3 + power * 12);
          break;
        }
        case 'out': {
          sound.play('out');
          fx.shards({ x: event.x ?? 0, y: event.y ?? 0, color, count: 9 });
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color, size: 16, growth: 420, life: 0.5 });
          fx.floatingText({
            x: event.x ?? 0,
            y: (event.y ?? 0) - 40,
            text: 'FORA!',
            color: '#FF5CA3',
            size: 40,
          });
          fx.addShake(11);
          break;
        }
        case 'shrink':
          if (gate('shrink', 500, t)) sound.play('shrink', { volume: 0.5 });
          fx.addShake(3);
          break;
        case 'crown-grab':
          sound.play('crownGrab');
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FFC93C', size: 18, growth: 420 });
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 12, color: '#FFE38C', speed: 240, life: 0.6 });
          break;
        case 'crown-steal':
          sound.play('crownSteal');
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FFFFFF', size: 14, growth: 560 });
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 16, color: '#FFC93C', speed: 320, life: 0.55 });
          fx.floatingText({
            x: event.x ?? 0,
            y: (event.y ?? 0) - 46,
            text: 'ROUBOU!',
            color: '#FFC93C',
            size: 38,
          });
          fx.addShake(8);
          break;
        case 'crown-drop':
          sound.play('crownDrop');
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 10, color: '#FFE38C', speed: 200, life: 0.5 });
          fx.floatingText({
            x: event.x ?? 0,
            y: (event.y ?? 0) - 40,
            text: 'CAIU!',
            color: '#FFFFFF',
            size: 34,
          });
          break;
        case 'crown-alert':
          sound.play('crownAlert');
          sound.setTension(0.9);
          break;
        case 'bomb-pass':
          sound.play('bombPass');
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FF7A59', size: 14, growth: 480 });
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 8, color: '#FFC93C', speed: 240, life: 0.4 });
          break;
        case 'bomb-tick':
          if (gate('tick', 90, t)) {
            sound.play('bombTick', { volume: 0.35 + (event.v ?? 0) * 0.5, pitch: 1 + (event.v ?? 0) * 0.5 });
          }
          break;
        case 'bomb-explode':
          sound.play('bombExplode');
          fx.flash('#FFC93C', 0.5);
          fx.addShake(24);
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FFFFFF', size: 24, growth: 900, life: 0.55 });
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FF7A59', size: 12, growth: 640, life: 0.7 });
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 26, color: '#FFC93C', speed: 480, life: 0.7, size: 7 });
          fx.smoke({ x: event.x ?? 0, y: event.y ?? 0, count: 10, size: 26, life: 0.9 });
          break;
        case 'tile-crack':
          if (gate('crack', 70, t)) sound.play('tileCrack', { volume: 0.4 });
          break;
        case 'tile-fall':
          if (gate('tilefall', 70, t)) sound.play('tileFall', { volume: 0.45 });
          fx.spark({
            x: event.x ?? 0,
            y: event.y ?? 0,
            count: 4,
            color: '#FF9BC6',
            speed: 90,
            life: 0.5,
            gravity: 700,
          });
          break;
        case 'paint-splash':
          if (gate('splash', 120, t)) sound.play('paintSplash', { volume: 0.4 });
          fx.splat({ x: event.x ?? 0, y: event.y ?? 0, color, count: 5, size: 16 });
          break;
        case 'paint-rush':
          sound.play('paintRush');
          fx.flash('#FF5CA3', 0.3);
          fx.floatingText({
            x: WORLD.w / 2,
            y: WORLD.h / 2,
            text: 'FINAL RUSH!',
            color: '#FF5CA3',
            size: 62,
          });
          sound.setTension(1);
          break;
        // ---- eventos dos jogos da segunda leva ----
        case 'pickup': {
          const gold = (event.v ?? 0) > 0.8;
          sound.play('crownGrab', { volume: gold ? 0.9 : 0.45, pitch: gold ? 1 : 1.2 });
          fx.ring({
            x: event.x ?? 0,
            y: event.y ?? 0,
            color: gold ? '#FFC93C' : '#FFFFFF',
            size: 12,
            growth: gold ? 520 : 300,
          });
          fx.spark({
            x: event.x ?? 0,
            y: event.y ?? 0,
            count: gold ? 16 : 7,
            color: gold ? '#FFE38C' : color,
            speed: gold ? 320 : 200,
            life: 0.5,
          });
          if (event.i) {
            fx.floatingText({
              x: event.x ?? 0,
              y: (event.y ?? 0) - 34,
              text: `+${event.i}`,
              color: gold ? '#FFC93C' : '#FFFFFF',
              size: gold ? 40 : 28,
            });
          }
          break;
        }
        case 'checkpoint': {
          sound.play('crownGrab', { volume: 0.7, pitch: 1.15 });
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FFFFFF', size: 20, growth: 620 });
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 12, color, speed: 280, life: 0.5 });
          fx.floatingText({
            x: event.x ?? 0,
            y: (event.y ?? 0) - 40,
            text: '+1',
            color: '#FFFFFF',
            size: 34,
          });
          break;
        }
        case 'score':
          sound.play('select');
          break;
        case 'call':
          sound.play('crownAlert', { volume: 0.7 });
          break;
        case 'zone-move':
          sound.play('shrink', { volume: 0.55 });
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FFFFFF', size: 30, growth: 420, life: 0.6 });
          break;
        case 'wall-spawn':
          if (gate('wall', 200, t)) sound.play('shrink', { volume: 0.4 });
          break;
        case 'goal': {
          const scored = (event.v ?? 0) >= 1;
          sound.play(scored ? 'win' : 'crownDrop', { volume: scored ? 0.7 : 0.5 });
          fx.addShake(scored ? 14 : 5);
          fx.ring({
            x: event.x ?? 0,
            y: event.y ?? 0,
            color: scored ? '#FFC93C' : '#FFFFFF',
            size: 22,
            growth: 700,
            life: 0.6,
          });
          if (scored) {
            fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 20, color: '#FFC93C', speed: 380, life: 0.7 });
            fx.floatingText({
              x: event.x ?? 0,
              y: (event.y ?? 0) - 46,
              text: 'GOL!',
              color: '#FFC93C',
              size: 46,
            });
          }
          break;
        }
        case 'beam-warn':
          sound.play('crownAlert', { volume: 0.5 });
          break;
        case 'beam-hit':
          sound.play('bigHit', { volume: 0.8 });
          fx.addShake(12);
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 14, color: '#FF9BC6', speed: 340, life: 0.5 });
          break;
        case 'mine-safe':
          if (gate('safe', 90, t)) sound.play('copy', { volume: 0.45 });
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color, size: 8, growth: 200, life: 0.3 });
          break;
        case 'mine-boom':
          sound.play('bombExplode', { volume: 0.9 });
          fx.flash('#FF7A59', 0.35);
          fx.addShake(20);
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FFFFFF', size: 20, growth: 760, life: 0.5 });
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 22, color: '#FFC93C', speed: 440, life: 0.65, size: 6 });
          fx.smoke({ x: event.x ?? 0, y: event.y ?? 0, count: 8, size: 22, life: 0.8 });
          break;
        case 'trail-hit':
          sound.play('hit', { volume: 0.75 });
          fx.addShake(9);
          fx.shards({ x: event.x ?? 0, y: event.y ?? 0, color, count: 8 });
          break;
        case 'meteor-warn':
          if (gate('warn', 160, t)) {
            sound.play('bombTick', { volume: 0.3, pitch: (event.v ?? 0) > 0.8 ? 1.4 : 1 });
          }
          break;
        case 'meteor-hit': {
          const radius = event.i ?? 90;
          sound.play('bombExplode', { volume: 0.55 + Math.min(0.4, radius / 300) });
          fx.addShake(10 + radius * 0.08);
          fx.ring({
            x: event.x ?? 0,
            y: event.y ?? 0,
            color: '#FFC93C',
            size: radius * 0.5,
            growth: radius * 3,
            life: 0.45,
          });
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 16, color: '#FF7A59', speed: 400, life: 0.6 });
          fx.smoke({ x: event.x ?? 0, y: event.y ?? 0, count: 7, size: 26, life: 0.75 });
          break;
        }
        case 'life-lost': {
          sound.play('out', { volume: 0.7 });
          fx.addShake(8);
          fx.spark({ x: event.x ?? 0, y: event.y ?? 0, count: 10, color: '#FF5CA3', speed: 260, life: 0.5 });
          fx.floatingText({
            x: event.x ?? 0,
            y: (event.y ?? 0) - 44,
            text: '-1 vida',
            color: '#FF5CA3',
            size: 30,
          });
          break;
        }
        case 'recover': {
          sound.play('dash', { volume: 0.9 });
          sound.play('crownGrab', { volume: 0.5, pitch: 1.3 });
          fx.ring({ x: event.x ?? 0, y: event.y ?? 0, color: '#FFFFFF', size: 16, growth: 520 });
          fx.floatingText({
            x: event.x ?? 0,
            y: (event.y ?? 0) - 40,
            text: 'SALVO!',
            color: '#2BD9A8',
            size: 36,
          });
          break;
        }
        case 'finish': {
          const selfWon = event.id === selfId;
          sound.play(selfWon ? 'win' : 'lose');
          fx.addShake(6);
          if (!confettiDone.current) {
            confettiDone.current = true;
            if (selfWon || !selfId) {
              fxRef.current.confetti({ width: WORLD.w, height: WORLD.h, count: 110 });
              sound.play('confetti');
            }
          }
          const winner = event.id ? players.get(event.id) : null;
          fx.floatingText({
            x: event.x ?? WORLD.w / 2,
            y: (event.y ?? WORLD.h / 2) - 60,
            text: winner ? (winner.isSelf ? 'VOCÊ VENCEU!' : `${winner.name} VENCEU!`) : 'FIM!',
            color: '#FFC93C',
            size: 46,
            life: 2.2,
          });
          break;
        }
        default:
          break;
      }
    }
  };

  // -------------------------------------------------------------------------
  // Loop principal
  // -------------------------------------------------------------------------

  useTicker((t, rawDt) => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /**
     * Teto de ~60 quadros por segundo.
     *
     * O requestAnimationFrame acompanha a tela: celular de 120 Hz pediria 120
     * desenhos por segundo de uma partida que o servidor só atualiza 20 vezes por
     * segundo. O tempo acumulado vai para o quadro seguinte, então nada de
     * animação fica mais lento — só para de desenhar o que ninguém ia ver.
     */
    drawClock.current += rawDt;
    if (drawClock.current < MIN_FRAME) return;
    const dt = drawClock.current;
    drawClock.current = 0;

    const map = fighterMap.current;
    const snapshot = buffer.sample(map);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!snapshot) {
      // esperando o primeiro snapshot
      ctx.fillStyle = meta.theme.backdropDeep;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const fighters: FighterView[] = [];
    for (const fighter of map.values()) fighters.push(fighter);

    // predição local do próprio personagem
    if (selfId) {
      const self = map.get(selfId);
      if (self) {
        const trust = self.dashing || self.stunned || snapshot.ph !== 'playing';
        const predicted = predictor.current.update(self, input.inputRef.current, dt, trust);
        self.x = predicted.x;
        self.y = predicted.y;
      }
    }

    // câmera: aproxima quando a arena fecha ou sobram dois
    let targetZoom = 1;
    if (snapshot.push) targetZoom = 1 + clamp01(1 - snapshot.push.r / 292) * 0.16;
    if (snapshot.bomb) targetZoom = 1 + clamp01(1 - snapshot.bomb.r / 300) * 0.12;
    const aliveCount = fighters.filter((f) => f.alive).length;
    if (aliveCount === 2 && fighters.length > 2) targetZoom += 0.08;
    zoom.current += (targetZoom - zoom.current) * Math.min(1, dt * 2.4);

    const base = Math.min(size.width / WORLD.w, size.height / WORLD.h);
    const scale = base * zoom.current;
    const offsetX = (size.width - WORLD.w * scale) / 2;
    const offsetY = (size.height - WORLD.h * scale) / 2;

    const fx = fxRef.current;
    fx.update(dt);

    const view: RenderView = {
      ctx,
      width: size.width,
      height: size.height,
      scale,
      t,
      dt,
      snapshot,
      fighters,
      fx,
      meta: players,
      local: localFx.current,
      selfId,
      theme: meta.theme,
      countdown: snapshot.ph === 'countdown',
      winnerId:
        snapshot.ph === 'over'
          ? (fighters.find((f) => f.place === 1)?.id ?? null)
          : null,
    };

    const events = buffer.drainEvents();
    if (events.length > 0) handleEvents(events, t, view);

    // contagem regressiva sonora
    if (snapshot.ph === 'countdown') {
      const beep = Math.ceil(snapshot.cd);
      if (beep !== lastCountdownBeep.current && beep > 0 && beep <= 3) {
        lastCountdownBeep.current = beep;
        sound.play('countdown', { pitch: 1 + (3 - beep) * 0.12 });
      }
    }

    ctx.save();
    ctx.scale(size.dpr, size.dpr);
    ctx.translate(offsetX + fx.shakeX, offsetY + fx.shakeY);
    ctx.scale(scale, scale);
    rendererRef.current(view);
    fx.drawFront(ctx);
    ctx.restore();

    // clarão em espaço de tela
    if (fx.flashAlpha > 0.01) {
      ctx.save();
      ctx.scale(size.dpr, size.dpr);
      ctx.globalAlpha = Math.min(0.7, fx.flashAlpha);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.restore();
    }

    const bombList = snapshot.bomb?.bombs ?? [];
    const myBomb = bombList.find((entry) => entry.h === selfId) ?? null;
    const hottestBomb = bombList.reduce<(typeof bombList)[number] | null>(
      (acc, entry) => (!acc || entry.fz < acc.fz ? entry : acc),
      null,
    );
    const focusBomb = myBomb ?? hottestBomb;

    // HUD ~10 Hz
    hudClock.current += dt;
    if (hudClock.current > 0.1) {
      hudClock.current = 0;
      const hudPlayers: HudPlayer[] = [];
      for (const fighter of fighters) {
        const info = players.get(fighter.id);
        if (!info) continue;
        hudPlayers.push({
          id: fighter.id,
          name: info.name,
          avatar: info.avatar,
          slot: info.slot,
          palette: info.palette,
          isSelf: info.isSelf,
          alive: fighter.alive,
          place: fighter.place,
          score: fighter.score,
          lives: fighter.lives,
          bot: info.bot,
          connected: info.connected,
        });
      }
      setHud({
        phase: snapshot.ph,
        countdown: snapshot.cd,
        elapsed: snapshot.el,
        remaining: snapshot.rt,
        alive: aliveCount,
        total: fighters.length,
        players: hudPlayers,
        // a meta pode vir do campo próprio (coroa) ou do canal genérico
        target: snapshot.crown?.tg ?? snapshot.ex?.tg ?? 0,
        crownHolder: snapshot.crown?.h ?? null,
        crownMultiplier: snapshot.crown?.mu ?? 1,
        // com duas bombas o HUD mostra a MINHA; se não tenho nenhuma, a mais quente
        bombFuse: focusBomb?.fz ?? 1,
        bombHolder: focusBomb?.h ?? null,
        bombHolders: bombList
          .map((entry) => entry.h)
          .filter((id): id is string => Boolean(id)),
        paintRush: snapshot.paint?.ru === 1,
        objective: snapshot.ex?.s ?? null,
        seriesRound: matchInfo?.seriesRound ?? 0,
        seriesRounds: matchInfo?.seriesRounds ?? 0,
      });
    }

    // tensão da trilha
    tensionClock.current += dt;
    if (tensionClock.current > 0.5) {
      tensionClock.current = 0;
      let tension = 0;
      const total = fighters.length || 1;
      if (snapshot.ph === 'playing') {
        tension = clamp01(1 - (aliveCount - 1) / Math.max(1, total - 1)) * 0.7;
        if (focusBomb) tension = Math.max(tension, 1 - focusBomb.fz);
        if (snapshot.rt >= 0 && snapshot.rt < 15) tension = Math.max(tension, 0.8);
        if (snapshot.crown) {
          const best = Math.max(0, ...fighters.map((f) => f.score));
          tension = Math.max(tension, clamp01(best / Math.max(1, snapshot.crown.tg)));
        }
      }
      sound.setTension(tension);
    }
  }, size.width > 0);

  const selfMissing = Boolean(selfId && hud.players.length > 0 && !hud.players.some((p) => p.isSelf));
  const countdownValue = Math.ceil(hud.countdown);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden no-touch-scroll"
      style={{ background: meta.theme.backdropDeep }}
      onPointerDown={input.handlers.onPointerDown}
      onPointerMove={input.handlers.onPointerMove}
      onPointerUp={input.handlers.onPointerUp}
      onPointerCancel={input.handlers.onPointerUp}
      onDoubleClick={() => input.triggerDash()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <MatchHud gameId={gameId} hud={hud} latency={latency} onLeave={onLeave} />

      <TouchControls
        joystickRef={input.joystickRef}
        onDash={input.triggerDash}
        dashReady={dashReady}
        visible={touch}
      />

      {!touch ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-3 rounded-2xl bg-black/45 px-4 py-2 text-[12px] font-bold text-white/85 lg:flex">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md bg-white/85 px-1.5 py-0.5 font-display text-[11px] text-ink">WASD</kbd>
            mover
          </span>
          <span className="h-4 w-px bg-white/25" />
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md bg-white/85 px-2 py-0.5 font-display text-[11px] text-ink">espaço</kbd>
            dash
          </span>
        </div>
      ) : null}

      {/* contagem regressiva */}
      <AnimatePresence>
        {hud.phase === 'countdown' ? (
          <motion.div
            className="pointer-events-none absolute inset-0 grid place-items-center bg-ink/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <motion.p
                key={countdownValue}
                initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 1.6, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                className="font-display text-[26vh] font-extrabold leading-none text-white drop-shadow-[0_8px_0_rgba(30,20,64,0.35)]"
              >
                {countdownValue > 0 ? countdownValue : 'VAI!'}
              </motion.p>
              <p className="mt-2 font-display text-lg font-extrabold text-white/90 sm:text-2xl">
                {meta.objective}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {selfMissing ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex justify-center px-4">
          <p className="rounded-2xl bg-ink/80 px-4 py-2 text-center font-display text-base font-extrabold text-white">
            Você entra na próxima rodada 👀
          </p>
        </div>
      ) : null}
    </div>
  );
}
