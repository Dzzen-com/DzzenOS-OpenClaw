import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBoards } from '../../api/queries';
import { Spinner } from '../ui/Spinner';
import { InlineAlert } from '../ui/InlineAlert';

export function Sidebar({
  selectedBoardId,
  onSelectBoard,
}: {
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
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0a1020] sm:flex sm:flex-col">
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-indigo-400 to-cyan-400 opacity-90" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">DzzenOS</div>
            <div className="text-xs text-slate-400">Local</div>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <SectionTitle>Boards</SectionTitle>

        {boardsQ.isLoading ? <div className="px-3 py-2"><Spinner label="Loading…" /></div> : null}
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

      <div className="mt-auto border-t border-white/10 p-3 text-xs text-slate-500">
        API: <span className="text-slate-400">/boards</span> • <span className="text-slate-400">/tasks</span>
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div className="px-3 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-slate-500">{children}</div>;
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
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5 ' +
        (active ? 'bg-white/10' : '')
      }
    >
      <span className="h-2 w-2 rounded-full bg-white/30" />
      <span className="truncate">{children}</span>
    </button>
  );
}
