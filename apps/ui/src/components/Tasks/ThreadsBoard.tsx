import type { Task, TaskStatus } from '../../api/types';
import { TaskBoard } from './TaskBoard';

export function ThreadsBoard({
  tasks,
  selectedTaskId,
  onSelectTask,
  onMoveTask,
  moveDisabled,
  onReorder,
  onQuickCreate,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onMoveTask?: (id: string, status: TaskStatus) => void;
  moveDisabled?: boolean;
  onReorder?: (status: TaskStatus, orderedIds: string[]) => void;
  onQuickCreate?: (status: TaskStatus, title: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  return (
    <TaskBoard
      variant="threads"
      tasks={tasks}
      selectedTaskId={selectedTaskId}
      onSelectTask={onSelectTask}
      onMoveTask={onMoveTask}
      moveDisabled={moveDisabled}
      onReorder={onReorder}
      onQuickCreate={onQuickCreate}
      selectionMode={selectionMode}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
    />
  );
}
