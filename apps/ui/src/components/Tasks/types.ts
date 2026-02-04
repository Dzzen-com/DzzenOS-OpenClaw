export type TaskStatus = 'Backlog' | 'Planned' | 'In Progress' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  updatedAt: string;
};
