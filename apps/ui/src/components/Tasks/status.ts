import type { TaskStatus } from '../../api/types';

export function statusLabel(s: TaskStatus) {
  if (s === 'ideas') return 'Ideas';
  if (s === 'todo') return 'To do';
  if (s === 'doing') return 'In progress';
  if (s === 'review') return 'Review';
  if (s === 'release') return 'Release';
  if (s === 'done') return 'Done';
  if (s === 'archived') return 'Archived';
  return 'Unknown';
}
