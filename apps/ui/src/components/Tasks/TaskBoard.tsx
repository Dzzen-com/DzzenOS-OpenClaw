import * as React from 'react';
import { useEffect, useMemo, useState, useRef } from 'react';
import type { Task, TaskStatus } from '../../api/types';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import { StatusDot } from '../ui/StatusDot';
import { cn } from '../../lib/cn';
import { shortId } from './taskId';
import { formatUpdatedAt } from './taskTime';
import { statusLabel } from './status';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';

type ColumnMeta = {
  status: TaskStatus;
  title: string;
  subtitle: string;
  tone: 'muted' | 'info' | 'danger' | 'success' | 'warning';
  emptyLabel: string;
};

const COLUMNS: ColumnMeta[] = [
  { status: 'ideas', title: 'Ideas', subtitle: 'Captured thoughts', tone: 'muted', emptyLabel: 'No ideas yet.' },
  { status: 'todo', title: 'To do', subtitle: 'Ready to start', tone: 'muted', emptyLabel: 'No planned work.' },
  { status: 'doing', title: 'In progress', subtitle: 'Active runs', tone: 'info', emptyLabel: 'Nothing in progress.' },
  { status: 'review', title: 'Review', subtitle: 'Needs checks', tone: 'warning', emptyLabel: 'No reviews.' },
  { status: 'release', title: 'Release', subtitle: 'Preparing launch', tone: 'warning', emptyLabel: 'No release items.' },
  { status: 'done', title: 'Done', subtitle: 'Recently shipped', tone: 'success', emptyLabel: 'No completed tasks.' },
  { status: 'archived', title: 'Archive', subtitle: 'Closed & stored', tone: 'muted', emptyLabel: 'Nothing archived.' },
];

function sortByPosition(a: Task, b: Task) {
  if (a.position !== b.position) return a.position - b.position;
  const aTime = Date.parse(a.updated_at);
  const bTime = Date.parse(b.updated_at);
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
  return a.title.localeCompare(b.title);
}

