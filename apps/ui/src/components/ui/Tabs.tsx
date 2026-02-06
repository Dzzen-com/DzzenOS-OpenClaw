import * as React from 'react';
import { cn } from '../../lib/cn';

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
  value: valueProp,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = valueProp ?? uncontrolled;

  const setValue = React.useCallback(
    (v: string) => {
      if (valueProp == null) setUncontrolled(v);
      onValueChange?.(v);
    },
    [onValueChange, valueProp],
  );

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex h-9 items-center rounded-md border border-border/60 bg-surface-2/60 p-1 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('TabsTrigger must be used within <Tabs>');

  const active = ctx.value === value;

  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        'inline-flex h-7 items-center justify-center rounded px-2.5 text-xs font-medium transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'bg-surface-1 text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-surface-2/70 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('TabsContent must be used within <Tabs>');

  if (ctx.value !== value) return null;

  return (
    <div className={cn('mt-3', className)} {...props}>
      {children}
    </div>
  );
}
