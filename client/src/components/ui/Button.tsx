import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { sound } from '@/audio/SoundManager';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 rounded-2xl font-display font-extrabold tracking-tight transition-all duration-150 ease-pop disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none active:translate-y-[3px] active:shadow-pop-sm';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-grape-400 via-grape-500 to-grape-600 text-white shadow-pop shadow-inset-top hover:-translate-y-[2px] hover:brightness-105',
  secondary:
    'bg-white text-grape-700 shadow-pop shadow-inset-top ring-2 ring-grape-100 hover:-translate-y-[2px] hover:ring-grape-200',
  ghost:
    'bg-white/0 text-ink-soft hover:bg-white/70 hover:text-grape-700 active:translate-y-0 shadow-none',
  danger:
    'bg-gradient-to-br from-bubble-400 to-bubble-600 text-white shadow-pop shadow-inset-top hover:-translate-y-[2px] hover:brightness-105',
  success:
    'bg-gradient-to-br from-mint-400 to-mint-500 text-[#053B2C] shadow-pop shadow-inset-top hover:-translate-y-[2px] hover:brightness-105',
  dark: 'bg-ink text-white shadow-pop shadow-inset-top hover:-translate-y-[2px] hover:bg-ink-soft',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-13 px-6 text-lg [height:3.25rem]',
  xl: 'h-14 px-7 text-xl',
};

export interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** desliga o som de clique (útil em botões que já tocam outro som) */
  silent?: boolean;
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block,
  className,
}: ButtonBaseProps & { className?: string }): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className);
}

export type ButtonProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block,
    loading,
    icon,
    iconRight,
    silent,
    className,
    children,
    onClick,
    onPointerEnter,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled || loading}
      onPointerEnter={(event) => {
        if (!silent && !disabled) sound.play('hover');
        onPointerEnter?.(event);
      }}
      onClick={(event) => {
        if (!silent) sound.play('click');
        onClick?.(event);
      }}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </button>
  );
});

export type ButtonLinkProps = ButtonBaseProps & LinkProps;

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  iconRight,
  silent,
  className,
  children,
  onClick,
  ...rest
}: ButtonLinkProps): JSX.Element {
  return (
    <Link
      className={buttonClasses({ variant, size, block, className })}
      onPointerEnter={() => !silent && sound.play('hover')}
      onClick={(event) => {
        if (!silent) sound.play('click');
        onClick?.(event);
      }}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

/** Botão redondo de ícone (usado em toolbars e no HUD). */
export function IconButton({
  label,
  className,
  variant = 'secondary',
  size = 'md',
  children,
  onClick,
  ...rest
}: ButtonProps & { label: string }): JSX.Element {
  const dimension = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        BASE,
        VARIANTS[variant],
        dimension,
        'rounded-full p-0 text-base',
        className,
      )}
      onPointerEnter={() => sound.play('hover')}
      onClick={(event) => {
        sound.play('click');
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
