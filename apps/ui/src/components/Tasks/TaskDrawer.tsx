import * as Dialog from '@radix-ui/react-dialog';
import type { Task } from './types';

export function TaskDrawer({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 h-dvh w-full max-w-xl border-l border-white/10 bg-[#0a1020] p-6 shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold tracking-tight">
                {task ? `${task.id} · ${task.title}` : 'Task'}
              </Dialog.Title>
              <div className="mt-1 text-sm text-slate-400">Task drawer placeholder</div>
            </div>
            <Dialog.Close
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
              aria-label="Close"
            >
              Close
            </Dialog.Close>
          </div>

          <div className="mt-6 grid gap-3">
            <PlaceholderRow label="Status" value={task?.status ?? '—'} />
            <PlaceholderRow label="Priority" value={task?.priority ?? '—'} />
            <PlaceholderRow label="Assignee" value={task?.assignee ?? '—'} />
            <PlaceholderRow label="Updated" value={task?.updatedAt ?? '—'} />
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Notes</div>
            <p className="mt-2 leading-relaxed">
              This panel is intentionally a placeholder. Next steps: wire to tasks API, add comments/activity, and implement
              real editing.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PlaceholderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm text-slate-200">{value}</div>
    </div>
  );
}
