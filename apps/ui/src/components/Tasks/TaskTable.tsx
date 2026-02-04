import type { Task } from '../../api/types';
import { Badge } from '../ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => {
            const selected = t.id === selectedTaskId;
            return (
              <TableRow
                key={t.id}
                data-selected={selected}
                className="cursor-pointer"
                onClick={() => onSelectTask(t.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="h-5 w-14 justify-center rounded-md px-0 text-[11px] font-semibold">
                      {shortId(t.id)}
                    </Badge>
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-foreground">{t.title}</div>
                      {t.description ? (
                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.description}</div>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusPill status={t.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatUpdatedAt(t.updated_at)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusPill({ status }: { status: Task['status'] }) {
  const variant =
    status === 'done'
      ? 'success'
      : status === 'doing'
        ? 'info'
        : status === 'blocked'
          ? 'danger'
          : 'default';

  return <Badge variant={variant as any}>{statusLabel(status)}</Badge>;
}
