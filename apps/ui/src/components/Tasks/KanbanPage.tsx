import { useEffect, useMemo, useRef, useState } from 'react';

import type { Project, Section, SectionViewMode, Task, TaskStatus } from '../../api/types';
import { patchTask } from '../../api/queries';

import { PageHeader } from '../Layout/PageHeader';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { TaskBoard } from './TaskBoard';
import { TaskBoardSkeleton } from './TaskBoardSkeleton';
import { NewTask } from './NewTask';
import { ThreadsBoard } from './ThreadsBoard';

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'ideas', label: 'Ideas' },
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'review', label: 'Review' },
  { value: 'release', label: 'Release' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
];

export function KanbanPage({
  projects,
  projectsLoading,
  projectsError,
  sections,
  sectionsLoading,
  sectionsError,
  selectedProjectId,
  onSelectProject,
  selectedSectionId,
  onSelectSection,
  viewMode,
  onChangeViewMode,
  onCreateProject,
  onCreateSection,
  tasks,
  tasksLoading,
  tasksError,
  selectedTaskId,
  onSelectTask,
  onMoveTask,
  moveDisabled,
  onReorder,
  onQuickCreate,
  onCreateTask,
  createTaskError,
  moveError,
  reorderError,
}: {
  projects: Project[];
  projectsLoading: boolean;
  projectsError: unknown | null;
  sections: Section[];
  sectionsLoading: boolean;
  sectionsError: unknown | null;
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  selectedSectionId: string | null;
  onSelectSection: (id: string) => void;
  viewMode: SectionViewMode;
  onChangeViewMode: (mode: SectionViewMode) => void;
  onCreateProject: (name: string) => Promise<void> | void;
  onCreateSection: (name: string) => Promise<void> | void;
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: unknown | null;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onMoveTask: (id: string, status: TaskStatus) => void;
  moveDisabled: boolean;
  onReorder: (status: TaskStatus, orderedIds: string[]) => void;
  onQuickCreate: (status: TaskStatus, title: string) => Promise<void> | void;
  onCreateTask: (title: string) => Promise<void> | void;
  createTaskError: unknown | null;
  moveError: unknown | null;
  reorderError: unknown | null;
}) {
  const [projectName, setProjectName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveSectionId, setMoveSectionId] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!showArchived && t.status === 'archived') return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);
    });
  }, [tasks, search, showArchived]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = useMemo(() => filteredTasks.map((t) => t.id), [filteredTasks]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  useEffect(() => {
    if (!selectionMode) {
      setSelectedIds([]);
      setMoveSectionId('');
    }
  }, [selectionMode]);

  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((prev) => prev.filter((id) => visible.has(id)));
  }, [visibleIds]);

  useEffect(() => {
    const isTyping = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement)) return;
      if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        searchRef.current?.focus();
        e.preventDefault();
      }
      if (e.key === 'Escape' && selectionMode) {
        setSelectionMode(false);
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionMode]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelectedIds([]);
    else setSelectedIds(visibleIds);
  };

  const moveSelected = async (status: TaskStatus) => {
    if (!selectedIds.length) return;
    await Promise.all(selectedIds.map((id) => patchTask(id, { status })));
    setSelectedIds([]);
  };

  const moveSelectedToSection = async () => {
    if (!moveSectionId || selectedIds.length === 0) return;
    await Promise.all(selectedIds.map((id) => patchTask(id, { sectionId: moveSectionId })));
    setSelectedIds([]);
    setMoveSectionId('');
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Projects"
        subtitle="Project overview → section workflow in Kanban or Threads mode"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex gap-2">
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="New project…"
                className="w-[180px]"
              />
              <Button
                variant="secondary"
                onClick={async () => {
                  const name = projectName.trim();
                  if (!name) return;
                  await onCreateProject(name);
                  setProjectName('');
                }}
                disabled={!projectName.trim()}
              >
                Add project
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="New section…"
                className="w-[180px]"
              />
              <Button
                variant="secondary"
                onClick={async () => {
                  const name = sectionName.trim();
                  if (!name) return;
                  await onCreateSection(name);
                  setSectionName('');
                }}
                disabled={!sectionName.trim() || !selectedProjectId}
              >
                Add section
              </Button>
            </div>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-surface-1/70 p-3 shadow-panel">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Projects</div>
          <div className="mt-2 grid gap-2">
            {projectsLoading ? (
              Array.from({ length: 4 }).map((_, idx) => <Skeleton key={idx} className="h-10 w-full" />)
            ) : projectsError ? (
              <InlineAlert>{String(projectsError)}</InlineAlert>
            ) : !projects.length ? (
              <EmptyState title="No projects" subtitle="Create your first project." />
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProject(p.id)}
                  className={
                    'rounded-md border px-3 py-2 text-left text-sm transition ' +
                    (p.id === selectedProjectId
                      ? 'border-primary/60 bg-surface-2/80'
                      : 'border-border/70 bg-surface-1/50 hover:bg-surface-2/60')
                  }
                >
                  <div className="font-medium text-foreground">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.description || 'No description'}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-surface-1/70 p-3 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sections</div>
              <div className="mt-1 text-sm text-muted-foreground">{selectedProject?.name ?? 'Select a project'}</div>
            </div>
            <div className="inline-flex rounded-lg border border-border/70 bg-surface-2/60 p-1">
              <button
                type="button"
                className={'rounded-md px-2 py-1 text-xs ' + (viewMode === 'kanban' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground')}
                onClick={() => onChangeViewMode('kanban')}
              >
                Kanban
              </button>
              <button
                type="button"
                className={'rounded-md px-2 py-1 text-xs ' + (viewMode === 'threads' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground')}
                onClick={() => onChangeViewMode('threads')}
              >
                Threads
              </button>
            </div>
          </div>

          <div className="mt-2 grid gap-2">
            {sectionsLoading ? (
              Array.from({ length: 5 }).map((_, idx) => <Skeleton key={idx} className="h-10 w-full" />)
            ) : sectionsError ? (
              <InlineAlert>{String(sectionsError)}</InlineAlert>
            ) : !sections.length ? (
              <EmptyState title="No sections" subtitle="Add first section for this project." />
            ) : (
              sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSection(s.id)}
                  className={
                    'rounded-md border px-3 py-2 text-left text-sm transition ' +
                    (s.id === selectedSectionId
                      ? 'border-primary/60 bg-surface-2/80'
                      : 'border-border/70 bg-surface-1/50 hover:bg-surface-2/60')
                  }
                >
                  <div className="font-medium text-foreground">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.section_kind === 'inbox' ? 'Project Inbox' : `Default: ${s.view_mode}`}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected section</div>
            <h2 className="mt-1 text-base font-semibold tracking-tight">{selectedSection?.name ?? 'No section selected'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedSection ? selectedSection.description || 'Move tasks through statuses.' : 'Select a section above to view tasks.'}
            </p>
          </div>
          <div className="w-full sm:max-w-md">
            {selectedSectionId ? (
              <div className="flex flex-col gap-2">
                <NewTask onCreate={onCreateTask} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setSelectionMode((prev) => !prev)}>
                    {selectionMode ? 'Done selecting' : 'Select'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={toggleSelectAll} disabled={!filteredTasks.length}>
                    {allVisibleSelected ? 'Clear selection' : 'Select all visible'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border/70 bg-surface-1/50 px-3 py-2 text-xs text-muted-foreground">
                Select section to create tasks.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks… (Ctrl+K or /)"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
          </div>

          {selectionMode ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{selectedIds.length} selected</span>
              <select
                className="h-8 rounded-md border border-input/70 bg-surface-1/70 px-2 text-xs text-foreground"
                value={moveSectionId}
                onChange={(e) => setMoveSectionId(e.target.value)}
              >
                <option value="">Move to section…</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  moveSelectedToSection().catch(() => undefined);
                }}
                disabled={!moveSectionId || selectedIds.length === 0}
              >
                Move section
              </Button>
              <select
                className="h-8 rounded-md border border-input/70 bg-surface-1/70 px-2 text-xs text-foreground"
                value=""
                onChange={(e) => {
                  const next = e.target.value as TaskStatus;
                  if (!next || selectedIds.length === 0) return;
                  moveSelected(next).catch(() => undefined);
                }}
              >
                <option value="">Move to…</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => moveSelected('archived')}
                disabled={selectedIds.length === 0}
              >
                Archive
              </Button>
            </div>
          ) : null}
        </div>

        {createTaskError ? <InlineAlert>{String(createTaskError)}</InlineAlert> : null}
        {moveError || reorderError ? <InlineAlert>{String(moveError ?? reorderError)}</InlineAlert> : null}

        {!selectedProjectId ? (
          <EmptyState title="Select a project" subtitle="Choose a project above to continue." />
        ) : !selectedSectionId ? (
          <EmptyState title="Select a section" subtitle="Choose a section above to view tasks." />
        ) : tasksLoading ? (
          <TaskBoardSkeleton />
        ) : tasksError ? (
          <InlineAlert>{String(tasksError)}</InlineAlert>
        ) : filteredTasks.length === 0 ? (
          <EmptyState title="No tasks" subtitle="Create one with the input above." />
        ) : viewMode === 'threads' ? (
          <ThreadsBoard
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            onMoveTask={onMoveTask}
            moveDisabled={moveDisabled}
            onReorder={onReorder}
            onQuickCreate={onQuickCreate}
            selectionMode={selectionMode}
            selectedIds={selectedSet}
            onToggleSelect={toggleSelection}
          />
        ) : (
          <TaskBoard
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            onMoveTask={onMoveTask}
            moveDisabled={moveDisabled}
            onReorder={onReorder}
            onQuickCreate={onQuickCreate}
            selectionMode={selectionMode}
            selectedIds={selectedSet}
            onToggleSelect={toggleSelection}
          />
        )}
      </div>
    </div>
  );
}
