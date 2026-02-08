import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Alert,
	Box,
	Button,
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
	TextField,
	Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router';
import FusePageSimple from '@fuse/core/FusePageSimple';
import {
	approveApproval,
	createTask,
	listApprovals,
	listProjects,
	listRuns,
	listSections,
	listTasks,
	rejectApproval
} from '@/api/queries';
import type { Approval, Task, TaskStatus } from '@/api/types';

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

function withinLastHours(iso: string, hours: number) {
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return false;
	return t >= Date.now() - hours * 60 * 60 * 1000;
}

function severityByStatus(status: TaskStatus): 'default' | 'info' | 'warning' | 'success' {
	if (status === 'doing') return 'info';
	if (status === 'review' || status === 'release') return 'warning';
	if (status === 'done') return 'success';
	return 'default';
}

export default function WorkspaceView() {
	const location = useLocation();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [capture, setCapture] = useState('');

	const params = new URLSearchParams(location.search);
	const projectId = params.get('projectId');
	const selectedTaskId = params.get('taskId');

	const projectsQ = useQuery({ queryKey: ['projects'], queryFn: () => listProjects({ archived: 'active' }) });

	const sectionsQ = useQuery({
		queryKey: ['sections', projectId, 'workspace'],
		queryFn: () => {
			if (!projectId) return Promise.resolve([] as any[]);
			return listSections(projectId);
		},
		enabled: !!projectId
	});

	const tasksQ = useQuery({
		queryKey: ['tasks', projectId, 'workspace'],
		queryFn: () => {
			if (!projectId) return Promise.resolve([] as Task[]);
			return listTasks({ projectId });
		},
		enabled: !!projectId
	});

	const approvalsQ = useQuery({
		queryKey: ['approvals', 'pending', projectId],
		queryFn: () => listApprovals({ status: 'pending', projectId: projectId ?? undefined })
	});

	const stuckQ = useQuery({
		queryKey: ['runs', 'stuck', projectId],
		queryFn: () => listRuns({ status: 'running', stuckMinutes: 10, projectId: projectId ?? undefined })
	});

	const failedQ = useQuery({
		queryKey: ['runs', 'failed', projectId],
		queryFn: () => listRuns({ status: 'failed', projectId: projectId ?? undefined })
	});

	const createTaskM = useMutation({
		mutationFn: async (title: string) => {
			if (!projectId) throw new Error('Project is not selected');
			const inbox = (sectionsQ.data ?? []).find((section) => section.section_kind === 'inbox') ?? sectionsQ.data?.[0] ?? null;
			return createTask({
				projectId,
				sectionId: inbox?.id,
				title,
				status: 'ideas'
			});
		},
		onSuccess: async () => {
			setCapture('');
			await qc.invalidateQueries({ queryKey: ['tasks'] });
			await qc.invalidateQueries({ queryKey: ['projects-tree'] });
		}
	});

	const approveM = useMutation({
		mutationFn: async (approvalId: string) => approveApproval(approvalId, { decidedBy: 'workspace' }),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
			await qc.invalidateQueries({ queryKey: ['projects-tree'] });
		}
	});

	const rejectM = useMutation({
		mutationFn: async (approvalId: string) => rejectApproval(approvalId, { decidedBy: 'workspace' }),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
			await qc.invalidateQueries({ queryKey: ['projects-tree'] });
		}
	});

	useEffect(() => {
		if (!projectId && projectsQ.data?.length) {
			const next = new URLSearchParams(location.search);
			next.set('projectId', projectsQ.data[0].id);
			navigate(`/workspace?${next.toString()}`, { replace: true });
		}
	}, [location.search, navigate, projectId, projectsQ.data]);

	const tasks = tasksQ.data ?? [];
	const approvals = approvalsQ.data ?? [];
	const failed24h = useMemo(() => (failedQ.data ?? []).filter((run) => withinLastHours(run.created_at, 24)), [failedQ.data]);

	const statusOrder: TaskStatus[] = ['ideas', 'todo', 'doing', 'review', 'release', 'done', 'archived'];
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

	const recentTasks = useMemo(
		() => [...tasks].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 8),
		[tasks]
	);

	const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

	const selectProject = (id: string) => {
		const next = new URLSearchParams(location.search);
		next.set('projectId', id);
		next.delete('taskId');
		navigate(`/workspace?${next.toString()}`);
	};

	const openTask = (taskId: string) => {
		const next = new URLSearchParams(location.search);
		next.set('taskId', taskId);
		navigate(`/workspace?${next.toString()}`);
	};

	const header = (
		<Box className="container" sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2 }}>
			<Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'flex-start' }} justifyContent="space-between">
				<Box>
					<Typography variant="overline" color="text.secondary">
						Fuse Workspace
					</Typography>
					<Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
						Dashboard
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Все ключевые процессы проекта на одном экране.
					</Typography>
				</Box>

				<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ minWidth: { lg: 520 } }}>
					<FormControl fullWidth size="small">
						<InputLabel id="workspace-project-label">Проект</InputLabel>
						<Select
							labelId="workspace-project-label"
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

					<TextField
						size="small"
						fullWidth
						label="Быстрый захват"
						value={capture}
						onChange={(event) => setCapture(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter' && capture.trim()) {
								event.preventDefault();
								createTaskM.mutate(capture.trim());
							}
						}}
					/>
					<Button
						variant="contained"
						disabled={!capture.trim() || !projectId || createTaskM.isPending}
						onClick={() => createTaskM.mutate(capture.trim())}
					>
						Добавить
					</Button>
				</Stack>
			</Stack>
		</Box>
	);

	const content = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2.5 }}>
			<Grid container spacing={2}>
				{statusOrder.map((status) => (
					<Grid key={status} size={{ xs: 6, sm: 3, md: 12 / 7 }}>
						<Card variant="outlined">
							<CardContent sx={{ py: 1.5 }}>
								<Typography variant="caption" color="text.secondary">
									{STATUS_LABEL[status]}
								</Typography>
								<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
									{statusCounts[status]}
								</Typography>
							</CardContent>
						</Card>
					</Grid>
				))}
			</Grid>

			<Grid container spacing={2} sx={{ mt: 0.5 }}>
				<Grid size={{ xs: 12, lg: 6 }}>
					<Card variant="outlined" sx={{ height: '100%' }}>
						<CardHeader title="Recent Tasks" subheader="Последние изменения" />
						<Divider />
						<List dense>
							{recentTasks.length === 0 ? (
								<ListItemText sx={{ px: 2, py: 2 }} primary="Пока нет задач" />
							) : (
								recentTasks.map((task) => (
									<ListItemButton key={task.id} selected={task.id === selectedTaskId} onClick={() => openTask(task.id)}>
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

				<Grid size={{ xs: 12, lg: 6 }}>
					<Card variant="outlined" sx={{ height: '100%' }}>
						<CardHeader title="Pending Approvals" subheader="Задачи, требующие решения" />
						<Divider />
						<List dense>
							{approvals.length === 0 ? (
								<ListItemText sx={{ px: 2, py: 2 }} primary="Нет pending approvals" />
							) : (
								approvals.slice(0, 10).map((approval: Approval) => (
									<Box key={approval.id} sx={{ px: 1.5, py: 1 }}>
										<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
											<Box sx={{ minWidth: 0 }}>
												<Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
													{approval.request_title ?? approval.task_title ?? approval.id}
												</Typography>
												<Typography variant="caption" color="text.secondary">
													{new Date(approval.requested_at).toLocaleString()}
												</Typography>
											</Box>
											<Stack direction="row" spacing={1}>
												<Button
													size="small"
													variant="outlined"
													disabled={approveM.isPending || !approval.task_id}
													onClick={() => approveM.mutate(approval.id)}
												>
													Approve
												</Button>
												<Button
													size="small"
													color="error"
													variant="outlined"
													disabled={rejectM.isPending || !approval.task_id}
													onClick={() => rejectM.mutate(approval.id)}
												>
													Reject
												</Button>
											</Stack>
										</Stack>
										<Divider sx={{ mt: 1 }} />
									</Box>
								))
							)}
						</List>
					</Card>
				</Grid>
			</Grid>

			<Grid container spacing={2} sx={{ mt: 0.5 }}>
				<Grid size={{ xs: 12, lg: 6 }}>
					<Card variant="outlined" sx={{ height: '100%' }}>
						<CardHeader title="Run Health" subheader="Зависшие и упавшие ранны" />
						<Divider />
						<CardContent>
							<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
								<Chip color="warning" label={`Stuck: ${stuckQ.data?.length ?? 0}`} />
								<Chip color="error" label={`Failed (24h): ${failed24h.length}`} />
								<Chip color="info" label={`Sections: ${sectionsQ.data?.length ?? 0}`} />
							</Stack>
						</CardContent>
					</Card>
				</Grid>

				<Grid size={{ xs: 12, lg: 6 }}>
					<Card variant="outlined" sx={{ height: '100%' }}>
						<CardHeader title="Task Focus" subheader="Выбранная задача" />
						<Divider />
						<CardContent>
							{selectedTask ? (
								<Stack spacing={1}>
									<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
										{selectedTask.title}
									</Typography>
									<Chip size="small" color={severityByStatus(selectedTask.status)} label={STATUS_LABEL[selectedTask.status]} />
									<Typography variant="body2" color="text.secondary">
										Updated: {new Date(selectedTask.updated_at).toLocaleString()}
									</Typography>
								</Stack>
							) : (
								<Typography variant="body2" color="text.secondary">
									Выберите задачу из списка слева.
								</Typography>
							)}
						</CardContent>
					</Card>
				</Grid>
			</Grid>

			{createTaskM.isError ? (
				<Alert severity="error" sx={{ mt: 2 }}>
					{String(createTaskM.error)}
				</Alert>
			) : null}
		</Box>
	);

	return <Root header={header} content={content} scroll="content" />;
}
