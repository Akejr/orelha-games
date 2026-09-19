import { motion } from 'framer-motion';
import type { JoystickVisual } from '@/games/useMatchInput';
import { cn } from '@/utils/cn';

/**
 * Controles de toque: direcional analógico que nasce onde o dedo encosta (metade
 * esquerda) e botão de dash grande na direita. Nada de d-pad fixo — em tela
 * pequena o polegar não erra assim.
 */
export function TouchControls({
  joystick,
  onDash,
  dashReady,
  visible,
}: {
  joystick: JoystickVisual;
  onDash: () => void;
  dashReady: boolean;
  visible: boolean;
}): JSX.Element | null {
  if (!visible) return null;

  const dx = joystick.x - joystick.baseX;
  const dy = joystick.y - joystick.baseY;
  const distance = Math.hypot(dx, dy);
  const limit = 58;
  const scale = distance > limit ? limit / distance : 1;

  return (
    <>
      {joystick.active ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: joystick.baseX, top: joystick.baseY }}
        >
          <div className="absolute -left-[58px] -top-[58px] h-[116px] w-[116px] rounded-full border-[3px] border-white/45 bg-white/10 backdrop-blur-sm" />
          <div
            className="absolute h-[54px] w-[54px] rounded-full bg-white/80 shadow-card"
            style={{
              left: -27 + dx * scale,
              top: -27 + dy * scale,
            }}
          />
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-4 pb-24 safe-bottom">
        <p className="max-w-[45%] rounded-2xl bg-black/25 px-3 py-2 text-[11px] font-bold leading-tight text-white/85 backdrop-blur-sm">
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
