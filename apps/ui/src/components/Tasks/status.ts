import type { TaskStatus } from '../../api/types';

export function statusLabel(s: TaskStatus) {
  if (s === 'todo') return 'Todo';
  if (s === 'doing') return 'Doing';
  if (s === 'done') return 'Done';
  return 'Blocked';
}
