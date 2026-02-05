import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBoards } from '../../api/queries';
import { Spinner } from '../ui/Spinner';
import { InlineAlert } from '../ui/InlineAlert';
import { StatusDot } from '../ui/StatusDot';

export function Sidebar({
  selectedPage,
  onSelectPage,
  selectedBoardId,
  onSelectBoard,
  mobileOpen = false,
  onCloseMobile,
}: {
  selectedPage: 'dashboard' | 'tasks' | 'automations' | 'docs' | 'agents';
  onSelectPage: (p: 'dashboard' | 'tasks' | 'automations' | 'docs' | 'agents') => void;
  selectedBoardId: string | null;
  onSelectBoard: (id: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const boardsQ = useQuery({ queryKey: ['boards'], queryFn: listBoards });
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
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

  useEffect(() => {
    if (selectedBoardId) return;
    const first = boardsQ.data?.[0];
    if (first) onSelectBoard(first.id);
  }, [boardsQ.data, onSelectBoard, selectedBoardId]);

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
        <SectionTitle>Overview</SectionTitle>
        <NavItem
          active={selectedPage === 'dashboard'}
          onClick={() => {
            onSelectPage('dashboard');
            onCloseMobile?.();
          }}
        >
          Dashboard
        </NavItem>
        <NavItem
          active={selectedPage === 'docs'}
          onClick={() => {
            onSelectPage('docs');
            onCloseMobile?.();
          }}
        >
          Docs
        </NavItem>
        <NavItem
          active={selectedPage === 'automations'}
          onClick={() => {
            onSelectPage('automations');
            onCloseMobile?.();
          }}
        >
          Automations
        </NavItem>
        <NavItem
          active={selectedPage === 'agents'}
          onClick={() => {
            onSelectPage('agents');
            onCloseMobile?.();
          }}
        >
          Agent Library
        </NavItem>
        <NavLink
          href={openclawHref}
          onClick={() => {
            onCloseMobile?.();
          }}
        >
          OpenClaw UI
        </NavLink>

        <SectionTitle>Boards</SectionTitle>

        {boardsQ.isLoading ? (
          <div className="px-3 py-2">
            <Spinner label="Loading…" />
          </div>
        ) : null}
        {boardsQ.isError ? (
          <div className="px-3 py-2">
            <InlineAlert>{String(boardsQ.error)}</InlineAlert>
          </div>
        ) : null}

        {(boardsQ.data ?? []).map((b) => (
          <NavItem
            key={b.id}
            active={selectedPage === 'tasks' && b.id === selectedBoardId}
            onClick={() => {
              onSelectBoard(b.id);
              onSelectPage('tasks');
              onCloseMobile?.();
            }}
          >
            {b.name}
          </NavItem>
        ))}
      </nav>

      <div className="mt-auto border-t border-border/70 p-3 text-xs text-muted-foreground">
        API: <span className="text-foreground/80">/boards</span> • <span className="text-foreground/80">/tasks</span> •{' '}
        <span className="text-foreground/80">/docs</span>
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
}: {
  children: string;
  active?: boolean;
  onClick: () => void;
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
      <span className="truncate">{children}</span>
    </button>
  );
}

function NavLink({ children, href, onClick }: { children: string; href: string; onClick?: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/90 transition hover:bg-surface-2/50"
    >
      <StatusDot tone="muted" />
      <span className="truncate">{children}</span>
    </a>
  );
}
