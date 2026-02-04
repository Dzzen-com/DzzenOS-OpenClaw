import { useMemo, useState } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { TopBar } from '../components/TopBar/TopBar';
import { TaskTable } from '../components/Tasks/TaskTable';
import { TaskDrawer } from '../components/Tasks/TaskDrawer';
import type { Task } from '../components/Tasks/types';

export function App() {
  const tasks = useMemo<Task[]>(
    () => [
      {
        id: 'DZ-7',
        title: 'UI shell (Linear-like) – sidebar + list + drawer',
        status: 'In Progress',
        priority: 'High',
        assignee: 'OpenClaw',
        updatedAt: 'Today',
      },
      {
        id: 'DZ-12',
        title: 'Add task filtering + search',
        status: 'Backlog',
        priority: 'Medium',
        assignee: '—',
        updatedAt: '2d',
      },
      {
        id: 'DZ-18',
        title: 'Wire tasks to API (react-query)',
        status: 'Backlog',
        priority: 'Medium',
        assignee: '—',
        updatedAt: '1w',
      },
      {
        id: 'DZ-21',
        title: 'Board view (kanban)',
        status: 'Planned',
        priority: 'Low',
        assignee: '—',
        updatedAt: '1w',
      },
    ],
    []
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id ?? null);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  return (
    <div className="min-h-dvh bg-[#0b1220] text-slate-100">
      <div className="flex min-h-dvh">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />

          <main className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="mx-auto w-full max-w-6xl">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
                  <p className="mt-1 text-sm text-slate-400">Placeholder list (Issue #7 UI shell).</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur">
                <TaskTable
                  tasks={tasks}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={(id) => setSelectedTaskId(id)}
                />
              </div>
            </div>
          </main>
        </div>
      </div>

      <TaskDrawer task={selectedTask} open={selectedTask != null} onOpenChange={(o) => !o && setSelectedTaskId(null)} />
    </div>
  );
}
