import { useRef } from 'react';
import { motion } from 'framer-motion';
import type { JoystickVisual } from '@/games/useMatchInput';
import { useTicker } from '@/hooks/useTicker';
import { cn } from '@/utils/cn';

/**
 * Controles de toque: direcional analógico que nasce onde o dedo encosta (metade
 * esquerda) e botão de dash grande na direita. Nada de d-pad fixo — em tela
 * pequena o polegar não erra assim.
 *
 * O direcional é atualizado escrevendo `style` direto nos elementos dentro do
 * requestAnimationFrame. Antes ele vinha de estado do React e cada `pointermove`
 * (60–120 por segundo, a partida inteira) remontava HUD e controles — era o que
 * fazia o jogo travar no celular e não travar no teclado.
 */
const JOY_LIMIT = 58;

export function TouchControls({
  joystickRef,
  onDash,
  dashReady,
  visible,
}: {
  joystickRef: React.MutableRefObject<JoystickVisual>;
  onDash: () => void;
  dashReady: boolean;
  visible: boolean;
}): JSX.Element | null {
  const ringRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  useTicker(() => {
    const ring = ringRef.current;
    const knob = knobRef.current;
    if (!ring || !knob) return;

    const joystick = joystickRef.current;
    if (!joystick.active) {
      if (ring.style.opacity !== '0') ring.style.opacity = '0';
      return;
    }

    const dx = joystick.x - joystick.baseX;
    const dy = joystick.y - joystick.baseY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > JOY_LIMIT ? JOY_LIMIT / distance : 1;

    if (ring.style.opacity !== '1') ring.style.opacity = '1';
    ring.style.transform = `translate3d(${joystick.baseX}px, ${joystick.baseY}px, 0)`;
    knob.style.transform = `translate3d(${dx * scale}px, ${dy * scale}px, 0)`;
  }, visible);

  if (!visible) return null;

  return (
    <>
      <div
        ref={ringRef}
        className="pointer-events-none absolute left-0 top-0 z-20 will-change-transform"
        style={{ opacity: 0 }}
        aria-hidden="true"
      >
        <div className="absolute -left-[58px] -top-[58px] h-[116px] w-[116px] rounded-full border-[3px] border-white/45 bg-white/10" />
        <div
          ref={knobRef}
          className="absolute -left-[27px] -top-[27px] h-[54px] w-[54px] rounded-full bg-white/80 shadow-card will-change-transform"
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-4 pb-24 safe-bottom">
        <p className="max-w-[45%] rounded-2xl bg-black/25 px-3 py-2 text-[11px] font-bold leading-tight text-white/85">
          Arraste em qualquer lugar para mover
        </p>
        <motion.button
          type="button"
          className={cn(
            'pointer-events-auto grid h-[92px] w-[92px] place-items-center rounded-full font-display text-lg font-extrabold uppercase tracking-wide text-white shadow-card transition-colors',
            dashReady ? 'bg-gradient-to-br from-bubble-400 to-bubble-600' : 'bg-white/25 text-white/70',
          )}
          whileTap={{ scale: 0.9 }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDash();
          }}
          aria-label="Dash"
        >
          dash
        </motion.button>
      </div>
    </>
  );
}
