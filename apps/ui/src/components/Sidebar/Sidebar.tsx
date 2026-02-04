import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBoards } from '../../api/queries';
import { Spinner } from '../ui/Spinner';
import { InlineAlert } from '../ui/InlineAlert';

export function Sidebar({
  selectedPage,
  onSelectPage,
  selectedBoardId,
  onSelectBoard,
}: {
  selectedPage: 'dashboard' | 'tasks';
  onSelectPage: (p: 'dashboard' | 'tasks') => void;
  selectedBoardId: string | null;
  onSelectBoard: (id: string) => void;
}) {
  const boardsQ = useQuery({ queryKey: ['boards'], queryFn: listBoards });

  useEffect(() => {
    if (selectedBoardId) return;
    const first = boardsQ.data?.[0];
    if (first) onSelectBoard(first.id);
  }, [boardsQ.data, onSelectBoard, selectedBoardId]);

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-card sm:flex sm:flex-col">
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-indigo-400 to-cyan-400 opacity-90" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-foreground">DzzenOS</div>
            <div className="text-xs text-muted-foreground">Local</div>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
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
          <NavItem key={b.id} active={b.id === selectedBoardId} onClick={() => onSelectBoard(b.id)}>
            {b.name}
          </NavItem>
        ))}
      </nav>

      <div className="mt-auto border-t border-border/70 p-3 text-xs text-muted-foreground">
        API: <span className="text-foreground/80">/boards</span> • <span className="text-foreground/80">/tasks</span>
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="px-3 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{children}</div>
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
        'text-foreground/90 hover:bg-muted/30 ' +
        (active ? 'bg-muted/50 text-foreground' : '')
      }
    >
      <span className={"h-2 w-2 rounded-full " + (active ? 'bg-primary/80' : 'bg-foreground/30')} />
      <span className="truncate">{children}</span>
    </button>
  );
}
