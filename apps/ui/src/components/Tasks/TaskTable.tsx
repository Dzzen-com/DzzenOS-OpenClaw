import type { ReactNode } from 'react';
import type { Task } from '../../api/types';
import { statusLabel } from './status';
import { shortId } from './taskId';
import { formatUpdatedAt } from './taskTime';

export function TaskTable({
  tasks,
  selectedTaskId,
  onSelectTask,
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-500">
            <Th>Task</Th>
            <Th>Status</Th>
            <Th>Updated</Th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const selected = t.id === selectedTaskId;
            return (
              <tr
                key={t.id}
                className={
                  'cursor-pointer border-t border-white/10 text-sm text-slate-200 transition ' +
                  (selected ? 'bg-white/10' : 'hover:bg-white/5')
                }
                onClick={() => onSelectTask(t.id)}
              >
                <Td>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-5 w-14 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[11px] font-semibold text-slate-300">
                      {shortId(t.id)}
                    </span>
                    <div className="min-w-0">
                      <div className="line-clamp-1">{t.title}</div>
                      {t.description ? <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{t.description}</div> : null}
                    </div>
                  </div>
                </Td>
                <Td>
                  <StatusPill status={t.status} />
                </Td>
                <Td className="text-slate-400">{formatUpdatedAt(t.updated_at)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: string }) {
  return <th className="border-b border-white/10 px-4 py-3">{children}</th>;
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={'border-b border-white/10 px-4 py-3 ' + (className ?? '')}>{children}</td>;
}

function StatusPill({ status }: { status: Task['status'] }) {
  const cls =
    status === 'done'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
      : status === 'doing'
        ? 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200'
        : status === 'blocked'
          ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
          : 'border-white/10 bg-white/5 text-slate-300';

  return (
    <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + cls}>
      {statusLabel(status)}
    </span>
  );
}
