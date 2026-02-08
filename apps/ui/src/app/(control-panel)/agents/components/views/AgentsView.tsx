import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Avatar,
	Box,
	Chip,
	Input,
	List,
	ListItemAvatar,
	ListItemButton,
	ListItem,
	ListItemText,
	Paper,
	Stack,
	Alert,
	Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { motion } from 'motion/react';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import useThemeMediaQuery from '@fuse/hooks/useThemeMediaQuery';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { listAgents } from '@/api/queries';
import type { Agent } from '@/api/types';

const Root = styled(FusePageSimple)(({ theme }) => ({
	'& .container': {
		maxWidth: '100%!important'
	},
	'& .FusePageSimple-contentWrapper': {
		paddingTop: 2
	},
	'& .FusePageSimple-content': {
		boxShadow: theme.vars.shadows[2]
	},
	'& .FusePageSimple-sidebarContent': {
		backgroundColor: theme.vars.palette.background.paper
	}
}));

function AgentsHeader({
	searchText,
	onSearch,
	total,
	enabled,
	runs7d
}: {
	searchText: string;
	onSearch: (value: string) => void;
	total: number;
	enabled: number;
	runs7d: number;
}) {
	return (
		<div className="container flex w-full border-b">
			<div className="flex flex-auto flex-col p-4 md:px-8">
				<PageBreadcrumb className="mb-2" />
				<div className="flex min-w-0 flex-auto flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<motion.span
							initial={{ x: -20 }}
							animate={{ x: 0, transition: { delay: 0.2 } }}
						>
							<Typography className="truncate text-3xl leading-none font-bold tracking-tight md:text-4xl">
								Agents
							</Typography>
						</motion.span>
						<motion.span
							initial={{ y: -20, opacity: 0 }}
							animate={{ y: 0, opacity: 1, transition: { delay: 0.2 } }}
						>
							<Typography
								className="text-md mt-1"
								color="text.secondary"
							>
								{`${total} agents · ${enabled} enabled · ${runs7d} runs / 7d`}
							</Typography>
						</motion.span>
					</div>
					<Box className="flex h-10 min-w-56 items-center gap-2 rounded-lg border px-3">
						<FuseSvgIcon color="action">lucide:search</FuseSvgIcon>
						<Input
							placeholder="Search agents"
							className="flex-1"
							disableUnderline
							value={searchText}
							onChange={(event) => onSearch(event.target.value)}
							slotProps={{ input: { 'aria-label': 'Search agents' } }}
						/>
					</Box>
				</div>
			</div>
		</div>
	);
}

function AgentSidebarContent({ agent, maxRuns7d }: { agent: Agent | null; maxRuns7d: number }) {
	if (!agent) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<Typography color="text.secondary">Select an agent to view details.</Typography>
			</div>
		);
	}

	const loadPct = Math.round(((agent.run_count_7d ?? 0) / Math.max(maxRuns7d, 1)) * 100);

	return (
		<div className="flex h-full flex-col gap-3 p-4">
			<Paper className="rounded-xl p-4 shadow-sm">
				<Stack
					direction="row"
					spacing={1.5}
					alignItems="center"
				>
					<Avatar className="h-12 w-12">{agent.emoji || agent.display_name[0]}</Avatar>
					<div className="min-w-0">
						<Typography className="truncate text-lg font-semibold">{agent.display_name}</Typography>
						<Typography
							className="truncate text-sm"
							color="text.secondary"
						>
							{agent.openclaw_agent_id}
						</Typography>
					</div>
				</Stack>
				<Stack
					direction="row"
					spacing={1}
					className="mt-3"
					useFlexGap
					flexWrap="wrap"
				>
					<Chip
						size="small"
						color={agent.enabled ? 'success' : 'default'}
						label={agent.enabled ? 'Enabled' : 'Disabled'}
					/>
					<Chip
						size="small"
						label={agent.category || 'general'}
					/>
					{agent.model ? (
						<Chip
							size="small"
							label={agent.model}
						/>
					) : null}
				</Stack>
			</Paper>

			<Paper className="rounded-xl p-4 shadow-sm">
				<Typography
					className="text-sm font-medium"
					color="text.secondary"
				>
					Load
				</Typography>
				<Typography className="mt-2 text-2xl leading-none font-semibold">
					{agent.run_count_7d} runs / 7d
				</Typography>
				<Typography
					className="mt-1 text-sm"
					color="text.secondary"
				>
					Assigned tasks: {agent.assigned_task_count ?? 0}
				</Typography>
				<Box className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/10">
					<Box
						className="h-full rounded-full bg-blue-500"
						sx={{ width: `${Math.min(loadPct, 100)}%` }}
					/>
				</Box>
			</Paper>

			<Paper className="rounded-xl p-4 shadow-sm">
				<Typography
					className="text-sm font-medium"
					color="text.secondary"
				>
					Skills
				</Typography>
				<Stack
					direction="row"
					spacing={1}
					className="mt-2"
					useFlexGap
					flexWrap="wrap"
				>
					{agent.skills.length ? (
						agent.skills.map((skill) => (
							<Chip
								size="small"
								key={skill}
								label={skill}
							/>
						))
					) : (
						<Chip
							size="small"
							label="No skills"
						/>
					)}
				</Stack>
			</Paper>

			<Paper className="rounded-xl p-4 shadow-sm">
				<Typography
					className="text-sm font-medium"
					color="text.secondary"
				>
					Notes
				</Typography>
				<Typography
					className="mt-2 text-sm"
					sx={{ whiteSpace: 'pre-wrap' }}
				>
					{agent.description || agent.role || 'No description provided.'}
				</Typography>
				<Typography
					className="mt-3 text-xs"
					color="text.secondary"
				>
					Last active: {agent.last_used_at ? new Date(agent.last_used_at).toLocaleString() : 'Never'}
				</Typography>
			</Paper>
		</div>
	);
}

