import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Alert,
	Button,
	FormControl,
	InputLabel,
	List,
	ListItem,
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
import useThemeMediaQuery from '@fuse/hooks/useThemeMediaQuery';
import { useLocation, useNavigate } from 'react-router';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import {
	addBoardMember,
	addWorkspaceMember,
	createWorkspaceInvite,
	listAuditEvents,
	listBoardMembers,
	listProjects,
	listSections,
	listWorkspaceMembers,
	removeWorkspaceMember,
	updateWorkspaceMember
} from '@/api/queries';
import type { MemberRole } from '@/api/types';

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

const ROLE_OPTIONS: MemberRole[] = ['owner', 'admin', 'operator', 'contributor', 'viewer'];

function parseSelection(search: string) {
	const params = new URLSearchParams(search);
	const workspaceId = params.get('workspaceId') ?? params.get('projectId') ?? null;
	const boardId = params.get('boardId') ?? params.get('sectionId') ?? null;
	return { workspaceId, boardId };
}

function TeamAccessHeader({
	workspaceId,
	boardId,
	workspaces,
	boards,
	onSelectWorkspace,
	onSelectBoard
}: {
	workspaceId: string | null;
	boardId: string | null;
	workspaces: Array<{ id: string; name: string }>;
	boards: Array<{ id: string; name: string }>;
	onSelectWorkspace: (id: string) => void;
	onSelectBoard: (id: string) => void;
}) {
	return (
		<div className="container flex w-full border-b">
			<div className="flex flex-auto flex-col p-4 md:px-8">
				<PageBreadcrumb className="mb-2" />
				<div className="flex min-w-0 flex-auto flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<Typography className="truncate text-3xl leading-none font-bold tracking-tight md:text-4xl">
							Team & Access
						</Typography>
						<Typography
							className="text-md mt-1"
							color="text.secondary"
						>
							Workspace/board roles, invites and audit trail
						</Typography>
					</div>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1.5}
						className="min-w-[280px]"
					>
						<FormControl
							size="small"
							sx={{ minWidth: 220 }}
						>
							<InputLabel id="team-workspace-select-label">Workspace</InputLabel>
							<Select
								labelId="team-workspace-select-label"
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
							sx={{ minWidth: 200 }}
							disabled={!workspaceId || boards.length === 0}
						>
							<InputLabel id="team-board-select-label">Board</InputLabel>
							<Select
								labelId="team-board-select-label"
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
					</Stack>
				</div>
			</div>
		</div>
	);
}

