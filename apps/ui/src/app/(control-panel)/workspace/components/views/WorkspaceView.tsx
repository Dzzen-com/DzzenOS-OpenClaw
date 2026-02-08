import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Alert,
	Avatar,
	Button,
	Card,
	CardContent,
	Chip,
	Divider,
	FormControl,
	InputLabel,
	List,
	ListItemButton,
	ListItemText,
	MenuItem,
	Paper,
	Select,
	Stack,
	Tab,
	Tabs,
	TextField,
	Typography
} from '@mui/material';
import { darken, styled } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PageBreadcrumb from '@/components/PageBreadcrumb';
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
import type { Approval, Section, Task, TaskStatus } from '@/api/types';

const Root = styled(FusePageSimple)(() => ({
	'& .container': {
		maxWidth: '100%!important'
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

function WorkspaceHeader({
	projectId,
	projects,
	capture,
	onSetCapture,
	onSelectProject,
	onCreateTask,
	creating
}: {
	projectId: string | null;
	projects: Array<{ id: string; name: string }>;
	capture: string;
	onSetCapture: (value: string) => void;
	onSelectProject: (id: string) => void;
	onCreateTask: () => void;
	creating: boolean;
}) {
	return (
		<div className="container flex w-full border-b">
			<div className="flex flex-auto flex-col p-4 md:px-8">
				<PageBreadcrumb className="mb-2" />
				<div className="flex min-w-0 flex-auto flex-col gap-3 md:flex-row md:items-center">
					<div className="flex flex-auto items-center gap-3">
						<Avatar
							sx={(theme) => ({
								background: darken(theme.palette.background.default, 0.05),
								color: theme.vars.palette.text.secondary
							})}
							className="h-12 w-12 shrink-0"
						>
							<FuseSvgIcon size={20}>lucide:layout-dashboard</FuseSvgIcon>
						</Avatar>
						<div className="min-w-0">
							<Typography className="truncate text-2xl leading-none font-bold tracking-tight md:text-3xl">Workspace Dashboard</Typography>
							<Typography className="text-md mt-1" color="text.secondary">
								Control panel for tasks, approvals and run health
							</Typography>
						</div>
					</div>

					<div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
						<FormControl size="small" sx={{ minWidth: { xs: 230, md: 250 } }}>
							<InputLabel id="workspace-project-label">Project</InputLabel>
							<Select
								labelId="workspace-project-label"
								label="Project"
								value={projectId ?? ''}
								onChange={(event) => onSelectProject(String(event.target.value))}
							>
								{projects.map((project) => (
									<MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>
								))}
							</Select>
						</FormControl>

						<TextField
							size="small"
							label="Quick capture"
							value={capture}
							onChange={(event) => onSetCapture(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter' && capture.trim()) {
									event.preventDefault();
									onCreateTask();
								}
							}}
							sx={{ minWidth: { xs: 230, md: 280 } }}
						/>

						<Button variant="contained" disabled={!capture.trim() || !projectId || creating} onClick={onCreateTask} startIcon={<FuseSvgIcon>lucide:plus</FuseSvgIcon>}>
							{creating ? 'Adding...' : 'Add'}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: string }) {
	return (
		<Paper className="flex flex-auto flex-col overflow-hidden rounded-xl p-4 shadow-sm">
			<Stack direction="row" justifyContent="space-between" alignItems="center">
				<Typography className="text-md" color="text.secondary">{title}</Typography>
				<FuseSvgIcon size={18} color="action">{icon}</FuseSvgIcon>
			</Stack>
			<Typography className="mt-3 text-4xl leading-none font-bold tracking-tight">{value}</Typography>
		</Paper>
	);
}

export default function WorkspaceView() {
	const location = useLocation();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [capture, setCapture] = useState('');
	const [tabValue, setTabValue] = useState('overview');

	const params = new URLSearchParams(location.search);
	const projectId = params.get('projectId');
	const selectedTaskId = params.get('taskId');

	const projectsQ = useQuery({ queryKey: ['projects'], queryFn: () => listProjects({ archived: 'active' }) });

	const sectionsQ = useQuery({
		queryKey: ['sections', projectId, 'workspace'],
		queryFn: () => {
			if (!projectId) return Promise.resolve([] as Section[]);
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
		() => [...tasks].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 12),
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

	const container = {
		show: {
			transition: {
				staggerChildren: 0.04
			}
		}
	};
	const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

	const content = (
		<div className="w-full pt-4 sm:pt-6">
			<div className="flex w-full flex-col justify-between gap-2 px-4 sm:flex-row sm:items-center md:px-8">
				<Tabs value={tabValue} onChange={(_event, value: string) => setTabValue(value)}>
					<Tab value="overview" label="Overview" />
					<Tab value="approvals" label="Approvals" />
					<Tab value="health" label="Health" />
				</Tabs>
			</div>

			{tabValue === 'overview' && (
				<motion.div className="grid w-full min-w-0 grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 md:grid-cols-4 md:px-8" variants={container} initial="hidden" animate="show">
					<motion.div variants={item}><StatCard title="Tasks" value={tasks.length} icon="lucide:list-checks" /></motion.div>
					<motion.div variants={item}><StatCard title="Approvals" value={approvals.length} icon="lucide:shield-alert" /></motion.div>
					<motion.div variants={item}><StatCard title="Running" value={stuckQ.data?.length ?? 0} icon="lucide:activity" /></motion.div>
					<motion.div variants={item}><StatCard title="Failed (24h)" value={failed24h.length} icon="lucide:octagon-alert" /></motion.div>

					<motion.div variants={item} className="sm:col-span-2 md:col-span-4 lg:col-span-2">
						<Paper className="flex h-full flex-auto flex-col overflow-hidden rounded-xl p-6 shadow-sm">
							<Typography className="text-xl leading-6 font-medium tracking-tight">Recent Tasks</Typography>
							<List className="mt-2 divide-y py-0">
								{recentTasks.length === 0 ? (
									<ListItemText className="px-0 py-4" primary="No tasks yet" />
								) : (
									recentTasks.map((task) => (
										<ListItemButton key={task.id} disableGutters selected={task.id === selectedTaskId} onClick={() => openTask(task.id)}>
											<ListItemText primary={task.title} secondary={`${STATUS_LABEL[task.status]} · ${new Date(task.updated_at).toLocaleString()}`} />
											<Chip size="small" color={severityByStatus(task.status)} label={STATUS_LABEL[task.status]} />
										</ListItemButton>
									))
								)}
							</List>
						</Paper>
					</motion.div>

					<motion.div variants={item} className="sm:col-span-2 md:col-span-4 lg:col-span-2">
						<Paper className="flex h-full flex-auto flex-col overflow-hidden rounded-xl p-6 shadow-sm">
							<Typography className="text-xl leading-6 font-medium tracking-tight">Task Focus</Typography>
							<Divider className="my-4" />
							{selectedTask ? (
								<Stack spacing={1.5}>
									<Typography className="text-lg font-semibold">{selectedTask.title}</Typography>
									<Chip size="small" color={severityByStatus(selectedTask.status)} label={STATUS_LABEL[selectedTask.status]} sx={{ width: 'fit-content' }} />
									<Typography className="text-sm" color="text.secondary">Updated: {new Date(selectedTask.updated_at).toLocaleString()}</Typography>
								</Stack>
							) : (
								<Typography color="text.secondary">Select a task from Recent Tasks.</Typography>
							)}
						</Paper>
					</motion.div>
				</motion.div>
			)}

			{tabValue === 'approvals' && (
				<Paper className="mx-4 overflow-hidden rounded-xl shadow-sm md:mx-8">
					<Typography className="px-5 pt-5 text-xl font-semibold">Pending Approvals</Typography>
					<Divider className="mt-4" />
					<List className="divide-y py-0">
						{approvals.length === 0 ? (
							<ListItemText className="px-5 py-5" primary="No pending approvals" />
						) : (
							approvals.slice(0, 14).map((approval: Approval) => (
								<ListItemButton key={approval.id} className="items-start px-5 py-4" disableGutters>
									<ListItemText
										primary={approval.request_title ?? approval.task_title ?? approval.id}
										secondary={new Date(approval.requested_at).toLocaleString()}
									/>
									<Stack direction="row" spacing={1}>
										<Button size="small" variant="outlined" disabled={approveM.isPending || !approval.task_id} onClick={() => approveM.mutate(approval.id)}>Approve</Button>
										<Button size="small" color="error" variant="outlined" disabled={rejectM.isPending || !approval.task_id} onClick={() => rejectM.mutate(approval.id)}>Reject</Button>
									</Stack>
								</ListItemButton>
							))
						)}
					</List>
				</Paper>
			)}

			{tabValue === 'health' && (
				<div className="grid w-full grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2 md:px-8">
					<Paper className="rounded-xl p-6 shadow-sm">
						<Typography className="text-xl leading-6 font-medium tracking-tight">Status Breakdown</Typography>
						<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="mt-4">
							{(Object.keys(STATUS_LABEL) as TaskStatus[]).map((status) => (
								<Chip key={status} size="small" label={`${STATUS_LABEL[status]}: ${statusCounts[status]}`} color={severityByStatus(status)} />
							))}
						</Stack>
					</Paper>

					<Paper className="rounded-xl p-6 shadow-sm">
						<Typography className="text-xl leading-6 font-medium tracking-tight">Run Health</Typography>
						<Card className="mt-4 rounded-xl shadow-none" variant="outlined">
							<CardContent>
								<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
									<Chip color="warning" label={`Stuck: ${stuckQ.data?.length ?? 0}`} />
									<Chip color="error" label={`Failed (24h): ${failed24h.length}`} />
									<Chip color="info" label={`Sections: ${sectionsQ.data?.length ?? 0}`} />
								</Stack>
							</CardContent>
						</Card>
					</Paper>
				</div>
			)}

			{createTaskM.isError ? (
				<Alert severity="error" sx={{ mx: { xs: 2, md: 4 }, mb: 2 }}>
					{String(createTaskM.error)}
				</Alert>
			) : null}
		</div>
	);

	return (
		<Root
			header={
				<WorkspaceHeader
					projectId={projectId}
					projects={(projectsQ.data ?? []).map((project) => ({ id: project.id, name: project.name }))}
					capture={capture}
					onSetCapture={setCapture}
					onSelectProject={selectProject}
					onCreateTask={() => createTaskM.mutate(capture.trim())}
					creating={createTaskM.isPending}
				/>
			}
			content={content}
			scroll="content"
		/>
	);
}
