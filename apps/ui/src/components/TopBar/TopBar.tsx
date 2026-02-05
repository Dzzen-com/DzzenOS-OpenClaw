import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { useMobileNav } from '../../state/mobile-nav';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';

function isDomainMode(): boolean {
  // When installed behind Caddy, UI is built with VITE_API_BASE=/dzzenos-api.
  // In local dev / local gateway mode we do not have /auth routes on the gateway origin.
  // We keep the logout button hidden unless we detect domain mode.
  const apiBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  return typeof apiBase === 'string' && apiBase.trim().startsWith('/dzzenos-api');
}

async function logout() {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  } finally {
    window.location.href = '/login';
  }
}

export function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
  const mobileNav = useMobileNav();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="sm:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-surface-2/40 text-foreground/80"
          aria-label="Open menu"
          onClick={() => mobileNav.toggle()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground font-display">{title}</div>
          <div className="truncate text-xs text-muted-foreground compact-hide">{subtitle}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Search (placeholder)" className="hidden w-64 sm:block" />
        <DropdownMenuRoot>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">New</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Quick create</DropdownMenuLabel>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Task</DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Automation</DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Doc (soon)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Import from CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuRoot>
        {isDomainMode() ? (
          <Button variant="ghost" onClick={() => logout()}>
            Log out
          </Button>
        ) : null}
        <Tooltip label="Local user">
          <Avatar name="Local User" />
        </Tooltip>
      </div>
    </header>
  );
}
