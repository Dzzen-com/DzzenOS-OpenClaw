import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Alert,
	Button,
	Divider,
	FormControl,
	InputLabel,
	List,
	ListItem,
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
import { styled } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import useThemeMediaQuery from '@fuse/hooks/useThemeMediaQuery';
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
import {
	GithubIssuesWidget,
	MetricWidget,
	ScheduleWidget,
	SummaryWidget,
	TaskDistributionWidget,
	type GithubOverview,
	type RangesMap,
	type ScheduleEntry
} from '@/components/fuse-demo/widgets/ProjectDashboardWidgets';

const Root = styled(FusePageSimple)(({ theme }) => ({
	'& .container': {
		maxWidth: '100%!important'
	},
	'& .FusePageSimple-contentWrapper': {
		paddingTop: 2
	},
	'& .FusePageSimple-content': {
		boxShadow: theme.vars.shadows[2]
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

const DASHBOARD_RANGES: RangesMap = {
	today: 'Today',
	week: 'This Week',
	month: 'This Month'
};

type DashboardRange = keyof typeof DASHBOARD_RANGES;

const DAY_MS = 24 * 60 * 60 * 1000;

function inRange(iso: string, range: DashboardRange): boolean {
	const time = Date.parse(iso);

	if (!Number.isFinite(time)) return false;

	const now = Date.now();

	if (range === 'today') return time >= now - DAY_MS;

	if (range === 'week') return time >= now - 7 * DAY_MS;

	return time >= now - 30 * DAY_MS;
}

function dayLabelsLast7(): string[] {
	return Array.from({ length: 7 }, (_value, index) => {
		const shift = 6 - index;
		const date = new Date(Date.now() - shift * DAY_MS);
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	});
}

function bucketByLast7Days(items: Array<{ at: string }>): number[] {
	const now = new Date();
	const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const buckets = Array.from({ length: 7 }, () => 0);

	for (const item of items) {
		const time = Date.parse(item.at);

		if (!Number.isFinite(time)) continue;

		const startItemDay = new Date(
			new Date(time).getFullYear(),
			new Date(time).getMonth(),
			new Date(time).getDate()
		).getTime();
		const dayDiff = Math.floor((startToday - startItemDay) / DAY_MS);

		if (dayDiff >= 0 && dayDiff < 7) {
			buckets[6 - dayDiff] += 1;
		}
	}

	return buckets;
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
				<div className="flex min-w-0 flex-auto flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<Typography className="truncate text-3xl leading-none font-bold tracking-tight md:text-4xl">
							Workspace
						</Typography>
						<Typography
							className="text-md mt-1"
							color="text.secondary"
						>
							Live control panel dashboard
						</Typography>
					</div>

					<div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
						<FormControl
							size="small"
							sx={{ minWidth: { xs: 230, md: 250 } }}
						>
							<InputLabel id="workspace-project-label">Project</InputLabel>
							<Select
								labelId="workspace-project-label"
								label="Project"
								value={projectId ?? ''}
								onChange={(event) => onSelectProject(String(event.target.value))}
							>
								{projects.map((project) => (
									<MenuItem
										key={project.id}
										value={project.id}
									>
										{project.name}
									</MenuItem>
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
							sx={{ minWidth: { xs: 220, md: 260 } }}
						/>

						<Button
							variant="contained"
							disabled={!capture.trim() || !projectId || creating}
							onClick={onCreateTask}
							startIcon={<FuseSvgIcon>lucide:plus</FuseSvgIcon>}
						>
							{creating ? 'Adding...' : 'Add'}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function WorkspaceView() {
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));
	const location = useLocation();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [capture, setCapture] = useState('');
	const [tabValue, setTabValue] = useState('overview');

	const params = new URLSearchParams(location.search);
	const projectId = params.get('projectId');

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

			const inbox =
				(sectionsQ.data ?? []).find((section) => section.section_kind === 'inbox') ??
				sectionsQ.data?.[0] ??
				null;
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

	const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
	const sections = useMemo(() => sectionsQ.data ?? [], [sectionsQ.data]);
	const approvals = useMemo(() => approvalsQ.data ?? [], [approvalsQ.data]);
	const stuckRuns = useMemo(() => stuckQ.data ?? [], [stuckQ.data]);
	const failedRuns = useMemo(() => failedQ.data ?? [], [failedQ.data]);

	const summaryCounts = useMemo(() => {
		const out: Record<string, number> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			out[key] = tasks.filter((task) => inRange(task.updated_at, key)).length;
		}
		return out;
	}, [tasks]);

	const summaryExtra = useMemo(() => {
		const out: Record<string, number> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			out[key] = tasks.filter(
				(task) =>
					inRange(task.updated_at, key) &&
					(task.status === 'doing' || task.status === 'review' || task.status === 'release')
			).length;
		}
		return out;
	}, [tasks]);

	const overdueCount = useMemo(
		() => tasks.filter((task) => task.status === 'review' || task.status === 'release').length,
		[tasks]
	);
	const issuesCount = useMemo(() => failedRuns.length, [failedRuns]);
	const featuresCount = sections.length;
	const completedCount = useMemo(() => tasks.filter((task) => task.status === 'done').length, [tasks]);

	const labels = useMemo(() => dayLabelsLast7(), []);

	const githubSeries = useMemo(() => {
		const out: Record<string, Array<{ name: string; type?: 'line' | 'bar'; data: number[] }>> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			const scoped = tasks.filter((task) => inRange(task.updated_at, key));
			const newData = bucketByLast7Days(
				scoped
					.filter((task) => task.status === 'ideas' || task.status === 'todo')
					.map((task) => ({ at: task.updated_at }))
			);
			const closedData = bucketByLast7Days(
				scoped
					.filter((task) => task.status === 'done' || task.status === 'archived')
					.map((task) => ({ at: task.updated_at }))
			);
			out[key] = [
				{ name: 'New', type: 'line', data: newData },
				{ name: 'Closed', type: 'bar', data: closedData }
			];
		}
		return out;
	}, [tasks]);

	const githubOverview = useMemo(() => {
		const out: Record<string, GithubOverview> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			const scoped = tasks.filter((task) => inRange(task.updated_at, key));
			out[key] = {
				'new-issues': scoped.filter((task) => task.status === 'ideas' || task.status === 'todo').length,
				'closed-issues': scoped.filter((task) => task.status === 'done').length,
				fixed: scoped.filter((task) => task.status === 'done').length,
				'wont-fix': scoped.filter((task) => task.status === 'archived').length,
				're-opened': scoped.filter((task) => task.status === 'review').length,
				'needs-triage': approvals.filter((approval) => inRange(approval.requested_at, key)).length
			};
		}
		return out;
	}, [approvals, tasks]);

	const distributionSeries = useMemo(() => {
		const out: Record<string, number[]> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			const scoped = tasks.filter((task) => inRange(task.updated_at, key));
			out[key] = [
				scoped.filter((task) => task.status === 'ideas').length,
				scoped.filter((task) => task.status === 'todo').length,
				scoped.filter((task) => task.status === 'doing').length,
				scoped.filter((task) => task.status === 'review' || task.status === 'release').length,
				scoped.filter((task) => task.status === 'done').length,
				scoped.filter((task) => task.status === 'archived').length
			];
		}
		return out;
	}, [tasks]);

	const distributionOverview = useMemo(() => {
		const out: Record<string, { new: number; completed: number }> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			const scoped = tasks.filter((task) => inRange(task.updated_at, key));
			out[key] = {
				new: scoped.filter((task) => task.status === 'ideas' || task.status === 'todo').length,
				completed: scoped.filter((task) => task.status === 'done').length
			};
		}
		return out;
	}, [tasks]);

	const projectById = useMemo(
		() => Object.fromEntries((projectsQ.data ?? []).map((project) => [project.id, project.name])),
		[projectsQ.data]
	);

	const scheduleSeries = useMemo(() => {
		const out: Record<string, ScheduleEntry[]> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			const approvalsEntries = approvals
				.filter((approval) => inRange(approval.requested_at, key))
				.slice(0, 4)
				.map((approval) => ({
					title: approval.request_title ?? approval.task_title ?? 'Pending approval',
					time: new Date(approval.requested_at).toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit'
					}),
					location: approval.project_id ? projectById[approval.project_id] : 'Workspace'
				}));
			const taskEntries = tasks
				.filter((task) => inRange(task.updated_at, key))
				.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
				.slice(0, 4)
				.map((task) => ({
					title: task.title,
					time: new Date(task.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
					location: STATUS_LABEL[task.status]
				}));
			out[key] = [...approvalsEntries, ...taskEntries].slice(0, 8);
		}
		return out;
	}, [approvals, projectById, tasks]);

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
		for (const task of tasks) {
			output[task.status] = (output[task.status] ?? 0) + 1;
		}
		return output;
	}, [tasks]);

	const recentTasks = useMemo(
		() => [...tasks].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 12),
		[tasks]
	);

	const failed24h = useMemo(() => failedRuns.filter((run) => inRange(run.created_at, 'today')), [failedRuns]);

	const content = (
		<div className="flex w-full flex-col p-4 md:p-6">
			<div className="flex w-full flex-col justify-between gap-2 sm:flex-row sm:items-center">
				<Tabs
					value={tabValue}
					onChange={(_event, value: string) => setTabValue(value)}
				>
					<Tab
						value="overview"
						label="Overview"
					/>
					<Tab
						value="approvals"
						label="Approvals"
					/>
					<Tab
						value="health"
						label="Health"
					/>
				</Tabs>
			</div>

			{tabValue === 'overview' ? (
				<div className="grid w-full min-w-0 grid-cols-1 gap-4 py-4 sm:grid-cols-2 md:grid-cols-4">
					<SummaryWidget
						ranges={DASHBOARD_RANGES}
						counts={summaryCounts}
						extraCounts={summaryExtra}
						name="Tasks"
						extraName="Active"
					/>
					<MetricWidget
						title="Overdue"
						value={overdueCount}
						name="Need review"
						extraName="Pending approvals"
						extraCount={approvals.length}
					/>
					<MetricWidget
						title="Issues"
						value={issuesCount}
						name="Failed runs"
						extraName="Stuck runs"
						extraCount={stuckRuns.length}
					/>
					<MetricWidget
						title="Features"
						value={featuresCount}
						name="Sections"
						extraName="Completed tasks"
						extraCount={completedCount}
					/>
					<div className="sm:col-span-2 md:col-span-4">
						<GithubIssuesWidget
							ranges={DASHBOARD_RANGES}
							labels={labels}
							series={githubSeries}
							overview={githubOverview}
							title="Execution Summary"
						/>
					</div>
					<div className="sm:col-span-2 md:col-span-4 lg:col-span-2">
						<TaskDistributionWidget
							ranges={DASHBOARD_RANGES}
							labels={['Ideas', 'Todo', 'Doing', 'Review', 'Done', 'Archived']}
							series={distributionSeries}
							overview={distributionOverview}
						/>
					</div>
					<div className="sm:col-span-2 md:col-span-4 lg:col-span-2">
						<ScheduleWidget
							ranges={DASHBOARD_RANGES}
							series={scheduleSeries}
						/>
					</div>
				</div>
			) : null}

			{tabValue === 'approvals' ? (
				<Paper className="overflow-hidden rounded-xl shadow-sm">
					<Typography className="px-5 pt-5 text-xl font-semibold">Pending Approvals</Typography>
					<Divider className="mt-4" />
					<List className="divide-y py-0">
						{approvals.length === 0 ? (
							<ListItem>
								<ListItemText primary="No pending approvals" />
							</ListItem>
						) : (
							approvals.slice(0, 14).map((approval: Approval) => (
								<ListItemButton
									key={approval.id}
									className="items-start px-5 py-4"
									disableGutters
								>
									<ListItemText
										primary={approval.request_title ?? approval.task_title ?? approval.id}
										secondary={new Date(approval.requested_at).toLocaleString()}
									/>
									<Stack
										direction="row"
										spacing={1}
									>
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
								</ListItemButton>
							))
						)}
					</List>
				</Paper>
			) : null}

			{tabValue === 'health' ? (
				<div className="grid w-full grid-cols-1 gap-4 py-4 md:grid-cols-2">
					<Paper className="rounded-xl p-6 shadow-sm">
						<Typography className="text-xl leading-6 font-medium tracking-tight">
							Status Breakdown
						</Typography>
						<Stack
							direction="row"
							spacing={1}
							useFlexGap
							flexWrap="wrap"
							className="mt-4"
						>
							{(Object.keys(STATUS_LABEL) as TaskStatus[]).map((status) => (
								<Button
									key={status}
									size="small"
									variant="outlined"
									disabled
								>
									{STATUS_LABEL[status]}: {statusCounts[status]}
								</Button>
							))}
						</Stack>
					</Paper>

					<Paper className="rounded-xl p-6 shadow-sm">
						<Typography className="text-xl leading-6 font-medium tracking-tight">Run Health</Typography>
						<List className="mt-3 divide-y py-0">
							<ListItemText
								className="py-2"
								primary={`Stuck runs: ${stuckRuns.length}`}
							/>
							<ListItemText
								className="py-2"
								primary={`Failed (24h): ${failed24h.length}`}
							/>
							<ListItemText
								className="py-2"
								primary={`Sections: ${sections.length}`}
							/>
							<ListItemText
								className="py-2"
								primary={`Recent tasks shown: ${recentTasks.length}`}
							/>
						</List>
					</Paper>
				</div>
			) : null}

			{createTaskM.isError ? (
				<Alert
					severity="error"
					sx={{ mt: 2 }}
				>
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
					onSelectProject={(id) => {
						const next = new URLSearchParams(location.search);
						next.set('projectId', id);
						navigate(`/workspace?${next.toString()}`);
					}}
					onCreateTask={() => createTaskM.mutate(capture.trim())}
					creating={createTaskM.isPending}
				/>
			}
			content={content}
			scroll={isMobile ? 'page' : 'content'}
		/>
	);
}
