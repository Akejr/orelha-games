import { cn } from '@/utils/cn';

/** Estado de carregamento com brilho suave, no mesmo tom da marca. */
export function Skeleton({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-2xl bg-[length:200%_100%]',
        'bg-gradient-to-r from-grape-100 via-white to-grape-100',
        className,
      )}
    />
  );
}

export function GameCardSkeleton(): JSX.Element {
  return (
    <div className="surface-solid overflow-hidden p-0">
      <Skeleton className="h-44 rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}