export default function AgentsView() {
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));
	const [searchText, setSearchText] = useState('');
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

	const agentsQ = useQuery({
		queryKey: ['agents', 'agents-page'],
		queryFn: () => listAgents()
	});

	const allAgents = useMemo(() => agentsQ.data ?? [], [agentsQ.data]);
	const agents = useMemo(() => {
		const q = searchText.trim().toLowerCase();
		return [...allAgents]
			.filter((agent) => {
				if (!q) return true;

				return (
					agent.display_name.toLowerCase().includes(q) ||
					agent.openclaw_agent_id.toLowerCase().includes(q) ||
					agent.skills.join(' ').toLowerCase().includes(q)
				);
			})
			.sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.run_count_7d - a.run_count_7d);
	}, [allAgents, searchText]);

	useEffect(() => {
		if (!agents.length) {
			setSelectedId(null);
			return;
		}

		if (!selectedId || !agents.some((agent) => agent.id === selectedId)) {
			setSelectedId(agents[0].id);
		}
	}, [agents, selectedId]);

	useEffect(() => {
		setRightSidebarOpen(!isMobile && Boolean(selectedId));
	}, [isMobile, selectedId]);

	const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedId) ?? null, [agents, selectedId]);
	const enabledCount = allAgents.filter((agent) => agent.enabled).length;
	const totalRuns7d = allAgents.reduce((sum, agent) => sum + (agent.run_count_7d ?? 0), 0);
	const maxRuns7d = allAgents.reduce((max, agent) => Math.max(max, agent.run_count_7d ?? 0), 1);

	const content = (
		<div className="flex w-full flex-col p-4 md:p-6">
			<Paper className="overflow-hidden rounded-xl shadow-sm">
				<List className="divide-y py-0">
					{agentsQ.isLoading ? (
						<ListItem>
							<ListItemText primary="Loading agents..." />
						</ListItem>
					) : null}
					{!agentsQ.isLoading && agents.length === 0 ? (
						<ListItem>
							<ListItemText
								primary="No agents found"
								secondary="Try a different search query."
							/>
						</ListItem>
					) : null}
					{agents.map((agent) => (
						<ListItemButton
							key={agent.id}
							selected={agent.id === selectedId}
							onClick={() => {
								setSelectedId(agent.id);
								setRightSidebarOpen(true);
							}}
							className="gap-3 px-4 py-3"
						>
							<ListItemAvatar>
								<Avatar>{agent.emoji || agent.display_name[0]}</Avatar>
							</ListItemAvatar>
							<ListItemText
								primary={
									<Stack
										direction="row"
										spacing={1}
										alignItems="center"
										useFlexGap
										flexWrap="wrap"
									>
										<Typography className="font-semibold">{agent.display_name}</Typography>
										<Chip
											size="small"
											color={agent.enabled ? 'success' : 'default'}
											label={agent.enabled ? 'Enabled' : 'Disabled'}
										/>
									</Stack>
								}
								secondary={`OpenClaw: ${agent.openclaw_agent_id} · Skills: ${agent.skills.length ? agent.skills.join(', ') : 'none'}`}
							/>
							<Stack
								alignItems="flex-end"
								spacing={0.5}
							>
								<Typography className="text-sm font-medium">{agent.run_count_7d} runs</Typography>
								<Typography
									className="text-xs"
									color="text.secondary"
								>
									{agent.assigned_task_count ?? 0} tasks
								</Typography>
							</Stack>
						</ListItemButton>
					))}
				</List>
			</Paper>
			{agentsQ.isError ? (
				<Alert
					severity="error"
					sx={{ mt: 2 }}
				>
					{String(agentsQ.error)}
				</Alert>
			) : null}
		</div>
	);

	return (
		<Root
			header={
				<AgentsHeader
					searchText={searchText}
					onSearch={setSearchText}
					total={allAgents.length}
					enabled={enabledCount}
					runs7d={totalRuns7d}
				/>
			}
			content={content}
			rightSidebarProps={{
				content: (
					<AgentSidebarContent
						agent={selectedAgent}
						maxRuns7d={maxRuns7d}
					/>
				),
				open: rightSidebarOpen,
				onClose: () => setRightSidebarOpen(false),
				width: 420
			}}
			scroll={isMobile ? 'page' : 'content'}
		/>
	);
}
