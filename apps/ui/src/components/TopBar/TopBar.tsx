import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border/70 bg-background/60 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="sm:hidden">
          <div className="h-8 w-8 rounded-lg bg-muted/30" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Search (placeholder)" className="hidden w-64 sm:block" />
        <Button variant="secondary">New</Button>
      </div>
    </header>
  );
}
