import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/cn';

export const DropdownMenuRoot = DropdownMenu.Root;
export const DropdownMenuTrigger = DropdownMenu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: DropdownMenu.DropdownMenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        className={cn(
          'min-w-[180px] rounded-xl border border-border/70 bg-surface-1/95 p-1 text-sm text-foreground shadow-popover backdrop-blur',
          'data-[state=open]:animate-rise',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  inset,
  ...props
}: DropdownMenu.DropdownMenuItemProps & { inset?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition',
        'focus:bg-surface-2/70 focus:text-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: DropdownMenu.DropdownMenuLabelProps) {
  return <DropdownMenu.Label className={cn('px-2.5 py-2 text-xs uppercase tracking-wider text-muted-foreground', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: DropdownMenu.DropdownMenuSeparatorProps) {
  return <DropdownMenu.Separator className={cn('my-1 h-px bg-border/70', className)} {...props} />;
}