export function TaskBoard({
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
  const columnIds = useMemo(() => COLUMNS.map((c) => c.status), []);

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) map.set(task.id, task);
    return map;
  }, [tasks]);

  const baseOrder = useMemo(() => {
    const next: Record<TaskStatus, string[]> = {
      ideas: [],
      todo: [],
      doing: [],
      review: [],
      release: [],
      done: [],
      archived: [],
    };
    const sorted = [...tasks].sort(sortByPosition);
    for (const task of sorted) {
      const status = columnIds.includes(task.status) ? task.status : 'todo';
      next[status].push(task.id);
    }
    return next;
  }, [tasks]);

  const [columns, setColumns] = useState<Record<TaskStatus, string[]>>(baseOrder);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<TaskStatus | null>(null);
  const isDragging = !!activeId;

  useEffect(() => {
    setColumns(baseOrder);
  }, [baseOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTask = activeId ? tasksById.get(activeId) ?? null : null;

  const findColumn = (id: string, state: Record<TaskStatus, string[]> = columns): TaskStatus | null => {
    if (columnIds.includes(id as TaskStatus)) return id as TaskStatus;
    return columnIds.find((col) => state[col].includes(id)) ?? null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    setActiveOrigin(findColumn(id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const active = event.active?.id;
    const over = event.over?.id;
    if (!active || !over) return;
    const activeIdStr = String(active);
    const overIdStr = String(over);
    const activeColumn = findColumn(activeIdStr);
    const overColumn = findColumn(overIdStr);
    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    setColumns((prev) => {
      const next = { ...prev };
      next[activeColumn] = next[activeColumn].filter((id) => id !== activeIdStr);
      const overItems = next[overColumn];
      const overIndex = overItems.indexOf(overIdStr);
      const insertIndex = overIndex >= 0 ? overIndex : overItems.length;
      next[overColumn] = [...overItems.slice(0, insertIndex), activeIdStr, ...overItems.slice(insertIndex)];
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const active = event.active?.id;
    const over = event.over?.id;
    if (!active || !over) {
      setActiveId(null);
      return;
    }

    const activeIdStr = String(active);
    const overIdStr = String(over);
    const activeColumn = findColumn(activeIdStr);
    const overColumn = findColumn(overIdStr);
    if (!activeColumn || !overColumn) {
      setActiveId(null);
      return;
    }

    const originColumn = activeOrigin ?? activeColumn;

    if (originColumn === overColumn) {
      const activeIndex = columns[overColumn].indexOf(activeIdStr);
      const overIndex = columns[overColumn].indexOf(overIdStr);
      if (activeIndex !== overIndex && overIndex >= 0) {
        const nextOrder = arrayMove(columns[overColumn], activeIndex, overIndex);
        setColumns((prev) => ({
          ...prev,
          [overColumn]: nextOrder,
        }));
        onReorder?.(overColumn, nextOrder);
      }
    } else {
      const nextOrigin = columns[originColumn].filter((id) => id !== activeIdStr);
      const nextOver = columns[overColumn].includes(activeIdStr)
        ? columns[overColumn]
        : [...columns[overColumn], activeIdStr];
      setColumns((prev) => ({ ...prev, [originColumn]: nextOrigin, [overColumn]: nextOver }));
      onMoveTask?.(activeIdStr, overColumn);
      onReorder?.(originColumn, nextOrigin);
      onReorder?.(overColumn, nextOver);
    }

    setActiveId(null);
    setActiveOrigin(null);
  };
  const handleDragCancel = () => {
    setActiveId(null);
    setActiveOrigin(null);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={cn('flex items-start gap-4 overflow-x-auto pb-3', moveDisabled && 'opacity-70')}>
        {COLUMNS.map((col) => {
          const ids = (columns[col.status] ?? []).filter((id) => tasksById.has(id));
          const items = ids.map((id) => tasksById.get(id)).filter(Boolean) as Task[];
          return (
            <TaskColumn
              key={col.status}
              col={col}
              ids={ids}
              items={items}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              moveDisabled={moveDisabled}
              onQuickCreate={onQuickCreate}
              dragging={isDragging}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} selected={false} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function TaskColumn({
  col,
  ids,
  items,
  selectedTaskId,
  onSelectTask,
  moveDisabled,
  onQuickCreate,
  dragging,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: {
  col: ColumnMeta;
  ids: string[];
  items: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  moveDisabled?: boolean;
  onQuickCreate?: (status: TaskStatus, title: string) => void;
  dragging?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status, disabled: !!moveDisabled || !!selectionMode });
  const listRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);
  const calcRef = useRef<() => void>(() => {});
  const [range, setRange] = useState<{ start: number; end: number; padTop: number; padBottom: number }>({
    start: 0,
    end: items.length,
    padTop: 0,
    padBottom: 0,
  });
  const shouldVirtualize = items.length > 30 && !dragging;
  const ESTIMATE = 108;
  const OVERSCAN = 6;

  const scheduleCalc = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      calcRef.current();
    });
  };

  useEffect(() => {
    calcRef.current = () => {
      const el = listRef.current;
      if (!el) return;
      if (!shouldVirtualize) {
        setRange({ start: 0, end: items.length, padTop: 0, padBottom: 0 });
        return;
      }

      const height = el.clientHeight || 1;
      const scrollTop = el.scrollTop || 0;
      const n = items.length;

      const offsets: number[] = new Array(n);
      const heights: number[] = new Array(n);
      let total = 0;
      for (let i = 0; i < n; i++) {
        offsets[i] = total;
        const h = heightsRef.current.get(items[i].id);
        const size = Number.isFinite(h) && h! > 0 ? h! : ESTIMATE;
        heights[i] = size;
        total += size;
      }

      const lowerBound = (arr: number[], value: number) => {
        let l = 0;
        let r = arr.length;
        while (l < r) {
          const m = (l + r) >> 1;
          if (arr[m] < value) l = m + 1;
          else r = m;
        }
        return l;
      };

      let start = lowerBound(offsets, scrollTop);
      if (start > 0) start -= 1;
      while (start < n && offsets[start] + heights[start] <= scrollTop) start += 1;

      let end = lowerBound(offsets, scrollTop + height);
      if (end < n) end += 1;

      start = Math.max(0, start - OVERSCAN);
      end = Math.min(n, end + OVERSCAN);

      const padTop = offsets[start] ?? 0;
      const padBottom = Math.max(0, total - (offsets[end] ?? total));
      setRange({ start, end, padTop, padBottom });
    };
  }, [items, shouldVirtualize]);

  useEffect(() => {
    if (!shouldVirtualize) {
      setRange({ start: 0, end: items.length, padTop: 0, padBottom: 0 });
      return;
    }
    const el = listRef.current;
    if (!el) return;
    calcRef.current();
    const onScroll = () => scheduleCalc();
    const onResize = () => scheduleCalc();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [items.length, shouldVirtualize]);

  const setHeight = (id: string, h: number) => {
    const prev = heightsRef.current.get(id);
    if (prev === h) return;
    heightsRef.current.set(id, h);
    if (shouldVirtualize) scheduleCalc();
  };

  const paddedTop = shouldVirtualize ? range.padTop : 0;
  const paddedBottom = shouldVirtualize ? range.padBottom : 0;
  const visibleItems = shouldVirtualize ? items.slice(range.start, range.end) : items;

  return (
    <section key={col.status} className="w-[240px] shrink-0 sm:w-[280px]">
      <div className="rounded-xl border border-border/70 bg-surface-1/70 shadow-panel backdrop-blur">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2 sm:px-4 sm:py-3">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground sm:text-sm">
              <StatusDot tone={col.tone} />
              <span>{col.title}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{col.subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-6 rounded-md px-2 text-[11px]">
              {items.length}
            </Badge>
            <IconButton size="sm" variant="ghost" aria-label="Column options" title="Column options">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <circle cx="4" cy="10" r="1.6" />
                <circle cx="10" cy="10" r="1.6" />
                <circle cx="16" cy="10" r="1.6" />
              </svg>
            </IconButton>
          </div>
        </div>

        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-[120px] flex-col gap-2 p-2.5 transition sm:p-3',
            isOver ? 'bg-surface-2/40' : 'bg-transparent',
          )}
        >
          <div className="flex max-h-[calc(100dvh-280px)] flex-1 flex-col sm:max-h-[calc(100vh-260px)]">
            <div ref={listRef} className="flex-1 overflow-y-auto pr-1">
              <div style={{ paddingTop: paddedTop, paddingBottom: paddedBottom }}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 bg-surface-2/40 px-3 py-4 text-xs text-muted-foreground">
                      {col.emptyLabel}
                    </div>
                  ) : (
                    visibleItems.map((task, idx) => (
                      <SortableTaskCard
                        key={task.id}
                        task={task}
                        selected={task.id === selectedTaskId}
                        bulkSelected={!!selectedIds?.has(task.id)}
                        onSelect={onSelectTask}
                        disabled={moveDisabled}
                        onMeasure={setHeight}
                        dataIndex={shouldVirtualize ? range.start + idx : undefined}
                        selectionMode={selectionMode}
                        onToggleSelect={onToggleSelect}
                      />
                    ))
                  )}
                </SortableContext>
              </div>
            </div>
            {onQuickCreate ? <QuickCreate status={col.status} onCreate={onQuickCreate} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickCreate({
  status,
  onCreate,
}: {
  status: TaskStatus;
  onCreate: (status: TaskStatus, title: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <form
      className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-surface-2/40 px-2 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const title = value.trim();
        if (!title) return;
        onCreate(status, title);
        setValue('');
      }}
    >
      <input
        className="h-7 flex-1 bg-transparent text-xs text-foreground outline-none"
        placeholder="New card…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <IconButton size="sm" variant="ghost" aria-label="Add card" disabled={!value.trim()}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </IconButton>
    </form>
  );
}

function SortableTaskCard({
  task,
  selected,
  bulkSelected,
  onSelect,
  disabled,
  onMeasure,
  dataIndex,
  selectionMode,
  onToggleSelect,
}: {
  task: Task;
  selected: boolean;
  bulkSelected: boolean;
  onSelect: (id: string) => void;
  disabled?: boolean;
  onMeasure?: (id: string, h: number) => void;
  dataIndex?: number;
  selectionMode?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: disabled || !!selectionMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      selected={selected}
      bulkSelected={bulkSelected}
      dragging={isDragging}
      style={style}
      onMeasure={onMeasure}
      data-index={dataIndex}
      onClick={() => {
        if (isDragging) return;
        if (selectionMode) {
          onToggleSelect?.(task.id);
          return;
        }
        onSelect(task.id);
      }}
      selectionMode={selectionMode}
      {...attributes}
      {...listeners}
    />
  );
}

const TaskCard = React.forwardRef<
  HTMLButtonElement,
  {
    task: Task;
    selected: boolean;
    bulkSelected?: boolean;
    selectionMode?: boolean;
    dragging?: boolean;
    style?: React.CSSProperties;
    onClick?: () => void;
    onMeasure?: (id: string, h: number) => void;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function TaskCard({ task, selected, bulkSelected, selectionMode, dragging, style, onClick, onMeasure, ...props }, ref) {
  const localRef = React.useRef<HTMLButtonElement | null>(null);
  const setRefs = (node: HTMLButtonElement | null) => {
    localRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref && 'current' in ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
  };

  React.useEffect(() => {
    if (!onMeasure || !localRef.current) return;
    const el = localRef.current;
    const update = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) onMeasure(task.id, h);
    };

    update();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure, task.id]);

  const tone =
    task.status === 'done'
      ? 'success'
      : task.status === 'doing'
        ? 'info'
        : task.status === 'review' || task.status === 'release'
          ? 'warning'
          : task.status === 'archived'
            ? 'muted'
            : 'muted';

  return (
    <button
      ref={setRefs}
      type="button"
      style={style}
      onClick={onClick}
      className={cn(
        'cv-auto group relative rounded-lg border border-border/70 bg-surface-2/40 p-2.5 text-left transition sm:p-3',
        selectionMode ? 'cursor-default' : 'cursor-grab touch-none active:cursor-grabbing',
        'hover:bg-surface-2/70',
        (selected || bulkSelected) && 'ring-1 ring-primary/60',
        task.status === 'archived' && 'opacity-70',
        dragging && 'opacity-60',
      )}
      {...props}
    >
      {selectionMode ? (
        <div
          className={cn(
            'absolute right-2 top-2 h-5 w-5 rounded-md border border-border/70 bg-surface-1/80 text-xs text-foreground',
            'flex items-center justify-center',
            bulkSelected ? 'border-primary/60 bg-primary/15 text-primary' : 'text-muted-foreground'
          )}
        >
          {bulkSelected ? '✓' : ''}
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-medium text-foreground sm:text-sm">{task.title}</div>
        <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] font-semibold text-muted-foreground">
          {shortId(task.id)}
        </Badge>
      </div>

      <div className="mt-2 max-h-10 overflow-hidden text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
        {task.description?.trim() ? task.description : 'No description'}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground sm:text-[11px]">
        <div className="flex items-center gap-2">
          <StatusDot tone={tone} />
          <span>{statusLabel(task.status)}</span>
        </div>
        <span>Updated {formatUpdatedAt(task.updated_at)}</span>
      </div>
    </button>
  );
});
