import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { sound } from '@/audio/SoundManager';
import { cn } from '@/utils/cn';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  push: (kind: ToastKind, message: string) => void;
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastKind, string> = {
  info: 'bg-white text-ink ring-grape-200',
  success: 'bg-mint-100 text-[#08553F] ring-mint-300',
  warn: 'bg-lemon-100 text-[#6B3D00] ring-lemon-300',
  error: 'bg-bubble-100 text-bubble-700 ring-bubble-200',
};

const ICONS: Record<ToastKind, string> = {
  info: '•',
  success: '✓',
  warn: '!',
  error: '×',
};

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const lastMessage = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const push = useCallback((kind: ToastKind, message: string) => {
    const now = Date.now();
    // evita spam do mesmo aviso (ex: reconexões em sequência)
    if (lastMessage.current.text === message && now - lastMessage.current.at < 1200) return;
    lastMessage.current = { text: message, at: now };

    counter.current += 1;
    const id = counter.current;
    setItems((previous) => [...previous.slice(-3), { id, kind, message }]);
    if (kind === 'error') sound.play('error');
    window.setTimeout(() => {
      setItems((previous) => previous.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      info: (message) => push('info', message),
      success: (message) => push('success', message),
      warn: (message) => push('warn', message),
      error: (message) => push('error', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 safe-bottom sm:bottom-auto sm:left-auto sm:right-6 sm:top-6 sm:items-end"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={cn(
                'pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold shadow-card ring-2',
                STYLES[item.kind],
              )}
            >
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/70 font-display text-xs"
              >
                {ICONS[item.kind]}
              </span>
              <span className="leading-snug">{item.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    // fallback silencioso: componentes isolados (storybook, testes) não quebram
    return {
      push: () => undefined,
      info: () => undefined,
      success: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
  }
  return context;
}
