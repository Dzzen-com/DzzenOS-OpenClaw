import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Avatar,
	Box,
	Chip,
	Divider,
	List,
	ListItem,
	ListItemAvatar,
	ListItemText,
	OutlinedInput,
	Paper,
	Stack,
	Tab,
	Tabs,
	Typography
} from '@mui/material';
import { darken, styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { motion } from 'motion/react';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { listAgents } from '@/api/queries';

const Root = styled(FusePageSimple)(() => ({
	'& .container': {
		maxWidth: '100%!important'
	}
}));

function AgentsHeader({ onSearch, searchText, total }: { onSearch: (value: string) => void; searchText: string; total: number }) {
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
							<FuseSvgIcon size={20}>lucide:bot</FuseSvgIcon>
						</Avatar>
						<div className="min-w-0">
							<Typography className="truncate text-2xl leading-none font-bold tracking-tight md:text-3xl">Agents</Typography>
							<Typography className="text-md mt-1" color="text.secondary">{total} profiles across your workspace</Typography>
						</div>
					</div>

					<OutlinedInput
						size="small"
						placeholder="Search agents"
						value={searchText}
						onChange={(event) => onSearch(event.target.value)}
						slotProps={{ input: { 'aria-label': 'Search agents' } }}
						sx={{ minWidth: { xs: '100%', md: 280 } }}
					/>
				</div>
			</div>
		</div>
	);
}

function MiniStat({ title, value, icon, tone }: { title: string; value: number; icon: string; tone: string }) {
	return (
		<Paper className="flex flex-auto flex-col overflow-hidden rounded-xl p-4 shadow-sm">
			<Stack direction="row" alignItems="center" justifyContent="space-between">
				<Typography className="text-md" color="text.secondary">{title}</Typography>
				<Chip size="small" color={tone as any} icon={<FuseSvgIcon size={14}>{icon}</FuseSvgIcon>} label={value} />
			</Stack>
			<Typography className="mt-3 text-3xl leading-none font-semibold tracking-tight">{value}</Typography>
		</Paper>
	);
}

export default function AgentsView() {
	const [tabValue, setTabValue] = useState('registry');
	const [searchText, setSearchText] = useState('');

	const agentsQ = useQuery({
		queryKey: ['agents', 'agents-page'],
		queryFn: () => listAgents()
	});

	const allAgents = agentsQ.data ?? [];
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

	const enabledCount = agents.filter((agent) => agent.enabled).length;
	const disabledCount = Math.max(agents.length - enabledCount, 0);
	const totalRuns7d = agents.reduce((sum, agent) => sum + (agent.run_count_7d ?? 0), 0);
	const assignedTotal = agents.reduce((sum, agent) => sum + (agent.assigned_task_count ?? 0), 0);

	const mostLoaded = useMemo(() => [...agents].sort((a, b) => b.run_count_7d - a.run_count_7d).slice(0, 8), [agents]);
	const recentlyUsed = useMemo(
		() => [...agents].filter((a) => a.last_used_at).sort((a, b) => Date.parse(b.last_used_at ?? '') - Date.parse(a.last_used_at ?? '')).slice(0, 10),
		[agents]
	);

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
					<Tab value="registry" label="Registry" />
					<Tab value="load" label="Load" />
					<Tab value="activity" label="Activity" />
				</Tabs>
			</div>

			<motion.div
				className="grid w-full min-w-0 grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 md:grid-cols-4 md:px-8"
				variants={container}
				initial="hidden"
				animate="show"
			>
				<motion.div variants={item}><MiniStat title="All Agents" value={agents.length} icon="lucide:bot" tone="default" /></motion.div>
				<motion.div variants={item}><MiniStat title="Enabled" value={enabledCount} icon="lucide:shield-check" tone="success" /></motion.div>
				<motion.div variants={item}><MiniStat title="Runs 7d" value={totalRuns7d} icon="lucide:activity" tone="info" /></motion.div>
				<motion.div variants={item}><MiniStat title="Assigned Tasks" value={assignedTotal} icon="lucide:list-checks" tone="warning" /></motion.div>
			</motion.div>

			{tabValue === 'registry' && (
				<Paper className="mx-4 overflow-hidden rounded-xl shadow-sm md:mx-8">
					<List className="divide-y py-0">
						{agents.length === 0 ? (
							<ListItem><ListItemText primary="No agents found" /></ListItem>
						) : (
							agents.map((agent) => (
								<ListItem key={agent.id} className="px-4 py-3" secondaryAction={<Chip size="small" color={agent.enabled ? 'success' : 'default'} label={agent.enabled ? 'Enabled' : 'Disabled'} />}>
									<ListItemAvatar>
										<Avatar>{agent.emoji || agent.display_name[0]}</Avatar>
									</ListItemAvatar>
									<ListItemText
										primary={agent.display_name}
										secondary={`OpenClaw: ${agent.openclaw_agent_id} · Skills: ${agent.skills.length ? agent.skills.join(', ') : 'none'}`}
									/>
								</ListItem>
							))
						)}
					</List>
				</Paper>
			)}

			{tabValue === 'load' && (
				<div className="grid grid-cols-1 gap-4 px-4 pb-4 md:grid-cols-2 md:px-8">
					{mostLoaded.map((agent) => (
						<Paper key={agent.id} className="rounded-xl p-5 shadow-sm">
							<Stack direction="row" alignItems="center" justifyContent="space-between">
								<Typography className="text-lg font-semibold">{agent.display_name}</Typography>
								<Chip size="small" label={`${agent.run_count_7d} runs`} color="info" />
							</Stack>
							<Typography className="mt-2 text-sm" color="text.secondary">Assigned tasks: {agent.assigned_task_count ?? 0}</Typography>
							<Box className="mt-3">
								<Typography className="text-sm" color="text.secondary">Load indicator</Typography>
								<div className="mt-1 h-2 w-full rounded-full bg-black/10">
									<div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, (agent.run_count_7d / Math.max(totalRuns7d, 1)) * 240)}%` }} />
								</div>
							</Box>
						</Paper>
					))}
					{mostLoaded.length === 0 ? <Paper className="rounded-xl p-5 shadow-sm md:col-span-2"><Typography color="text.secondary">No data</Typography></Paper> : null}
				</div>
			)}

			{tabValue === 'activity' && (
				<Paper className="mx-4 overflow-hidden rounded-xl shadow-sm md:mx-8">
					<Typography className="px-5 pt-5 text-lg font-semibold">Recent Activity</Typography>
					<Divider className="mt-4" />
					<List className="divide-y py-0">
						{recentlyUsed.length === 0 ? (
							<ListItem><ListItemText primary="No recent activity" /></ListItem>
						) : (
							recentlyUsed.map((agent) => (
								<ListItem key={agent.id} className="px-4 py-3">
									<ListItemAvatar>
										<Avatar>{agent.emoji || agent.display_name[0]}</Avatar>
									</ListItemAvatar>
									<ListItemText
										primary={agent.display_name}
										secondary={agent.last_used_at ? new Date(agent.last_used_at).toLocaleString() : 'Never'}
									/>
									<Chip size="small" color="info" label={`${agent.run_count_7d} runs / 7d`} />
								</ListItem>
							))
						)}
					</List>
				</Paper>
			)}

			{disabledCount > 0 ? (
				<Typography className="px-4 py-4 md:px-8" color="text.secondary">
					{disabledCount} agents are currently disabled.
				</Typography>
			) : null}
		</div>
	);

	return <Root header={<AgentsHeader onSearch={setSearchText} searchText={searchText} total={allAgents.length} />} content={content} scroll="content" />;
}
