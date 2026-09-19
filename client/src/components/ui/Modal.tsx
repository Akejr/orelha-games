import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { sound } from '@/audio/SoundManager';
import { cn } from '@/utils/cn';
import { IconButton } from './Button';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** desabilita fechar por overlay/ESC (ex: resultado de partida) */
  locked?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  locked = false,
  className,
}: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !locked) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => panelRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [open, locked, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              if (!locked) {
                sound.play('click');
                onClose?.();
              }
            }}
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className={cn(
              'relative w-full overflow-hidden rounded-4xl border border-white/70 bg-cream shadow-card outline-none',
              SIZES[size],
              className,
            )}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-grape-100/70 to-transparent" />
            {(title || onClose) && (
              <div className="relative flex items-start justify-between gap-3 px-6 pt-6">
                <div>
                  {title ? (
                    <h2 className="font-display text-2xl font-extrabold text-ink">{title}</h2>
                  ) : null}
                  {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
                </div>
                {onClose && !locked ? (
                  <IconButton label="Fechar" variant="ghost" onClick={onClose}>
                    <span aria-hidden className="text-xl leading-none">
                      ×
                    </span>
                  </IconButton>
                ) : null}
              </div>
            )}
            <div className="relative px-6 py-5">{children}</div>
            {footer ? (
              <div className="relative flex flex-wrap items-center justify-end gap-3 border-t border-grape-100 bg-white/60 px-6 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
