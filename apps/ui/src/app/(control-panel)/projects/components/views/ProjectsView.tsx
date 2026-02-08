import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Avatar,
	Button,
	Divider,
	FormControl,
	InputLabel,
	List,
	ListItemButton,
	ListItemText,
	MenuItem,
	Paper,
	Select,
	Tab,
	Tabs,
	Typography
} from '@mui/material';
import { darken, styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { useLocation, useNavigate } from 'react-router';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { listApprovals, listProjects, listRuns, listSections, listTasks } from '@/api/queries';
import type { Section, Task, TaskStatus } from '@/api/types';
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
		const d = new Date(time);
		const startItemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		const dayDiff = Math.floor((startToday - startItemDay) / DAY_MS);
		if (dayDiff >= 0 && dayDiff < 7) {
			buckets[6 - dayDiff] += 1;
		}
	}

	return buckets;
}

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
							<Typography className="truncate text-2xl leading-none font-bold tracking-tight md:text-3xl">{projectName}</Typography>
							<Typography className="text-md mt-1" color="text.secondary">Project dashboard with Fuse demo widgets</Typography>
						</div>
					</div>

					<div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
						<FormControl size="small" sx={{ minWidth: { xs: 230, md: 250 } }}>
							<InputLabel id="projects-page-project-label">Project</InputLabel>
							<Select
								labelId="projects-page-project-label"
								label="Project"
								value={projectId ?? ''}
								onChange={(event) => onSelectProject(String(event.target.value))}
							>
								{projects.map((project) => (
									<MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>
								))}
							</Select>
						</FormControl>
						<Button variant="contained" onClick={onOpenWorkspace} startIcon={<FuseSvgIcon>lucide:list-todo</FuseSvgIcon>} disabled={!projectId}>
							Open Workspace
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function ProjectsView() {
	const location = useLocation();
	const navigate = useNavigate();
	const [tabValue, setTabValue] = useState('overview');
	const params = new URLSearchParams(location.search);
	const projectId = params.get('projectId');

	const projectsQ = useQuery({ queryKey: ['projects', 'projects-page'], queryFn: () => listProjects({ archived: 'active' }) });
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

	const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
	const sections = useMemo(() => sectionsQ.data ?? [], [sectionsQ.data]);
	const approvals = useMemo(() => approvalsQ.data ?? [], [approvalsQ.data]);
	const runningRuns = useMemo(() => runningQ.data ?? [], [runningQ.data]);
	const failedRuns = useMemo(() => failedQ.data ?? [], [failedQ.data]);

	const selectedProject = useMemo(() => (projectsQ.data ?? []).find((project) => project.id === projectId) ?? null, [projectId, projectsQ.data]);

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
			out[key] = tasks.filter((task) => inRange(task.updated_at, key) && (task.status === 'doing' || task.status === 'review' || task.status === 'release')).length;
		}
		return out;
	}, [tasks]);

	const overdueCount = useMemo(() => tasks.filter((task) => task.status === 'review' || task.status === 'release').length, [tasks]);
	const issuesCount = failedRuns.length;
	const featuresCount = sections.length;
	const completedCount = useMemo(() => tasks.filter((task) => task.status === 'done').length, [tasks]);

	const labels = useMemo(() => dayLabelsLast7(), []);

	const githubSeries = useMemo(() => {
		const out: Record<string, Array<{ name: string; type?: 'line' | 'bar'; data: number[] }>> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			const scoped = tasks.filter((task) => inRange(task.updated_at, key));
			const newData = bucketByLast7Days(scoped.filter((task) => task.status === 'ideas' || task.status === 'todo').map((task) => ({ at: task.updated_at })));
			const closedData = bucketByLast7Days(scoped.filter((task) => task.status === 'done' || task.status === 'archived').map((task) => ({ at: task.updated_at })));
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

	const scheduleSeries = useMemo(() => {
		const out: Record<string, ScheduleEntry[]> = {};
		for (const key of Object.keys(DASHBOARD_RANGES) as DashboardRange[]) {
			const approvalsEntries = approvals
				.filter((approval) => inRange(approval.requested_at, key))
				.slice(0, 4)
				.map((approval) => ({
					title: approval.request_title ?? approval.task_title ?? 'Pending approval',
					time: new Date(approval.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
					location: 'Approvals'
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
	}, [approvals, tasks]);

	const sectionRows = useMemo(() => {
		const map = new Map<string, number>();
		for (const task of tasks) {
			map.set(task.section_id, (map.get(task.section_id) ?? 0) + 1);
		}
		return sections.map((section) => ({ ...section, taskCount: map.get(section.id) ?? 0 }));
	}, [sections, tasks]);

	const content = (
		<div className="w-full pt-4 sm:pt-6">
			<div className="flex w-full flex-col justify-between gap-2 px-4 sm:flex-row sm:items-center md:px-8">
				<Tabs value={tabValue} onChange={(_event, value: string) => setTabValue(value)}>
					<Tab value="overview" label="Overview" />
					<Tab value="sections" label="Sections" />
					<Tab value="health" label="Health" />
				</Tabs>
			</div>

			{tabValue === 'overview' ? (
				<div className="grid w-full min-w-0 grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 md:grid-cols-4 md:px-8">
					<SummaryWidget ranges={DASHBOARD_RANGES} counts={summaryCounts} extraCounts={summaryExtra} name="Tasks" extraName="Active" />
					<MetricWidget title="Overdue" value={overdueCount} name="Need review" extraName="Pending approvals" extraCount={approvals.length} />
					<MetricWidget title="Issues" value={issuesCount} name="Failed runs" extraName="Running" extraCount={runningRuns.length} />
					<MetricWidget title="Features" value={featuresCount} name="Sections" extraName="Completed tasks" extraCount={completedCount} />
					<div className="sm:col-span-2 md:col-span-4">
						<GithubIssuesWidget ranges={DASHBOARD_RANGES} labels={labels} series={githubSeries} overview={githubOverview} title="Project Execution Summary" />
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
						<ScheduleWidget ranges={DASHBOARD_RANGES} series={scheduleSeries} />
					</div>
				</div>
			) : null}

			{tabValue === 'sections' ? (
				<Paper className="mx-4 overflow-hidden rounded-xl shadow-sm md:mx-8">
					<Typography className="px-5 pt-5 text-xl font-semibold">Sections</Typography>
					<Divider className="mt-4" />
					<List className="divide-y py-0">
						{sectionRows.length === 0 ? (
							<ListItemText className="px-5 py-5" primary="No sections in project" />
						) : (
							sectionRows.map((section) => (
								<ListItemButton key={section.id} className="px-5 py-4" onClick={() => navigate(`/workspace?projectId=${encodeURIComponent(section.project_id)}`)}>
									<ListItemText
										primary={section.name}
										secondary={`${section.section_kind === 'inbox' ? 'Inbox' : section.view_mode} · ${section.taskCount} tasks`}
									/>
								</ListItemButton>
							))
						)}
					</List>
				</Paper>
			) : null}

			{tabValue === 'health' ? (
				<Paper className="mx-4 overflow-hidden rounded-xl shadow-sm md:mx-8">
					<Typography className="px-5 pt-5 text-xl font-semibold">Run Health</Typography>
					<Divider className="mt-4" />
					<List className="divide-y py-0">
						<ListItemText className="px-5 py-4" primary={`Running runs: ${runningRuns.length}`} />
						<ListItemText className="px-5 py-4" primary={`Failed runs: ${failedRuns.length}`} />
						<ListItemText className="px-5 py-4" primary={`Pending approvals: ${approvals.length}`} />
						<ListItemText className="px-5 py-4" primary={`Sections: ${sections.length}`} />
					</List>
				</Paper>
			) : null}
		</div>
	);

	return (
		<Root
			header={
				<ProjectsHeader
					projectName={selectedProject?.name ?? 'Projects'}
					projectId={projectId}
					projects={(projectsQ.data ?? []).map((project) => ({ id: project.id, name: project.name }))}
					onSelectProject={(id) => {
						const next = new URLSearchParams(location.search);
						next.set('projectId', id);
						navigate(`/projects?${next.toString()}`);
					}}
					onOpenWorkspace={() => projectId && navigate(`/workspace?projectId=${encodeURIComponent(projectId)}`)}
				/>
			}
			content={content}
			scroll="content"
		/>
	);
}