export default function TeamAccessView() {
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));
	const location = useLocation();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [{ workspaceId, boardId }, setSelection] = useState(() => parseSelection(location.search));
	const [tab, setTab] = useState<'workspace' | 'board' | 'invites' | 'audit'>('workspace');
	const [workspaceUsername, setWorkspaceUsername] = useState('');
	const [workspaceRole, setWorkspaceRole] = useState<MemberRole>('contributor');
	const [boardUsername, setBoardUsername] = useState('');
	const [boardRole, setBoardRole] = useState<MemberRole>('contributor');
	const [inviteUsername, setInviteUsername] = useState('');
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteRole, setInviteRole] = useState<MemberRole>('contributor');
	const [inviteDays, setInviteDays] = useState('7');

	useEffect(() => {
		setSelection(parseSelection(location.search));
	}, [location.search]);

	const workspacesQ = useQuery({
		queryKey: ['workspaces', 'team-access'],
		queryFn: () => listProjects({ archived: 'active' })
	});

	const boardsQ = useQuery({
		queryKey: ['boards', workspaceId, 'team-access'],
		queryFn: () => {
			if (!workspaceId) return Promise.resolve([] as Array<{ id: string; name: string }>);
			return listSections(workspaceId);
		},
		enabled: !!workspaceId
	});

	const workspaceMembersQ = useQuery({
		queryKey: ['workspace-members', workspaceId],
		queryFn: () => listWorkspaceMembers(workspaceId as string),
		enabled: !!workspaceId
	});

	const boardMembersQ = useQuery({
		queryKey: ['board-members', workspaceId, boardId],
		queryFn: () => listBoardMembers(workspaceId as string, boardId as string),
		enabled: !!workspaceId && !!boardId
	});

	const auditQ = useQuery({
		queryKey: ['audit-events', workspaceId, boardId],
		queryFn: () => listAuditEvents({ workspaceId: workspaceId ?? undefined, boardId: boardId ?? undefined, limit: 150 }),
		enabled: !!workspaceId
	});

	useEffect(() => {
		if (!workspaceId && workspacesQ.data?.length) {
			const next = new URLSearchParams(location.search);
			next.set('workspaceId', workspacesQ.data[0].id);
			next.delete('projectId');
			next.delete('sectionId');
			navigate(`/team-access?${next.toString()}`, { replace: true });
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
			navigate(`/team-access?${next.toString()}`, { replace: true });
		}
	}, [boardId, boardsQ.data, location.search, navigate, workspaceId]);

	const refreshMembers = async () => {
		await qc.invalidateQueries({ queryKey: ['workspace-members'] });
		await qc.invalidateQueries({ queryKey: ['board-members'] });
		await qc.invalidateQueries({ queryKey: ['audit-events'] });
	};

	const addWorkspaceMemberM = useMutation({
		mutationFn: async () => {
			if (!workspaceId) throw new Error('Workspace not selected');
			return addWorkspaceMember(workspaceId, { username: workspaceUsername.trim(), role: workspaceRole });
		},
		onSuccess: async () => {
			setWorkspaceUsername('');
			await refreshMembers();
		}
	});

	const updateWorkspaceMemberM = useMutation({
		mutationFn: async (input: { userId: string; role: MemberRole }) => {
			if (!workspaceId) throw new Error('Workspace not selected');
			return updateWorkspaceMember(workspaceId, input.userId, { role: input.role });
		},
		onSuccess: refreshMembers
	});

	const removeWorkspaceMemberM = useMutation({
		mutationFn: async (userId: string) => {
			if (!workspaceId) throw new Error('Workspace not selected');
			return removeWorkspaceMember(workspaceId, userId);
		},
		onSuccess: refreshMembers
	});

	const addBoardMemberM = useMutation({
		mutationFn: async () => {
			if (!workspaceId || !boardId) throw new Error('Workspace/board not selected');
			return addBoardMember(workspaceId, boardId, { username: boardUsername.trim(), role: boardRole });
		},
		onSuccess: async () => {
			setBoardUsername('');
			await refreshMembers();
		}
	});

	const createInviteM = useMutation({
		mutationFn: async () => {
			if (!workspaceId) throw new Error('Workspace not selected');
			return createWorkspaceInvite(workspaceId, {
				boardId: boardId ?? undefined,
				username: inviteUsername.trim() || null,
				email: inviteEmail.trim() || null,
				role: inviteRole,
				expiresInDays: Number.isFinite(Number(inviteDays)) ? Math.max(1, Math.floor(Number(inviteDays))) : 7
			});
		},
		onSuccess: async () => {
			setInviteUsername('');
			setInviteEmail('');
			await qc.invalidateQueries({ queryKey: ['audit-events'] });
		}
	});

	const commonError =
		(addWorkspaceMemberM.error as Error | null)?.message ??
		(updateWorkspaceMemberM.error as Error | null)?.message ??
		(removeWorkspaceMemberM.error as Error | null)?.message ??
		(addBoardMemberM.error as Error | null)?.message ??
		(createInviteM.error as Error | null)?.message ??
		null;

	const inviteResult = createInviteM.data;

	const workspaceMembers = useMemo(() => workspaceMembersQ.data ?? [], [workspaceMembersQ.data]);
	const boardMembers = useMemo(() => boardMembersQ.data ?? [], [boardMembersQ.data]);
	const auditEvents = useMemo(() => auditQ.data ?? [], [auditQ.data]);

	const content = (
		<div className="flex w-full flex-col gap-4 p-4 md:p-6">
			<Tabs
				value={tab}
				onChange={(_event, value) => setTab(value)}
			>
				<Tab
					value="workspace"
					label="Workspace Roles"
				/>
				<Tab
					value="board"
					label="Board Overrides"
				/>
				<Tab
					value="invites"
					label="Invites"
				/>
				<Tab
					value="audit"
					label="Audit"
				/>
			</Tabs>

			{tab === 'workspace' ? (
				<Paper className="rounded-xl p-4 shadow-sm">
					<Typography className="text-lg font-semibold">Workspace members</Typography>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1}
						className="mt-3"
					>
						<TextField
							size="small"
							label="Username"
							value={workspaceUsername}
							onChange={(event) => setWorkspaceUsername(event.target.value)}
							fullWidth
						/>
						<FormControl size="small" sx={{ minWidth: 170 }}>
							<InputLabel id="workspace-role-label">Role</InputLabel>
							<Select
								labelId="workspace-role-label"
								label="Role"
								value={workspaceRole}
								onChange={(event) => setWorkspaceRole(event.target.value as MemberRole)}
							>
								{ROLE_OPTIONS.map((role) => (
									<MenuItem
										key={role}
										value={role}
									>
										{role}
									</MenuItem>
								))}
							</Select>
						</FormControl>
						<Button
							variant="contained"
							startIcon={<FuseSvgIcon>lucide:user-plus</FuseSvgIcon>}
							disabled={!workspaceId || !workspaceUsername.trim() || addWorkspaceMemberM.isPending}
							onClick={() => addWorkspaceMemberM.mutate()}
						>
							Add member
						</Button>
					</Stack>
					<List className="mt-3 divide-y py-0">
						{workspaceMembers.map((member) => (
							<ListItem
								key={member.user_id}
								secondaryAction={
									<Stack
										direction="row"
										spacing={1}
									>
										<FormControl
											size="small"
											sx={{ minWidth: 150 }}
										>
											<Select
												value={member.role}
												onChange={(event) =>
													updateWorkspaceMemberM.mutate({
														userId: member.user_id,
														role: event.target.value as MemberRole
													})
												}
											>
												{ROLE_OPTIONS.map((role) => (
													<MenuItem
														key={role}
														value={role}
													>
														{role}
													</MenuItem>
												))}
											</Select>
										</FormControl>
										<Button
											color="error"
											variant="outlined"
											size="small"
											onClick={() => removeWorkspaceMemberM.mutate(member.user_id)}
										>
											Remove
										</Button>
									</Stack>
								}
							>
								<ListItemText
									primary={member.user?.display_name || member.user?.username || member.user_id}
									secondary={member.user?.email || member.user?.username || member.user_id}
								/>
							</ListItem>
						))}
						{workspaceMembers.length === 0 ? (
							<ListItem>
								<ListItemText primary="No workspace members found." />
							</ListItem>
						) : null}
					</List>
				</Paper>
			) : null}

			{tab === 'board' ? (
				<Paper className="rounded-xl p-4 shadow-sm">
					<Typography className="text-lg font-semibold">Board-level overrides</Typography>
					<Typography
						className="mt-1"
						color="text.secondary"
					>
						Only selected board: {boardId ?? 'n/a'}
					</Typography>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1}
						className="mt-3"
					>
						<TextField
							size="small"
							label="Username"
							value={boardUsername}
							onChange={(event) => setBoardUsername(event.target.value)}
							fullWidth
						/>
						<FormControl size="small" sx={{ minWidth: 170 }}>
							<InputLabel id="board-role-label">Role</InputLabel>
							<Select
								labelId="board-role-label"
								label="Role"
								value={boardRole}
								onChange={(event) => setBoardRole(event.target.value as MemberRole)}
							>
								{ROLE_OPTIONS.map((role) => (
									<MenuItem
										key={role}
										value={role}
									>
										{role}
									</MenuItem>
								))}
							</Select>
						</FormControl>
						<Button
							variant="contained"
							startIcon={<FuseSvgIcon>lucide:user-plus</FuseSvgIcon>}
							disabled={!workspaceId || !boardId || !boardUsername.trim() || addBoardMemberM.isPending}
							onClick={() => addBoardMemberM.mutate()}
						>
							Add override
						</Button>
					</Stack>
					<List className="mt-3 divide-y py-0">
						{boardMembers.map((member) => (
							<ListItem key={`${member.board_id}:${member.user_id}`}>
								<ListItemText
									primary={member.user?.display_name || member.user?.username || member.user_id}
									secondary={`${member.user?.email || member.user?.username || member.user_id} · ${member.role}`}
								/>
							</ListItem>
						))}
						{boardMembers.length === 0 ? (
							<ListItem>
								<ListItemText primary="No board overrides for selected board." />
							</ListItem>
						) : null}
					</List>
				</Paper>
			) : null}

			{tab === 'invites' ? (
				<Paper className="rounded-xl p-4 shadow-sm">
					<Typography className="text-lg font-semibold">Create invite</Typography>
					<Stack
						spacing={1.5}
						className="mt-3"
					>
						<TextField
							size="small"
							label="Username (optional)"
							value={inviteUsername}
							onChange={(event) => setInviteUsername(event.target.value)}
						/>
						<TextField
							size="small"
							label="Email (optional)"
							value={inviteEmail}
							onChange={(event) => setInviteEmail(event.target.value)}
						/>
						<FormControl size="small">
							<InputLabel id="invite-role-label">Role</InputLabel>
							<Select
								labelId="invite-role-label"
								label="Role"
								value={inviteRole}
								onChange={(event) => setInviteRole(event.target.value as MemberRole)}
							>
								{ROLE_OPTIONS.map((role) => (
									<MenuItem
										key={role}
										value={role}
									>
										{role}
									</MenuItem>
								))}
							</Select>
						</FormControl>
						<TextField
							size="small"
							label="Expires in days"
							value={inviteDays}
							onChange={(event) => setInviteDays(event.target.value)}
						/>
						<Button
							variant="contained"
							startIcon={<FuseSvgIcon>lucide:mail-plus</FuseSvgIcon>}
							onClick={() => createInviteM.mutate()}
							disabled={!workspaceId || (!inviteUsername.trim() && !inviteEmail.trim()) || createInviteM.isPending}
						>
							Create invite
						</Button>
						{inviteResult?.invite_url ? (
							<Alert severity="success">
								Invite created: <code>{inviteResult.invite_url}</code>
							</Alert>
						) : null}
					</Stack>
				</Paper>
			) : null}

			{tab === 'audit' ? (
				<Paper className="rounded-xl p-4 shadow-sm">
					<Typography className="text-lg font-semibold">Audit events</Typography>
					<List className="mt-3 divide-y py-0">
						{auditEvents.map((event) => (
							<ListItem key={event.id}>
								<ListItemText
									primary={`${event.event_type} · ${event.actor_username ?? event.actor_user_id ?? 'system'}`}
									secondary={new Date(event.created_at).toLocaleString()}
								/>
							</ListItem>
						))}
						{auditEvents.length === 0 ? (
							<ListItem>
								<ListItemText primary="No audit events yet." />
							</ListItem>
						) : null}
					</List>
				</Paper>
			) : null}

			{workspacesQ.isError || boardsQ.isError || workspaceMembersQ.isError || boardMembersQ.isError || auditQ.isError ? (
				<Alert severity="error">
					{String(workspacesQ.error ?? boardsQ.error ?? workspaceMembersQ.error ?? boardMembersQ.error ?? auditQ.error)}
				</Alert>
			) : null}

			{commonError ? <Alert severity="error">{commonError}</Alert> : null}
		</div>
	);

	return (
		<Root
			header={
				<TeamAccessHeader
					workspaceId={workspaceId}
					boardId={boardId}
					workspaces={(workspacesQ.data ?? []).map((workspace) => ({ id: workspace.id, name: workspace.name }))}
					boards={(boardsQ.data ?? []).map((board) => ({ id: board.id, name: board.name }))}
					onSelectWorkspace={(id) => {
						const next = new URLSearchParams(location.search);
						next.set('workspaceId', id);
						next.delete('projectId');
						next.delete('boardId');
						next.delete('sectionId');
						navigate(`/team-access?${next.toString()}`);
					}}
					onSelectBoard={(id) => {
						const next = new URLSearchParams(location.search);
						next.set('workspaceId', workspaceId ?? '');
						next.set('boardId', id);
						next.delete('projectId');
						next.delete('sectionId');
						navigate(`/team-access?${next.toString()}`);
					}}
				/>
			}
			content={content}
			scroll={isMobile ? 'page' : 'content'}
		/>
	);
}
