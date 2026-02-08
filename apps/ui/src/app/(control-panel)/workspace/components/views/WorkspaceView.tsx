import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Alert,
	Box,
	Button,
	Chip,
	Divider,
	FormControl,
	IconButton,
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
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import useThemeMediaQuery from '@fuse/hooks/useThemeMediaQuery';
import { useLocation, useNavigate } from 'react-router';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import {
	approveApproval,
	createChecklistItem,
	createTask,
	deleteChecklistItem,
	getMemoryDoc,
	getTaskChat,
	getTaskDetails,
	getTaskSession,
	listApprovals,
	listChecklist,
	listProjects,
	listSections,
	listTaskRuns,
	listTasks,
	patchTask,
	rejectApproval,
	requestTaskApproval,
	runTask,
	sendTaskChat,
	stopTask,
	updateChecklistItem,
	updateMemoryDoc,
	upsertTaskSession
} from '@/api/queries';
import type {
	Approval,
	ChecklistState,
	ReasoningLevel,
	Task,
	TaskChecklistItem,
	TaskMessage,
	TaskSession,
	TaskStatus
} from '@/api/types';

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

const STATUS_ORDER: TaskStatus[] = ['ideas', 'todo', 'doing', 'review', 'release', 'done', 'archived'];

const STATUS_LABEL: Record<TaskStatus, string> = {
	ideas: 'Ideas',
	todo: 'To do',
	doing: 'In progress',
	review: 'Review',
	release: 'Release',
	done: 'Done',
	archived: 'Archived'
};

function parseSelection(search: string) {
	const params = new URLSearchParams(search);
	const workspaceId = params.get('workspaceId') ?? params.get('projectId') ?? null;
	const boardId = params.get('boardId') ?? params.get('sectionId') ?? null;
	return { workspaceId, boardId };
}

