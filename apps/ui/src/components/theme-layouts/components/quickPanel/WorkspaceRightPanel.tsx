import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import {
	Box,
	Chip,
	Divider,
	List,
	ListItemButton,
	ListItemText,
	Paper,
	Stack,
	Typography
} from '@mui/material';
import { format } from 'date-fns';
import { getProjectsTree } from '@/api/queries';
import type { NavigationTreeProject, NavigationTreeTask } from '@/api/types';

type FocusTask = NavigationTreeTask & {
	projectName: string;
};

function attachProject(project: NavigationTreeProject, tasks: NavigationTreeTask[]): FocusTask[] {
	return tasks.map((task) => ({ ...task, projectName: project.name }));
}

function formatTaskDate(iso: string) {
	const parsed = Date.parse(iso);
	if (!Number.isFinite(parsed)) return '';
	return format(new Date(parsed), 'MMM d, HH:mm');
}

function tone(task: NavigationTreeTask) {
	return task.pending_approval ? 'warning' : 'info';
}

export default function WorkspaceRightPanel() {
	const location = useLocation();
	const navigate = useNavigate();
	const params = new URLSearchParams(location.search);
	const selectedProjectId = params.get('projectId');

	const treeQ = useQuery({
		queryKey: ['projects-tree', 'workspace-right-panel'],
		queryFn: () => getProjectsTree({ limitPerSection: 8 })
	});

	const selectedProject = useMemo(
		() => treeQ.data?.projects.find((project) => project.id === selectedProjectId) ?? null,
		[treeQ.data?.projects, selectedProjectId]
	);

	const inProgress = useMemo(() => {
		if (!treeQ.data?.projects?.length) return [] as FocusTask[];
		if (selectedProject) {
			return attachProject(selectedProject, selectedProject.focus_lists?.in_progress ?? [])
				.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
				.slice(0, 14);
		}
		return treeQ.data.projects
			.flatMap((project) => attachProject(project, project.focus_lists?.in_progress ?? []))
			.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
			.slice(0, 14);
	}, [selectedProject, treeQ.data?.projects]);

	const needsAttention = useMemo(() => {
		if (!treeQ.data?.projects?.length) return [] as FocusTask[];
		if (selectedProject) {
			return attachProject(selectedProject, selectedProject.focus_lists?.needs_user ?? [])
				.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
				.slice(0, 14);
		}
		return treeQ.data.projects
			.flatMap((project) => attachProject(project, project.focus_lists?.needs_user ?? []))
			.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
			.slice(0, 14);
	}, [selectedProject, treeQ.data?.projects]);

	const openTask = (task: FocusTask) => {
		const next = new URLSearchParams(location.search);
		next.set('projectId', task.project_id);
		next.set('taskId', task.id);
		navigate(`/workspace?${next.toString()}`);
	};

	return (
		<Paper
			square
			elevation={0}
			sx={(theme) => ({
				width: 320,
				minWidth: 320,
				height: '100vh',
				borderLeft: `1px solid ${theme.vars.palette.divider}`,
				backgroundColor: theme.vars.palette.background.paper,
				display: { xs: 'none', lg: 'flex' },
				flexDirection: 'column'
			})}
		>
			<Box sx={{ px: 2.5, py: 2 }}>
				<Typography variant="overline" color="text.secondary">
					Today
				</Typography>
				<Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
					{format(new Date(), 'EEEE')}
				</Typography>
				<Typography variant="caption" color="text.secondary">
					{format(new Date(), 'd MMMM yyyy')}
				</Typography>
			</Box>

			<Divider />

			<Box sx={{ minHeight: 0, overflowY: 'auto', px: 1.5, py: 1.5 }}>
				<Section
					title="In Progress"
					count={selectedProject?.focus_lists?.in_progress_total ?? inProgress.length}
					tasks={inProgress}
					empty="No tasks in progress."
					onOpenTask={openTask}
				/>
				<Section
					title="Needs Attention"
					count={selectedProject?.focus_lists?.needs_user_total ?? needsAttention.length}
					tasks={needsAttention}
					empty="No tasks need attention."
					onOpenTask={openTask}
				/>
			</Box>
		</Paper>
	);
}

function Section({
	title,
	count,
	tasks,
	empty,
	onOpenTask
}: {
	title: string;
	count: number;
	tasks: FocusTask[];
	empty: string;
	onOpenTask: (task: FocusTask) => void;
}) {
	return (
		<Box sx={{ mb: 2 }}>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, mb: 0.5 }}>
				<Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
					{title}
				</Typography>
				<Chip size="small" label={count} />
			</Stack>

			{tasks.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1.5 }}>
					{empty}
				</Typography>
			) : (
				<List dense sx={{ py: 0 }}>
					{tasks.map((task) => (
						<ListItemButton key={task.id} onClick={() => onOpenTask(task)} sx={{ borderRadius: 1, mb: 0.5 }}>
							<ListItemText
								primaryTypographyProps={{ variant: 'body2', sx: { fontWeight: 500 }, noWrap: true }}
								secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary', noWrap: true }}
								primary={task.title}
								secondary={`${task.projectName} • ${formatTaskDate(task.updated_at)}`}
							/>
							<Chip size="small" color={tone(task)} label={task.pending_approval ? 'Approval' : 'Doing'} />
						</ListItemButton>
					))}
				</List>
			)}
		</Box>
	);
}
