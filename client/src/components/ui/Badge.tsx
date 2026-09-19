import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type BadgeTone = 'grape' | 'bubble' | 'mint' | 'lemon' | 'sky' | 'neutral' | 'ink';

const TONES: Record<BadgeTone, string> = {
  grape: 'bg-grape-100 text-grape-700',
  bubble: 'bg-bubble-100 text-bubble-700',
  mint: 'bg-mint-100 text-[#0A5741]',
  lemon: 'bg-lemon-100 text-[#6B3D00]',
  sky: 'bg-sky-100 text-[#0A4767]',
  neutral: 'bg-white/80 text-ink-soft ring-1 ring-grape-100',
  ink: 'bg-ink text-white',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  icon,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  icon?: ReactNode;
}): JSX.Element {
  return (
    <span className={cn('chip', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