function WorkspaceHeader({
	workspaceId,
	boardId,
	workspaces,
	boards,
	capture,
	onSetCapture,
	onSelectWorkspace,
	onSelectBoard,
	onCreateTask,
	creating
}: {
	workspaceId: string | null;
	boardId: string | null;
	workspaces: Array<{ id: string; name: string }>;
	boards: Array<{ id: string; name: string }>;
	capture: string;
	onSetCapture: (value: string) => void;
	onSelectWorkspace: (id: string) => void;
	onSelectBoard: (id: string) => void;
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
							Workspace Board
						</Typography>
						<Typography
							className="text-md mt-1"
							color="text.secondary"
						>
							Task-centric execution shell
						</Typography>
					</div>

					<div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
						<FormControl
							size="small"
							sx={{ minWidth: { xs: 220, md: 240 } }}
						>
							<InputLabel id="workspace-select-label">Workspace</InputLabel>
							<Select
								labelId="workspace-select-label"
								label="Workspace"
								value={workspaceId ?? ''}
								onChange={(event) => onSelectWorkspace(String(event.target.value))}
							>
								{workspaces.map((workspace) => (
									<MenuItem
										key={workspace.id}
										value={workspace.id}
									>
										{workspace.name}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						<FormControl
							size="small"
							sx={{ minWidth: { xs: 200, md: 220 } }}
							disabled={!workspaceId || boards.length === 0}
						>
							<InputLabel id="board-select-label">Board</InputLabel>
							<Select
								labelId="board-select-label"
								label="Board"
								value={boardId ?? ''}
								onChange={(event) => onSelectBoard(String(event.target.value))}
							>
								{boards.map((board) => (
									<MenuItem
										key={board.id}
										value={board.id}
									>
										{board.name}
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
							sx={{ minWidth: { xs: 220, md: 280 } }}
						/>

						<Button
							variant="contained"
							disabled={!capture.trim() || !workspaceId || creating}
							onClick={onCreateTask}
							startIcon={<FuseSvgIcon>lucide:plus</FuseSvgIcon>}
						>
							{creating ? 'Adding...' : 'Add Task'}
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
	const [{ workspaceId, boardId }, setSelection] = useState(() => parseSelection(location.search));
	const [capture, setCapture] = useState('');
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	const [drawerTab, setDrawerTab] = useState<'brief' | 'chat' | 'runs' | 'approvals' | 'context'>('brief');
	const [chatInput, setChatInput] = useState('');
	const [checklistInput, setChecklistInput] = useState('');
	const [memoryDraft, setMemoryDraft] = useState('');
	const [titleDraft, setTitleDraft] = useState('');
	const [descriptionDraft, setDescriptionDraft] = useState('');
	const [statusDraft, setStatusDraft] = useState<TaskStatus>('ideas');

	useEffect(() => {
		setSelection(parseSelection(location.search));
	}, [location.search]);

	const workspacesQ = useQuery({
		queryKey: ['workspaces', 'active'],
		queryFn: () => listProjects({ archived: 'active' })
	});

	const boardsQ = useQuery({
		queryKey: ['boards', workspaceId],
		queryFn: () => {
			if (!workspaceId) return Promise.resolve([] as any[]);
			return listSections(workspaceId);
		},
		enabled: !!workspaceId
	});

	const tasksQ = useQuery({
		queryKey: ['tasks', workspaceId, boardId],
		queryFn: () => {
			if (!workspaceId) return Promise.resolve([] as Task[]);
			return listTasks({ workspaceId, boardId: boardId ?? undefined });
		},
		enabled: !!workspaceId
	});

	const approvalsQ = useQuery({
		queryKey: ['approvals', workspaceId, 'pending'],
		queryFn: () => listApprovals({ workspaceId: workspaceId ?? undefined, status: 'pending' }),
		enabled: !!workspaceId
	});

	const selectedTask = useMemo(
		() => (tasksQ.data ?? []).find((task) => task.id === selectedTaskId) ?? null,
		[selectedTaskId, tasksQ.data]
	);

	const taskDetailsQ = useQuery({
		queryKey: ['task', selectedTaskId],
		queryFn: () => getTaskDetails(selectedTaskId as string),
		enabled: !!selectedTaskId
	});

	const sessionQ = useQuery({
		queryKey: ['task-session', selectedTaskId],
		queryFn: async () => {
			try {
				return await getTaskSession(selectedTaskId as string);
			} catch {
				return null as TaskSession | null;
			}
		},
		enabled: !!selectedTaskId
	});

	const chatQ = useQuery({
		queryKey: ['task-chat', selectedTaskId],
		queryFn: () => getTaskChat(selectedTaskId as string, { limit: 200 }),
		enabled: !!selectedTaskId
	});

	const runsQ = useQuery({
		queryKey: ['task-runs', selectedTaskId],
		queryFn: () => listTaskRuns(selectedTaskId as string, { limit: 50 }),
		enabled: !!selectedTaskId
	});

	const checklistQ = useQuery({
		queryKey: ['task-checklist', selectedTaskId],
		queryFn: () => listChecklist(selectedTaskId as string),
		enabled: !!selectedTaskId
	});

	const memoryQ = useQuery({
		queryKey: ['board-memory', boardId],
		queryFn: () => getMemoryDoc({ scope: 'board', id: boardId as string }),
		enabled: !!boardId
	});

	useEffect(() => {
		if (!workspaceId && workspacesQ.data?.length) {
			const next = new URLSearchParams(location.search);
			next.set('workspaceId', workspacesQ.data[0].id);
			next.delete('projectId');
			next.delete('sectionId');
			navigate(`/workspace?${next.toString()}`, { replace: true });
		}
	}, [location.search, navigate, workspaceId, workspacesQ.data]);

	useEffect(() => {
		if (!workspaceId || !boardsQ.data?.length) return;
		const exists = boardId ? boardsQ.data.some((board) => board.id === boardId) : false;
		if (!exists) {
			const next = new URLSearchParams(location.search);
			next.set('workspaceId', workspaceId);
			next.set('boardId', boardsQ.data[0].id);
			next.delete('projectId');
			next.delete('sectionId');
			navigate(`/workspace?${next.toString()}`, { replace: true });
		}
	}, [boardId, boardsQ.data, location.search, navigate, workspaceId]);

	useEffect(() => {
		if (selectedTaskId && !(tasksQ.data ?? []).some((task) => task.id === selectedTaskId)) {
			setSelectedTaskId(null);
		}
	}, [selectedTaskId, tasksQ.data]);

	useEffect(() => {
		const task = taskDetailsQ.data ?? selectedTask;
		if (!task) return;
		setTitleDraft(task.title ?? '');
		setDescriptionDraft(task.description ?? '');
		setStatusDraft((task.status as TaskStatus) ?? 'ideas');
	}, [selectedTask, taskDetailsQ.data]);

	useEffect(() => {
		setMemoryDraft(memoryQ.data?.content ?? '');
	}, [memoryQ.data?.content]);

	const invalidateTaskViews = async () => {
		await qc.invalidateQueries({ queryKey: ['tasks'] });
		await qc.invalidateQueries({ queryKey: ['task'] });
		await qc.invalidateQueries({ queryKey: ['task-runs'] });
		await qc.invalidateQueries({ queryKey: ['task-session'] });
		await qc.invalidateQueries({ queryKey: ['approvals'] });
	};

	const createTaskM = useMutation({
		mutationFn: async () => {
			if (!workspaceId) throw new Error('Workspace not selected');
			return createTask({
				workspaceId,
				boardId: boardId ?? undefined,
				title: capture.trim(),
				status: 'ideas'
			});
		},
		onSuccess: async () => {
			setCapture('');
			await qc.invalidateQueries({ queryKey: ['tasks'] });
		}
	});

	const patchTaskM = useMutation({
		mutationFn: async (payload: { id: string; patch: Partial<Pick<Task, 'title' | 'description' | 'status'>> }) =>
			patchTask(payload.id, payload.patch),
		onSuccess: invalidateTaskViews
	});

	const sendChatM = useMutation({
		mutationFn: async () => {
			if (!selectedTaskId) throw new Error('Task is not selected');
			return sendTaskChat(selectedTaskId, { text: chatInput.trim() });
		},
		onSuccess: async () => {
			setChatInput('');
			await qc.invalidateQueries({ queryKey: ['task-chat'] });
		}
	});

	const runTaskM = useMutation({
		mutationFn: async (mode: 'plan' | 'execute' | 'report') => {
			if (!selectedTaskId) throw new Error('Task is not selected');
			return runTask(selectedTaskId, { mode });
		},
		onSuccess: invalidateTaskViews
	});

	const stopTaskM = useMutation({
		mutationFn: async () => {
			if (!selectedTaskId) throw new Error('Task is not selected');
			return stopTask(selectedTaskId);
		},
		onSuccess: invalidateTaskViews
	});

	const upsertSessionM = useMutation({
		mutationFn: async (input: { executionMode?: 'single' | 'squad'; reasoningLevel?: ReasoningLevel }) => {
			if (!selectedTaskId) throw new Error('Task is not selected');
			return upsertTaskSession(selectedTaskId, input);
		},
		onSuccess: invalidateTaskViews
	});

	const requestApprovalM = useMutation({
		mutationFn: async () => {
			if (!selectedTaskId) throw new Error('Task is not selected');
			return requestTaskApproval(selectedTaskId, { title: `Approval: ${titleDraft || selectedTask?.title || 'Task'}` });
		},
		onSuccess: invalidateTaskViews
	});

	const approveM = useMutation({
		mutationFn: async (approvalId: string) => approveApproval(approvalId, { decidedBy: 'workspace' }),
		onSuccess: invalidateTaskViews
	});

	const rejectM = useMutation({
		mutationFn: async (approvalId: string) => rejectApproval(approvalId, { decidedBy: 'workspace' }),
		onSuccess: invalidateTaskViews
	});

	const createChecklistM = useMutation({
		mutationFn: async () => {
			if (!selectedTaskId) throw new Error('Task is not selected');
			return createChecklistItem(selectedTaskId, { title: checklistInput.trim(), state: 'todo' });
		},
		onSuccess: async () => {
			setChecklistInput('');
			await qc.invalidateQueries({ queryKey: ['task-checklist'] });
		}
	});

	const updateChecklistM = useMutation({
		mutationFn: async (payload: { itemId: string; state: ChecklistState }) => {
			if (!selectedTaskId) throw new Error('Task is not selected');
			return updateChecklistItem(selectedTaskId, payload.itemId, { state: payload.state });
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ['task-checklist'] });
		}
	});

	const deleteChecklistM = useMutation({
		mutationFn: async (itemId: string) => {
			if (!selectedTaskId) throw new Error('Task is not selected');
			return deleteChecklistItem(selectedTaskId, itemId);
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ['task-checklist'] });
		}
	});

	const updateMemoryM = useMutation({
		mutationFn: async () => {
			if (!boardId) throw new Error('Board is not selected');
			return updateMemoryDoc({ scope: 'board', id: boardId, content: memoryDraft, updatedBy: 'workspace-ui' });
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ['board-memory'] });
		}
	});

	const groupedTasks = useMemo(() => {
		const map = new Map<TaskStatus, Task[]>();
		for (const status of STATUS_ORDER) map.set(status, []);
		for (const task of tasksQ.data ?? []) {
			const bucket = map.get(task.status as TaskStatus);
			if (bucket) bucket.push(task);
		}
		for (const status of STATUS_ORDER) {
			map.set(
				status,
				(map.get(status) ?? []).slice().sort((a, b) => a.position - b.position || Date.parse(b.updated_at) - Date.parse(a.updated_at))
			);
		}
		return map;
	}, [tasksQ.data]);

	const selectedTaskApprovals = useMemo(
		() => (approvalsQ.data ?? []).filter((approval) => approval.task_id === selectedTaskId),
		[approvalsQ.data, selectedTaskId]
	);

	const taskCounts = useMemo(() => {
		const out: Record<TaskStatus, number> = {
			ideas: 0,
			todo: 0,
			doing: 0,
			review: 0,
			release: 0,
			done: 0,
			archived: 0
		};
		for (const task of tasksQ.data ?? []) {
			out[task.status] = (out[task.status] ?? 0) + 1;
		}
		return out;
	}, [tasksQ.data]);

	const content = (
		<div className="flex w-full flex-col p-4 md:p-6">
			<Stack
				direction="row"
				spacing={1}
				useFlexGap
				flexWrap="wrap"
			>
				{STATUS_ORDER.map((status) => (
					<Chip
						key={status}
						size="small"
						label={`${STATUS_LABEL[status]}: ${taskCounts[status]}`}
					/>
				))}
			</Stack>

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' },
					gap: 2,
					mt: 2
				}}
			>
				{STATUS_ORDER.map((status) => (
					<Paper
						key={status}
						className="rounded-xl p-3 shadow-sm"
					>
						<Stack
							direction="row"
							justifyContent="space-between"
							alignItems="center"
						>
							<Typography className="text-sm font-semibold">{STATUS_LABEL[status]}</Typography>
							<Chip
								size="small"
								label={groupedTasks.get(status)?.length ?? 0}
							/>
						</Stack>
						<List className="mt-2 divide-y py-0">
							{(groupedTasks.get(status) ?? []).map((task) => (
								<ListItemButton
									key={task.id}
									className="px-2 py-2"
									onClick={() => {
										setSelectedTaskId(task.id);
										setDrawerTab('brief');
									}}
								>
									<ListItemText
										primary={task.title}
										secondary={new Date(task.updated_at).toLocaleString()}
									/>
								</ListItemButton>
							))}
							{(groupedTasks.get(status) ?? []).length === 0 ? (
								<ListItem className="px-2 py-2">
									<ListItemText
										primary="No tasks"
										primaryTypographyProps={{ color: 'text.secondary', fontSize: 13 }}
									/>
								</ListItem>
							) : null}
						</List>
					</Paper>
				))}
			</Box>

			{tasksQ.isError ? (
				<Alert
					severity="error"
					sx={{ mt: 2 }}
				>
					{String(tasksQ.error)}
				</Alert>
			) : null}
		</div>
	);

	const activeTask = taskDetailsQ.data ?? selectedTask;
	const chatMessages = chatQ.data ?? [];
	const checklist = checklistQ.data ?? [];
	const runs = runsQ.data ?? [];
	const executionMode = sessionQ.data?.execution_mode ?? 'single';
	const reasoningLevel = (sessionQ.data?.reasoning_level as ReasoningLevel) ?? 'auto';

	return (
		<Root
			header={
				<WorkspaceHeader
					workspaceId={workspaceId}
					boardId={boardId}
					workspaces={(workspacesQ.data ?? []).map((workspace) => ({ id: workspace.id, name: workspace.name }))}
					boards={(boardsQ.data ?? []).map((board) => ({ id: board.id, name: board.name }))}
					capture={capture}
					onSetCapture={setCapture}
					onSelectWorkspace={(id) => {
						const next = new URLSearchParams(location.search);
						next.set('workspaceId', id);
						next.delete('projectId');
						next.delete('sectionId');
						next.delete('boardId');
						navigate(`/workspace?${next.toString()}`);
					}}
					onSelectBoard={(id) => {
						const next = new URLSearchParams(location.search);
						next.set('workspaceId', workspaceId ?? '');
						next.set('boardId', id);
						next.delete('projectId');
						next.delete('sectionId');
						navigate(`/workspace?${next.toString()}`);
					}}
					onCreateTask={() => createTaskM.mutate()}
					creating={createTaskM.isPending}
				/>
			}
			content={content}
			rightSidebarProps={{
				content: (
					<Box
						sx={{ width: isMobile ? '100vw' : 560, maxWidth: '100vw', p: 2, pb: 3 }}
					>
						<Stack
							direction="row"
							justifyContent="space-between"
							alignItems="center"
						>
							<Typography className="text-xl font-semibold">{activeTask?.title ?? 'Task'}</Typography>
							<IconButton onClick={() => setSelectedTaskId(null)}>
								<FuseSvgIcon>lucide:x</FuseSvgIcon>
							</IconButton>
						</Stack>
						<Tabs
							value={drawerTab}
							onChange={(_event, value) => setDrawerTab(value)}
							sx={{ mt: 1 }}
						>
							<Tab
								value="brief"
								label="Brief"
							/>
							<Tab
								value="chat"
								label="Chat"
							/>
							<Tab
								value="runs"
								label="Runs"
							/>
							<Tab
								value="approvals"
								label="Approvals"
							/>
							<Tab
								value="context"
								label="Context"
							/>
						</Tabs>
						<Divider className="my-2" />

							{drawerTab === 'brief' ? (
								<Stack spacing={2}>
									<TextField
										label="Title"
										value={titleDraft}
										onChange={(event) => setTitleDraft(event.target.value)}
									/>
									<TextField
										label="Description"
										multiline
										minRows={4}
										value={descriptionDraft}
										onChange={(event) => setDescriptionDraft(event.target.value)}
									/>
									<FormControl size="small">
										<InputLabel id="task-status-label">Status</InputLabel>
										<Select
											labelId="task-status-label"
											label="Status"
											value={statusDraft}
											onChange={(event) => setStatusDraft(event.target.value as TaskStatus)}
										>
											{STATUS_ORDER.map((status) => (
												<MenuItem
													key={status}
													value={status}
												>
													{STATUS_LABEL[status]}
												</MenuItem>
											))}
										</Select>
									</FormControl>
										<FormControl size="small">
											<InputLabel id="execution-mode-label">Execution Mode</InputLabel>
											<Select
												labelId="execution-mode-label"
												label="Execution Mode"
												value={executionMode}
												onChange={(event) =>
													upsertSessionM.mutate({ executionMode: event.target.value as 'single' | 'squad' })
												}
											>
												<MenuItem value="single">single</MenuItem>
												<MenuItem value="squad">squad</MenuItem>
											</Select>
										</FormControl>
										<FormControl size="small">
											<InputLabel id="reasoning-level-label">Reasoning</InputLabel>
											<Select
												labelId="reasoning-level-label"
												label="Reasoning"
												value={reasoningLevel}
												onChange={(event) =>
													upsertSessionM.mutate({ reasoningLevel: event.target.value as ReasoningLevel })
												}
											>
												<MenuItem value="off">off</MenuItem>
												<MenuItem value="low">low</MenuItem>
												<MenuItem value="medium">medium</MenuItem>
												<MenuItem value="high">high</MenuItem>
												<MenuItem value="auto">auto</MenuItem>
											</Select>
										</FormControl>
									<Stack
										direction="row"
										spacing={1}
										useFlexGap
										flexWrap="wrap"
									>
										<Button
											variant="contained"
											onClick={() => {
												if (!selectedTaskId) return;
												patchTaskM.mutate({
													id: selectedTaskId,
													patch: { title: titleDraft, description: descriptionDraft, status: statusDraft }
												});
											}}
										>
											Save
										</Button>
										<Button
											variant="outlined"
											onClick={() => runTaskM.mutate('plan')}
										>
											Plan
										</Button>
										<Button
											variant="outlined"
											onClick={() => runTaskM.mutate('execute')}
										>
											Execute
										</Button>
										<Button
											variant="outlined"
											onClick={() => runTaskM.mutate('report')}
										>
											Report
										</Button>
										<Button
											color="error"
											variant="outlined"
											onClick={() => stopTaskM.mutate()}
										>
											Stop
										</Button>
									</Stack>
									<Typography color="text.secondary">Session: {sessionQ.data?.status ?? 'not initialized'}</Typography>
								</Stack>
							) : null}

							{drawerTab === 'chat' ? (
								<Stack spacing={2}>
									<Paper
										variant="outlined"
										sx={{ maxHeight: 360, overflow: 'auto', p: 1 }}
									>
										<List className="py-0">
											{chatMessages.map((message: TaskMessage) => (
												<ListItem key={message.id} className="px-2 py-1">
													<ListItemText
														primary={message.role}
														secondary={message.content}
													/>
												</ListItem>
											))}
											{chatMessages.length === 0 ? (
												<ListItem className="px-2 py-1">
													<ListItemText primary="No messages yet" />
												</ListItem>
											) : null}
										</List>
									</Paper>
									<TextField
										label="Message"
										multiline
										minRows={3}
										value={chatInput}
										onChange={(event) => setChatInput(event.target.value)}
									/>
									<Button
										variant="contained"
										disabled={!chatInput.trim() || sendChatM.isPending}
										onClick={() => sendChatM.mutate()}
									>
										Send
									</Button>
								</Stack>
							) : null}

							{drawerTab === 'runs' ? (
								<Stack spacing={1}>
									{runs.map((run) => (
										<Paper
											key={run.id}
											variant="outlined"
											className="rounded-lg p-2"
										>
											<Stack
												direction="row"
												justifyContent="space-between"
											>
												<Typography className="text-sm font-medium">{run.status}</Typography>
												<Typography color="text.secondary" className="text-xs">
													{new Date(run.created_at).toLocaleString()}
												</Typography>
											</Stack>
											<Typography color="text.secondary" className="text-xs">
												Tokens: {run.total_tokens ?? 0}
											</Typography>
										</Paper>
									))}
									{runs.length === 0 ? <Typography color="text.secondary">No runs yet.</Typography> : null}
							</Stack>
							) : null}

							{drawerTab === 'approvals' ? (
								<Stack spacing={1.5}>
									<Button
										variant="outlined"
										onClick={() => requestApprovalM.mutate()}
									>
										Request approval
									</Button>
									{selectedTaskApprovals.map((approval: Approval) => (
										<Paper
											key={approval.id}
											variant="outlined"
											className="rounded-lg p-2"
										>
											<Typography className="text-sm font-medium">{approval.request_title ?? approval.id}</Typography>
											<Typography color="text.secondary" className="text-xs">
												{approval.status} · {new Date(approval.requested_at).toLocaleString()}
											</Typography>
											{approval.status === 'pending' ? (
												<Stack direction="row" spacing={1} className="mt-2">
													<Button
														size="small"
														variant="outlined"
														onClick={() => approveM.mutate(approval.id)}
													>
														Approve
													</Button>
													<Button
														size="small"
														color="error"
														variant="outlined"
														onClick={() => rejectM.mutate(approval.id)}
													>
														Reject
													</Button>
												</Stack>
											) : null}
										</Paper>
									))}
									{selectedTaskApprovals.length === 0 ? (
										<Typography color="text.secondary">No approvals for this task.</Typography>
									) : null}
								</Stack>
							) : null}

							{drawerTab === 'context' ? (
								<Stack spacing={2}>
									<Paper
										variant="outlined"
										className="rounded-lg p-2"
									>
										<Typography className="text-sm font-semibold">Checklist</Typography>
										<List className="py-0">
											{checklist.map((item: TaskChecklistItem) => (
												<ListItem
													key={item.id}
													className="px-0"
													secondaryAction={
														<Stack
															direction="row"
															spacing={1}
														>
															<Button
																size="small"
																variant="text"
																onClick={() => {
																	const next: ChecklistState = item.state === 'todo' ? 'doing' : item.state === 'doing' ? 'done' : 'todo';
																	updateChecklistM.mutate({ itemId: item.id, state: next });
																}}
															>
																{item.state}
															</Button>
															<Button
																size="small"
																color="error"
																variant="text"
																onClick={() => deleteChecklistM.mutate(item.id)}
															>
																del
															</Button>
														</Stack>
													}
												>
													<ListItemText primary={item.title} secondary={item.state} />
												</ListItem>
											))}
										</List>
										<Stack direction="row" spacing={1}>
											<TextField
												size="small"
												fullWidth
												placeholder="Add checklist item"
												value={checklistInput}
												onChange={(event) => setChecklistInput(event.target.value)}
											/>
											<Button
												variant="contained"
												disabled={!checklistInput.trim()}
												onClick={() => createChecklistM.mutate()}
											>
												Add
											</Button>
										</Stack>
									</Paper>

									<TextField
										label="Board context (MEMORY)"
										multiline
										minRows={8}
										value={memoryDraft}
										onChange={(event) => setMemoryDraft(event.target.value)}
									/>
									<Button
										variant="contained"
										onClick={() => updateMemoryM.mutate()}
										disabled={!boardId}
									>
										Save context
									</Button>
								</Stack>
							) : null}

							{runTaskM.isError || sendChatM.isError || patchTaskM.isError ? (
								<Alert severity="error" sx={{ mt: 2 }}>
									{String(runTaskM.error ?? sendChatM.error ?? patchTaskM.error)}
								</Alert>
							) : null}
					</Box>
				),
				open: Boolean(selectedTaskId),
				onClose: () => setSelectedTaskId(null),
				width: isMobile ? 420 : 560
			}}
			scroll={isMobile ? 'page' : 'content'}
		/>
	);
}
