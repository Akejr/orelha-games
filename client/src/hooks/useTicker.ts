import { useEffect, useRef } from 'react';

type TickCallback = (time: number, dt: number) => void;

/**
 * Um único requestAnimationFrame para toda a aplicação.
 *
 * Dezenas de avatares animados, previews de cards e HUDs podem se inscrever
 * aqui sem criar dezenas de loops concorrentes. O loop dorme quando a aba está
 * em background e quando ninguém está inscrito.
 */
const subscribers = new Set<TickCallback>();
let frame: number | null = null;
let last = 0;

function loop(now: number): void {
  const time = now / 1000;
  const dt = last === 0 ? 1 / 60 : Math.min(0.1, time - last);
  last = time;
  for (const callback of subscribers) {
    try {
      callback(time, dt);
    } catch {
      /* um assinante quebrado não derruba o loop */
    }
  }
  frame = subscribers.size > 0 ? requestAnimationFrame(loop) : null;
}

function ensureLoop(): void {
  if (frame === null && subscribers.size > 0 && typeof window !== 'undefined') {
    last = 0;
    frame = requestAnimationFrame(loop);
  }
}

export function subscribeTick(callback: TickCallback): () => void {
  subscribers.add(callback);
  ensureLoop();
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
}

/** Inscreve um callback estável no ticker global. */
export function useTicker(callback: TickCallback, active = true): void {
  const ref = useRef(callback);
  ref.current = callback;

  useEffect(() => {
    if (!active) return;
    return subscribeTick((time, dt) => ref.current(time, dt));
  }, [active]);
}
