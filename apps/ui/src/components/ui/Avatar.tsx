import { cn } from '../../lib/cn';

type AvatarSize = 'sm' | 'md' | 'lg';

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const initials =
    name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() ?? 'U';

  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs';

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center overflow-hidden rounded-full border border-border/70 bg-surface-2/70 text-foreground',
        sizeClass,
        className,
      )}
    >
      {src ? <img src={src} alt={name ?? 'User avatar'} className="h-full w-full object-cover" /> : initials}
    </div>
  );
}
