import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Box,
	Card,
	CardContent,
	CardHeader,
	Chip,
	Divider,
	FormControl,
	Grid,
	InputLabel,
	List,
	ListItemButton,
	ListItemText,
	MenuItem,
	Select,
	Stack,
	Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { useLocation, useNavigate } from 'react-router';
import { listApprovals, listProjects, listSections, listTasks } from '@/api/queries';
import type { Section, Task, TaskStatus } from '@/api/types';

const Root = styled(FusePageSimple)(({ theme }) => ({
	'& .FusePageSimple-header': {
		borderBottom: `1px solid ${theme.vars.palette.divider}`,
		background: theme.vars.palette.background.paper
	},
	'& .FusePageSimple-content': {
		background: theme.vars.palette.background.default
	}
}));

const STATUS_LABEL: Record<TaskStatus, string> = {
	ideas: 'Ideas',
	todo: 'To do',
	doing: 'In progress',
	review: 'Review',
	release: 'Release',
	done: 'Done',
	archived: 'Archived'
};

function severityByStatus(status: TaskStatus): 'default' | 'info' | 'warning' | 'success' {
	if (status === 'doing') return 'info';
	if (status === 'review' || status === 'release') return 'warning';
	if (status === 'done') return 'success';
	return 'default';
}

export default function ProjectsView() {
	const location = useLocation();
	const navigate = useNavigate();
	const params = new URLSearchParams(location.search);
	const projectId = params.get('projectId');

	const projectsQ = useQuery({
		queryKey: ['projects', 'projects-page'],
		queryFn: () => listProjects({ archived: 'active' })
	});

	const sectionsQ = useQuery({
		queryKey: ['sections', projectId, 'projects-page'],
		queryFn: () => {
			if (!projectId) return Promise.resolve([] as Section[]);
			return listSections(projectId);
		},
		enabled: !!projectId
	});

	const tasksQ = useQuery({
		queryKey: ['tasks', projectId, 'projects-page'],
		queryFn: () => {
			if (!projectId) return Promise.resolve([] as Task[]);
			return listTasks({ projectId });
		},
		enabled: !!projectId
	});

	const approvalsQ = useQuery({
		queryKey: ['approvals', 'pending', projectId, 'projects-page'],
		queryFn: () => listApprovals({ status: 'pending', projectId: projectId ?? undefined })
	});

	useEffect(() => {
		if (!projectId && projectsQ.data?.length) {
			const next = new URLSearchParams(location.search);
			next.set('projectId', projectsQ.data[0].id);
			navigate(`/projects?${next.toString()}`, { replace: true });
		}
	}, [location.search, navigate, projectId, projectsQ.data]);

	const selectedProject = useMemo(
		() => (projectsQ.data ?? []).find((project) => project.id === projectId) ?? null,
		[projectId, projectsQ.data]
	);

	const tasks = tasksQ.data ?? [];
	const sections = sectionsQ.data ?? [];
	const pendingApprovals = approvalsQ.data ?? [];

	const statusCounts = useMemo(() => {
		const output: Record<TaskStatus, number> = {
			ideas: 0,
			todo: 0,
			doing: 0,
			review: 0,
			release: 0,
			done: 0,
			archived: 0
		};
		for (const task of tasks) output[task.status] = (output[task.status] ?? 0) + 1;
		return output;
	}, [tasks]);

	const tasksBySection = useMemo(() => {
		const map = new Map<string, number>();
		for (const task of tasks) {
			map.set(task.section_id, (map.get(task.section_id) ?? 0) + 1);
		}
		return map;
	}, [tasks]);

	const activeTasks = useMemo(
		() =>
			[...tasks]
				.filter((task) => task.status === 'doing' || task.status === 'review' || task.status === 'release')
				.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
				.slice(0, 12),
		[tasks]
	);

	const selectProject = (id: string) => {
		const next = new URLSearchParams(location.search);
		next.set('projectId', id);
		navigate(`/projects?${next.toString()}`);
	};

	const openTask = (taskId: string) => {
		if (!projectId) return;
		navigate(`/workspace?projectId=${encodeURIComponent(projectId)}&taskId=${encodeURIComponent(taskId)}`);
	};

	const header = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2 }}>
			<Stack
				direction={{ xs: 'column', lg: 'row' }}
				spacing={2}
				alignItems={{ xs: 'stretch', lg: 'center' }}
				justifyContent="space-between"
			>
				<Box>
					<Typography variant="overline" color="text.secondary">
						Fuse Workspace
					</Typography>
					<Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
						Projects
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Структура проектов, секций и рабочей нагрузки.
					</Typography>
				</Box>

				<FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 340 } }}>
					<InputLabel id="projects-page-project-label">Проект</InputLabel>
					<Select
						labelId="projects-page-project-label"
						label="Проект"
						value={projectId ?? ''}
						onChange={(event) => selectProject(String(event.target.value))}
					>
						{(projectsQ.data ?? []).map((project) => (
							<MenuItem key={project.id} value={project.id}>
								{project.name}
							</MenuItem>
						))}
					</Select>
				</FormControl>
			</Stack>
		</Box>
	);

	const content = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2.5 }}>
			<Grid container spacing={2}>
				<Grid size={{ xs: 6, md: 3 }}>
					<Card variant="outlined">
						<CardContent sx={{ py: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								Projects
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
								{projectsQ.data?.length ?? 0}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid size={{ xs: 6, md: 3 }}>
					<Card variant="outlined">
						<CardContent sx={{ py: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								Sections
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
								{sections.length}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid size={{ xs: 6, md: 3 }}>
					<Card variant="outlined">
						<CardContent sx={{ py: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								Tasks
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
								{tasks.length}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid size={{ xs: 6, md: 3 }}>
					<Card variant="outlined">
						<CardContent sx={{ py: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								Pending Approvals
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
								{pendingApprovals.length}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
			</Grid>

			<Grid container spacing={2} sx={{ mt: 0.5 }}>
				<Grid size={{ xs: 12, lg: 5 }}>
					<Card variant="outlined" sx={{ height: '100%' }}>
						<CardHeader title="Sections" subheader={selectedProject?.name ?? 'Выберите проект'} />
						<Divider />
						<List dense>
							{sections.length === 0 ? (
								<ListItemText sx={{ px: 2, py: 2 }} primary="Нет секций в проекте" />
							) : (
								sections.map((section) => (
									<ListItemButton key={section.id} onClick={() => navigate(`/workspace?projectId=${encodeURIComponent(section.project_id)}`)}>
										<ListItemText
											primary={section.name}
											secondary={`${section.section_kind === 'inbox' ? 'Inbox' : section.view_mode} • ${tasksBySection.get(section.id) ?? 0} tasks`}
										/>
										<Chip size="small" label={tasksBySection.get(section.id) ?? 0} />
									</ListItemButton>
								))
							)}
						</List>
					</Card>
				</Grid>

				<Grid size={{ xs: 12, lg: 7 }}>
					<Card variant="outlined" sx={{ height: '100%' }}>
						<CardHeader title="Active Tasks" subheader="Текущие задачи по проекту" />
						<Divider />
						<List dense>
							{activeTasks.length === 0 ? (
								<ListItemText sx={{ px: 2, py: 2 }} primary="Нет активных задач" />
							) : (
								activeTasks.map((task) => (
									<ListItemButton key={task.id} onClick={() => openTask(task.id)}>
										<ListItemText
											primary={task.title}
											secondary={`${STATUS_LABEL[task.status]} • ${new Date(task.updated_at).toLocaleString()}`}
										/>
										<Chip size="small" color={severityByStatus(task.status)} label={STATUS_LABEL[task.status]} />
									</ListItemButton>
								))
							)}
						</List>
					</Card>
				</Grid>
			</Grid>

			<Grid container spacing={2} sx={{ mt: 0.5 }}>
				{(Object.keys(STATUS_LABEL) as TaskStatus[]).map((status) => (
					<Grid key={status} size={{ xs: 6, sm: 4, md: 12 / 7 }}>
						<Card variant="outlined">
							<CardContent sx={{ py: 1.25 }}>
								<Typography variant="caption" color="text.secondary">
									{STATUS_LABEL[status]}
								</Typography>
								<Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
									{statusCounts[status]}
								</Typography>
							</CardContent>
						</Card>
					</Grid>
				))}
			</Grid>
		</Box>
	);

	return <Root header={header} content={content} scroll="content" />;
}
