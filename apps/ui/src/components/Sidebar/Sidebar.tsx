import { useRef } from 'react';
import type { ReactNode } from 'react';
import { StatusDot } from '../ui/StatusDot';
import {
  IconBot,
  IconExternal,
  IconFile,
  IconKanban,
  IconLayout,
  IconSpark,
  IconSettings,
  IconWorkflow,
} from '../ui/Icons';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { Button } from '../ui/Button';

export function Sidebar({
  selectedPage,
  onSelectPage,
  mobileOpen = false,
  onCloseMobile,
}: {
  selectedPage: 'dashboard' | 'kanban' | 'automations' | 'docs' | 'agents' | 'skills';
  onSelectPage: (p: 'dashboard' | 'kanban' | 'automations' | 'docs' | 'agents' | 'skills') => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const platformSettingsUrl = (import.meta as any).env?.VITE_PLATFORM_SETTINGS_URL as string | undefined;
  const envOpenclawPath = (import.meta as any).env?.VITE_OPENCLAW_PATH as string | undefined;
  const derivedPath = (() => {
    if (envOpenclawPath && envOpenclawPath.trim()) return envOpenclawPath.trim();
    const host = window?.location?.hostname ?? '';
    if (host === 'localhost' || host === '127.0.0.1') return '/';
    return '/openclaw';
  })();
  const openclawHref = derivedPath.startsWith('http')
    ? derivedPath
    : derivedPath.startsWith('/')
      ? derivedPath
      : `/${derivedPath}`;
  const settingsHref = platformSettingsUrl && platformSettingsUrl.trim() ? platformSettingsUrl.trim() : '';

  return (
    <aside
      onTouchStart={(e) => {
        if (!mobileOpen) return;
        const t = e.touches[0];
        touchStartX.current = t.clientX;
        touchStartY.current = t.clientY;
      }}
      onTouchMove={(e) => {
        if (!mobileOpen) return;
        const t = e.touches[0];
        const startX = touchStartX.current;
        const startY = touchStartY.current;
        if (startX == null || startY == null) return;
        const dx = t.clientX - startX;
        const dy = Math.abs(t.clientY - startY);
        if (dx < -60 && dy < 40) {
          onCloseMobile?.();
          touchStartX.current = null;
          touchStartY.current = null;
        }
      }}
      onTouchEnd={() => {
        touchStartX.current = null;
        touchStartY.current = null;
      }}
      className={
        'fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-border/60 bg-card/90 backdrop-blur transition sm:static sm:flex sm:flex-col ' +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full') +
        ' sm:translate-x-0'
      }
    >
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-sky-400 to-teal-400 opacity-90 shadow-sm" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-foreground font-display">DzzenOS</div>
            <div className="text-xs text-muted-foreground">Local</div>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <SectionTitle>Workspace</SectionTitle>
        <NavItem
          active={selectedPage === 'dashboard'}
          onClick={() => {
            onSelectPage('dashboard');
            onCloseMobile?.();
          }}
          icon={<IconLayout />}
        >
          Dashboard
        </NavItem>
        <NavItem
          active={selectedPage === 'kanban'}
          onClick={() => {
            onSelectPage('kanban');
            onCloseMobile?.();
          }}
          icon={<IconKanban />}
        >
          Kanban
        </NavItem>
        <NavItem
          active={selectedPage === 'automations'}
          onClick={() => {
            onSelectPage('automations');
            onCloseMobile?.();
          }}
          icon={<IconWorkflow />}
        >
          Automations
        </NavItem>
        <NavItem
          active={selectedPage === 'agents'}
          onClick={() => {
            onSelectPage('agents');
            onCloseMobile?.();
          }}
          icon={<IconBot />}
        >
          Agent Library
        </NavItem>
        <NavItem
          active={selectedPage === 'skills'}
          onClick={() => {
            onSelectPage('skills');
            onCloseMobile?.();
          }}
          icon={<IconSpark />}
        >
          Skills
        </NavItem>
        <NavItem
          active={selectedPage === 'docs'}
          onClick={() => {
            onSelectPage('docs');
            onCloseMobile?.();
          }}
          icon={<IconFile />}
        >
          Docs
        </NavItem>
        <NavLink
          href={openclawHref}
          onClick={() => {
            onCloseMobile?.();
          }}
          icon={<IconExternal />}
        >
          OpenClaw UI
        </NavLink>
      </nav>

      <div className="mt-auto border-t border-border/70 p-3">
        <DropdownMenuRoot>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="w-full justify-start">
              <IconSettings className="h-4 w-4" />
              Settings
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="min-w-[220px]">
            <DropdownMenuLabel>Platform</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!settingsHref}
              onSelect={(e) => {
                e.preventDefault();
                if (!settingsHref) return;
                window.location.href = settingsHref;
              }}
            >
              DzzenOS Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                window.location.href = openclawHref;
              }}
            >
              OpenClaw Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuRoot>
        <div className="mt-3 text-[11px] text-muted-foreground">
          <div>API: /boards • /tasks • /docs</div>
          <div className="mt-1">Realtime: SSE</div>
        </div>
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="px-3 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function NavItem({
  children,
  active,
  onClick,
  icon,
}: {
  children: string;
  active?: boolean;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition ' +
        'text-foreground/90 hover:bg-surface-2/50 ' +
        (active ? 'bg-surface-2/80 text-foreground' : '')
      }
    >
      <StatusDot tone={active ? 'info' : 'muted'} />
      {icon ? <span className="text-muted-foreground/90">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

function NavLink({
  children,
  href,
  icon,
  onClick,
}: {
  children: string;
  href: string;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/90 transition hover:bg-surface-2/50"
    >
      <StatusDot tone="muted" />
      {icon ? <span className="text-muted-foreground/90">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </a>
  );
}
