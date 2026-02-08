import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Avatar,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Divider,
	FormControl,
	InputLabel,
	LinearProgress,
	List,
	ListItemButton,
	ListItemText,
	MenuItem,
	Paper,
	Select,
	Stack,
	Tab,
	Tabs,
	Typography
} from '@mui/material';
import { darken, styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { listApprovals, listProjects, listRuns, listSections, listTasks } from '@/api/queries';
import type { Section, Task, TaskStatus } from '@/api/types';

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

function ProjectsHeader({
	projectName,
	projectId,
	projects,
	onSelectProject,
	onOpenWorkspace
}: {
	projectName: string;
	projectId: string | null;
	projects: Array<{ id: string; name: string }>;
	onSelectProject: (id: string) => void;
	onOpenWorkspace: () => void;
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
							<FuseSvgIcon size={20}>lucide:kanban-square</FuseSvgIcon>
						</Avatar>
						<div className="min-w-0">
							<Typography className="truncate text-2xl leading-none font-bold tracking-tight md:text-3xl">
								{projectName}
							</Typography>
							<Typography className="text-md mt-1" color="text.secondary">
								Project control panel with Fuse widgets
							</Typography>
						</div>
					</div>

					<div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
						<FormControl size="small" sx={{ minWidth: { xs: 240, md: 260 } }}>
							<InputLabel id="projects-page-project-label">Project</InputLabel>
							<Select
								labelId="projects-page-project-label"
								label="Project"
								value={projectId ?? ''}
								onChange={(event) => onSelectProject(String(event.target.value))}
							>
								{projects.map((project) => (
									<MenuItem key={project.id} value={project.id}>
										{project.name}
									</MenuItem>
								))}
							</Select>
						</FormControl>
						<Button
							className="whitespace-nowrap"
							variant="contained"
							startIcon={<FuseSvgIcon>lucide:list-todo</FuseSvgIcon>}
							onClick={onOpenWorkspace}
						>
							Open Workspace
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
			<Stack direction="row" alignItems="center" justifyContent="space-between">
				<Typography className="text-md" color="text.secondary">
					{title}
				</Typography>
				<FuseSvgIcon size={18} color="action">{icon}</FuseSvgIcon>
			</Stack>
			<Typography className="mt-3 text-4xl leading-none font-bold tracking-tight">{value}</Typography>
		</Paper>
	);
}

function taskProgress(status: TaskStatus, total: number, count: number): { label: string; color: 'primary' | 'secondary' | 'success' | 'warning' | 'error' } {
	if (status === 'done') return { label: 'Completed', color: 'success' };
	if (status === 'review' || status === 'release') return { label: 'Needs review', color: 'warning' };
	if (status === 'doing') return { label: 'Active', color: 'primary' };
	if (status === 'archived') return { label: 'Archived', color: 'secondary' };
	return { label: `Share ${total ? Math.round((count / total) * 100) : 0}%`, color: 'secondary' };
}

export default function ProjectsView() {
	const location = useLocation();
	const navigate = useNavigate();
	const [tabValue, setTabValue] = useState('overview');
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

	const runningQ = useQuery({
		queryKey: ['runs', 'running', projectId, 'projects-page'],
		queryFn: () => listRuns({ status: 'running', projectId: projectId ?? undefined })
	});

	const failedQ = useQuery({
		queryKey: ['runs', 'failed', projectId, 'projects-page'],
		queryFn: () => listRuns({ status: 'failed', projectId: projectId ?? undefined })
	});

	useEffect(() => {
		if (!projectId && projectsQ.data?.length) {
			const next = new URLSearchParams(location.search);
			next.set('projectId', projectsQ.data[0].id);
			navigate(`/projects?${next.toString()}`, { replace: true });
		}
	}, [location.search, navigate, projectId, projectsQ.data]);

	const tasks = tasksQ.data ?? [];
	const sections = sectionsQ.data ?? [];
	const pendingApprovals = approvalsQ.data ?? [];
	const selectedProject = useMemo(
		() => (projectsQ.data ?? []).find((project) => project.id === projectId) ?? null,
		[projectId, projectsQ.data]
	);

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

	const failed24h = useMemo(
		() => (failedQ.data ?? []).filter((run) => Date.parse(run.created_at) >= Date.now() - 24 * 60 * 60 * 1000),
		[failedQ.data]
	);

	const sectionRows = useMemo(
		() =>
			sections.map((section) => ({
				...section,
				tasks: tasksBySection.get(section.id) ?? 0
			})),
		[sections, tasksBySection]
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

	const container = {
		show: {
			transition: {
				staggerChildren: 0.04
			}
		}
	};
	const item = {
		hidden: { opacity: 0, y: 20 },
		show: { opacity: 1, y: 0 }
	};

	const content = (
		<div className="w-full pt-4 sm:pt-6">
			<div className="flex w-full flex-col justify-between gap-2 px-4 sm:flex-row sm:items-center md:px-8">
				<Tabs value={tabValue} onChange={(_event, value: string) => setTabValue(value)}>
					<Tab value="overview" label="Overview" />
					<Tab value="sections" label="Sections" />
					<Tab value="health" label="Health" />
				</Tabs>
			</div>

			{tabValue === 'overview' && (
				<motion.div
					className="grid w-full min-w-0 grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 md:grid-cols-4 md:px-8"
					variants={container}
					initial="hidden"
					animate="show"
				>
					<motion.div variants={item}><StatCard title="Tasks" value={tasks.length} icon="lucide:list-checks" /></motion.div>
					<motion.div variants={item}><StatCard title="Sections" value={sections.length} icon="lucide:columns-3" /></motion.div>
					<motion.div variants={item}><StatCard title="Pending approvals" value={pendingApprovals.length} icon="lucide:shield-alert" /></motion.div>
					<motion.div variants={item}><StatCard title="Active runs" value={runningQ.data?.length ?? 0} icon="lucide:activity" /></motion.div>

					<motion.div variants={item} className="sm:col-span-2 md:col-span-4 lg:col-span-2">
						<Paper className="flex h-full flex-auto flex-col overflow-hidden rounded-xl p-6 shadow-sm">
							<Typography className="text-xl leading-6 font-medium tracking-tight">Active Tasks</Typography>
							<List className="mt-2 divide-y py-0">
								{activeTasks.length === 0 ? (
									<ListItemText className="px-0 py-4" primary="No active tasks" />
								) : (
									activeTasks.map((task) => (
										<ListItemButton key={task.id} disableGutters onClick={() => openTask(task.id)}>
											<ListItemText
												primary={task.title}
												secondary={`${STATUS_LABEL[task.status]} · ${new Date(task.updated_at).toLocaleString()}`}
											/>
											<Chip size="small" label={STATUS_LABEL[task.status]} />
										</ListItemButton>
									))
								)}
							</List>
						</Paper>
					</motion.div>

					<motion.div variants={item} className="sm:col-span-2 md:col-span-4 lg:col-span-2">
						<Paper className="flex h-full flex-auto flex-col overflow-hidden rounded-xl p-6 shadow-sm">
							<Typography className="text-xl leading-6 font-medium tracking-tight">Pending Approvals</Typography>
							<List className="mt-2 divide-y py-0">
								{pendingApprovals.length === 0 ? (
									<ListItemText className="px-0 py-4" primary="No pending approvals" />
								) : (
									pendingApprovals.slice(0, 12).map((approval) => (
										<ListItemButton
											key={approval.id}
											disableGutters
											onClick={() => approval.task_id && openTask(approval.task_id)}
										>
											<ListItemText
												primary={approval.request_title ?? approval.task_title ?? approval.id}
												secondary={new Date(approval.requested_at).toLocaleString()}
											/>
											<Chip size="small" color="warning" label="Needs action" />
										</ListItemButton>
									))
								)}
							</List>
						</Paper>
					</motion.div>
				</motion.div>
			)}

			{tabValue === 'sections' && (
				<div className="grid w-full grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 md:grid-cols-3 md:px-8">
					{sectionRows.length === 0 ? (
						<Paper className="rounded-xl p-6 shadow-sm sm:col-span-2 md:col-span-3">
							<Typography color="text.secondary">No sections in this project.</Typography>
						</Paper>
					) : (
						sectionRows.map((section) => (
							<Paper key={section.id} className="rounded-xl p-5 shadow-sm">
								<Stack direction="row" justifyContent="space-between" alignItems="center">
									<Typography className="text-lg leading-6 font-medium tracking-tight">{section.name}</Typography>
									<Chip size="small" label={section.section_kind === 'inbox' ? 'Inbox' : section.view_mode} />
								</Stack>
								<Typography className="mt-2 text-sm" color="text.secondary">
									{section.tasks} tasks in section
								</Typography>
								<Button className="mt-4" size="small" variant="outlined" onClick={() => navigate(`/workspace?projectId=${encodeURIComponent(section.project_id)}`)}>
									Open in workspace
								</Button>
							</Paper>
						))
					)}
				</div>
			)}

			{tabValue === 'health' && (
				<div className="grid w-full grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2 md:px-8">
					<Paper className="rounded-xl p-6 shadow-sm">
						<Typography className="text-xl leading-6 font-medium tracking-tight">Status Distribution</Typography>
						<Stack spacing={2} className="mt-4">
							{(Object.keys(STATUS_LABEL) as TaskStatus[]).map((status) => {
								const count = statusCounts[status];
								const progress = tasks.length ? Math.round((count / tasks.length) * 100) : 0;
								const meta = taskProgress(status, tasks.length, count);
								return (
									<Box key={status}>
										<Stack direction="row" justifyContent="space-between" alignItems="center">
											<Typography className="text-sm font-medium">{STATUS_LABEL[status]}</Typography>
											<Typography className="text-sm" color="text.secondary">{count} · {meta.label}</Typography>
										</Stack>
										<LinearProgress color={meta.color} variant="determinate" value={progress} sx={{ mt: 0.75, height: 8, borderRadius: 999 }} />
									</Box>
								);
							})}
						</Stack>
					</Paper>

					<Paper className="rounded-xl p-6 shadow-sm">
						<Typography className="text-xl leading-6 font-medium tracking-tight">Run Health</Typography>
						<Card className="mt-4 rounded-xl shadow-none" variant="outlined">
							<CardContent>
								<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
									<Chip size="small" color="info" label={`Running: ${runningQ.data?.length ?? 0}`} />
									<Chip size="small" color="error" label={`Failed (24h): ${failed24h.length}`} />
									<Chip size="small" color="warning" label={`Pending approvals: ${pendingApprovals.length}`} />
								</Stack>
							</CardContent>
						</Card>

						<Divider className="my-4" />
						<Typography className="text-sm font-medium" color="text.secondary">Recently changed tasks</Typography>
						<List className="mt-1 divide-y py-0">
							{[...tasks]
								.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
								.slice(0, 8)
								.map((task) => (
									<ListItemButton key={task.id} disableGutters onClick={() => openTask(task.id)}>
										<ListItemText
											primary={task.title}
											secondary={`${STATUS_LABEL[task.status]} · ${new Date(task.updated_at).toLocaleString()}`}
										/>
									</ListItemButton>
								))}
						</List>
					</Paper>
				</div>
			)}
		</div>
	);

	return (
		<Root
			header={
				<ProjectsHeader
					projectName={selectedProject?.name ?? 'Projects'}
					projectId={projectId}
					projects={(projectsQ.data ?? []).map((project) => ({ id: project.id, name: project.name }))}
					onSelectProject={selectProject}
					onOpenWorkspace={() => projectId && navigate(`/workspace?projectId=${encodeURIComponent(projectId)}`)}
				/>
			}
			content={content}
			scroll="content"
		/>
	);
}
