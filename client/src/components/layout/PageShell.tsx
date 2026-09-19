import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { BackgroundFX } from './BackgroundFX';
import { Footer } from './Footer';
import { Navbar } from './Navbar';

/**
 * Moldura das páginas do portal (tudo menos a sala, que é tela cheia).
 * A transição de entrada é curta de propósito: navegar tem que parecer instantâneo.
 */
export function PageShell({
  children,
  footer = true,
}: {
  children: ReactNode;
  footer?: boolean;
}): JSX.Element {
  return (
    <div className="flex min-h-screen-dvh flex-col">
      <BackgroundFX />
      <Navbar />
      <motion.main
        className="flex-1"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.main>
      {footer ? <Footer /> : null}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  align = 'left',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
}): JSX.Element {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow ? <p className="label-caps mb-2">{eyebrow}</p> : null}
      <h2 className="font-display text-3xl font-extrabold text-ink sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-ink-soft sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}
