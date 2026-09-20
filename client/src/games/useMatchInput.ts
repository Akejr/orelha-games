import { useCallback, useEffect, useRef } from 'react';
import { INPUT_RATE } from '@shared/index';

export interface InputSnapshot {
  mx: number;
  my: number;
  dash: number;
}

export interface JoystickVisual {
  active: boolean;
  /** centro do toque, em px relativos ao container */
  baseX: number;
  baseY: number;
  /** posição atual do dedo */
  x: number;
  y: number;
}

const KEYS_LEFT = ['ArrowLeft', 'KeyA'];
const KEYS_RIGHT = ['ArrowRight', 'KeyD'];
const KEYS_UP = ['ArrowUp', 'KeyW'];
const KEYS_DOWN = ['ArrowDown', 'KeyS'];
const KEYS_DASH = ['Space', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyK', 'Enter'];

const JOY_RADIUS = 58;

/**
 * Entrada unificada: teclado no desktop, direcional virtual no toque.
 *
 * O dash é enviado como contador monotônico (não como booleano) — assim um toque
 * nunca se perde entre dois pacotes de input.
 */
export function useMatchInput(options: {
  enabled: boolean;
  onSend: (mx: number, my: number, dash: number) => void;
  onDash?: () => void;
}): {
  inputRef: React.MutableRefObject<InputSnapshot>;
  joystickRef: React.MutableRefObject<JoystickVisual>;
  handlers: {
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
  };
  triggerDash: () => void;
} {
  const { enabled, onSend, onDash } = options;
  // callbacks em ref: o intervalo de envio não pode ser recriado a cada render
  // do estado da sala (recriar significa perder pacotes de input no meio)
  const sendRef = useRef(onSend);
  sendRef.current = onSend;
  const dashRef = useRef(onDash);
  dashRef.current = onDash;

  const inputRef = useRef<InputSnapshot>({ mx: 0, my: 0, dash: 0 });
  const keys = useRef(new Set<string>());
  const pointerId = useRef<number | null>(null);
  /**
   * O direcional virtual vive em ref, NÃO em estado do React.
   *
   * `pointermove` dispara a 60–120 Hz enquanto o dedo está na tela, e no celular
   * o dedo fica na tela a partida inteira. Com `useState` aqui, cada movimento
   * remontava o HUD e os controles: era o motivo de a partida travar no celular e
   * ficar lisa no teclado (que só escreve em ref). Quem desenha o direcional é o
   * `TouchControls`, lendo esta ref dentro do requestAnimationFrame.
   */
  const joystickRef = useRef<JoystickVisual>({
    active: false,
    baseX: 0,
    baseY: 0,
    x: 0,
    y: 0,
  });

  const triggerDash = useCallback(() => {
    inputRef.current.dash += 1;
    dashRef.current?.();
  }, []);

  // ---------------------------------------------------------------- teclado
  useEffect(() => {
    if (!enabled) return;

    const recompute = (): void => {
      const set = keys.current;
      let mx = 0;
      let my = 0;
      if (KEYS_LEFT.some((code) => set.has(code))) mx -= 1;
      if (KEYS_RIGHT.some((code) => set.has(code))) mx += 1;
      if (KEYS_UP.some((code) => set.has(code))) my -= 1;
      if (KEYS_DOWN.some((code) => set.has(code))) my += 1;
      const length = Math.hypot(mx, my);
      if (length > 1) {
        mx /= length;
        my /= length;
      }
      // o direcional virtual tem prioridade quando está em uso
      if (!joystickRef.current.active) {
        inputRef.current.mx = mx;
        inputRef.current.my = my;
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const code = event.code;
      if (KEYS_DASH.includes(code)) {
        event.preventDefault();
        triggerDash();
        return;
      }
      if (
        KEYS_LEFT.includes(code) ||
        KEYS_RIGHT.includes(code) ||
        KEYS_UP.includes(code) ||
        KEYS_DOWN.includes(code)
      ) {
        event.preventDefault();
        keys.current.add(code);
        recompute();
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      keys.current.delete(event.code);
      recompute();
    };

    const onBlur = (): void => {
      keys.current.clear();
      inputRef.current.mx = 0;
      inputRef.current.my = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.current.clear();
    };
  }, [enabled, triggerDash]);

  // ------------------------------------------------------------------ envio
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      const { mx, my, dash } = inputRef.current;
      sendRef.current(mx, my, dash);
    }, 1000 / INPUT_RATE);
    return () => window.clearInterval(interval);
  }, [enabled]);

  // --------------------------------------------------------------- ponteiro
  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (pointerId.current !== null) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerId.current = event.pointerId;
    target.setPointerCapture?.(event.pointerId);
    const joystick = joystickRef.current;
    joystick.active = true;
    joystick.baseX = x;
    joystick.baseY = y;
    joystick.x = x;
    joystick.y = y;
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (pointerId.current !== event.pointerId) return;
    const joystick = joystickRef.current;
    if (!joystick.active) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    joystick.x = x;
    joystick.y = y;

    const dx = x - joystick.baseX;
    const dy = y - joystick.baseY;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(1, distance / JOY_RADIUS);
    if (distance > 6) {
      inputRef.current.mx = (dx / distance) * clamped;
      inputRef.current.my = (dy / distance) * clamped;
    } else {
      inputRef.current.mx = 0;
      inputRef.current.my = 0;
    }
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    inputRef.current.mx = 0;
    inputRef.current.my = 0;
    const joystick = joystickRef.current;
    joystick.active = false;
    joystick.baseX = 0;
    joystick.baseY = 0;
    joystick.x = 0;
    joystick.y = 0;
  }, []);

  return {
    inputRef,
    joystickRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
    triggerDash,
  };
}
