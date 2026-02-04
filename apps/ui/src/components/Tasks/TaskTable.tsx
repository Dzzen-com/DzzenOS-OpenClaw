import type { Task } from './types';

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
            <Th>Priority</Th>
            <Th>Assignee</Th>
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
                    <span className="inline-flex h-5 w-12 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[11px] font-semibold text-slate-300">
                      {t.id}
                    </span>
                    <span className="line-clamp-1">{t.title}</span>
                  </div>
                </Td>
                <Td>
                  <StatusPill status={t.status} />
                </Td>
                <Td>
                  <PriorityPill priority={t.priority} />
                </Td>
                <Td className="text-slate-300">{t.assignee}</Td>
                <Td className="text-slate-400">{t.updatedAt}</Td>
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

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={'border-b border-white/10 px-4 py-3 ' + (className ?? '')}>{children}</td>;
}

function StatusPill({ status }: { status: Task['status'] }) {
  const cls =
    status === 'Done'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
      : status === 'In Progress'
        ? 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200'
        : status === 'Planned'
          ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200'
          : 'border-white/10 bg-white/5 text-slate-300';

  return (
    <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + cls}>{status}</span>
  );
}

function PriorityPill({ priority }: { priority: Task['priority'] }) {
  const cls =
    priority === 'High'
      ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
      : priority === 'Medium'
        ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
        : 'border-white/10 bg-white/5 text-slate-300';

  return (
    <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + cls}>{priority}</span>
  );
}
