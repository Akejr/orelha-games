import { Link } from 'react-router-dom';
import { sound } from '@/audio/SoundManager';
import { cn } from '@/utils/cn';

/**
 * Marca do Orelha Games: um bichinho redondo com duas orelhas grandes — a
 * "orelha" que escuta a bagunça da galera. Desenhada em SVG para ficar nítida
 * em qualquer tamanho.
 */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('shrink-0', className)}
      role="presentation"
      aria-hidden
    >
      <defs>
        <linearGradient id="orelha-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8F66FF" />
          <stop offset="55%" stopColor="#6C41F5" />
          <stop offset="100%" stopColor="#4724AC" />
        </linearGradient>
        <linearGradient id="orelha-mark-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE38C" />
          <stop offset="60%" stopColor="#FFC93C" />
          <stop offset="100%" stopColor="#F5AE10" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="30" fill="url(#orelha-mark-bg)" />
      <circle cx="50" cy="30" r="30" fill="#ffffff" opacity="0.1" />
      {/* orelhas */}
      <g stroke="#2B1466" strokeWidth="4.5" strokeLinejoin="round">
        <ellipse cx="24" cy="30" rx="11.5" ry="16" fill="#FF5CA3" transform="rotate(-22 24 30)" />
        <ellipse cx="76" cy="30" rx="11.5" ry="16" fill="#FF5CA3" transform="rotate(22 76 30)" />
        <ellipse cx="50" cy="58" rx="30" ry="28" fill="url(#orelha-mark-body)" />
      </g>
      {/* rosto */}
      <ellipse cx="39" cy="52" rx="7.5" ry="8" fill="#ffffff" />
      <ellipse cx="61" cy="52" rx="7.5" ry="8" fill="#ffffff" />
      <circle cx="40.5" cy="53" r="4" fill="#2B1466" />
      <circle cx="62.5" cy="53" r="4" fill="#2B1466" />
      <circle cx="39" cy="50.5" r="1.4" fill="#ffffff" />
      <circle cx="61" cy="50.5" r="1.4" fill="#ffffff" />
      <path
        d="M40 68q10 9 20 0"
        stroke="#2B1466"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="28" cy="64" rx="5" ry="3.2" fill="#FF9BC6" opacity="0.85" />
      <ellipse cx="72" cy="64" rx="5" ry="3.2" fill="#FF9BC6" opacity="0.85" />
    </svg>
  );
}

export function Logo({
  size = 40,
  compact = false,
  className,
}: {
  size?: number;
  compact?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <Link
      to="/"
      className={cn('group flex items-center gap-2.5', className)}
      onClick={() => sound.play('click')}
      aria-label="Orelha Games, ir para a home"
    >
      <span className="transition-transform duration-300 ease-pop group-hover:-rotate-6 group-hover:scale-105">
        <LogoMark size={size} />
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block font-display text-xl font-extrabold tracking-tight text-ink">
            ORELHA
          </span>
          <span className="block font-display text-[11px] font-extrabold uppercase tracking-[0.34em] text-grape-500">
            games
          </span>
        </span>
      ) : null}
    </Link>
  );
}
