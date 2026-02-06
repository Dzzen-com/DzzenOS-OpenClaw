import * as React from 'react';
import { cn } from '../../lib/cn';

type IconButtonVariant = 'ghost' | 'subtle';
type IconButtonSize = 'sm' | 'md';

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = 'subtle', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-border/60 transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-7 w-7 text-xs',
        size === 'md' && 'h-8 w-8 text-sm',
        variant === 'subtle' && 'bg-surface-2/60 text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        variant === 'ghost' && 'border-transparent bg-transparent text-muted-foreground hover:bg-surface-2/50 hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
});
