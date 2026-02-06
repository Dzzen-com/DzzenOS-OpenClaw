import type { TaskStatus } from '../../api/types';
import i18next from 'i18next';

export function statusLabel(s: TaskStatus, t?: (key: string, options?: any) => string) {
  const tr = t ?? i18next.t.bind(i18next);
  if (s === 'ideas') return tr('Ideas');
  if (s === 'todo') return tr('To do');
  if (s === 'doing') return tr('In progress');
  if (s === 'review') return tr('Review');
  if (s === 'release') return tr('Release');
  if (s === 'done') return tr('Done');
  if (s === 'archived') return tr('Archived');
  return tr('Unknown');
}
