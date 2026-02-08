import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Box,
	Card,
	CardContent,
	CardHeader,
	Chip,
	Divider,
	Grid,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { listAgents } from '@/api/queries';

const Root = styled(FusePageSimple)(({ theme }) => ({
	'& .FusePageSimple-header': {
		borderBottom: `1px solid ${theme.vars.palette.divider}`,
		background: theme.vars.palette.background.paper
	},
	'& .FusePageSimple-content': {
		background: theme.vars.palette.background.default
	}
}));

export default function AgentsView() {
	const agentsQ = useQuery({
		queryKey: ['agents', 'agents-page'],
		queryFn: () => listAgents()
	});

	const agents = useMemo(
		() => [...(agentsQ.data ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.run_count_7d - a.run_count_7d),
		[agentsQ.data]
	);

	const enabledCount = agents.filter((agent) => agent.enabled).length;
	const disabledCount = agents.length - enabledCount;
	const totalRuns7d = agents.reduce((sum, agent) => sum + (agent.run_count_7d ?? 0), 0);

	const header = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2 }}>
			<Typography variant="overline" color="text.secondary">
				Fuse Workspace
			</Typography>
			<Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
				Agents
			</Typography>
			<Typography variant="body2" color="text.secondary">
				Профили агентов и их текущая операционная активность.
			</Typography>
		</Box>
	);

	const content = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2.5 }}>
			<Grid container spacing={2}>
				<Grid size={{ xs: 6, md: 3 }}>
					<Card variant="outlined">
						<CardContent sx={{ py: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								All Agents
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
								{agents.length}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid size={{ xs: 6, md: 3 }}>
					<Card variant="outlined">
						<CardContent sx={{ py: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								Enabled
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
								{enabledCount}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid size={{ xs: 6, md: 3 }}>
					<Card variant="outlined">
						<CardContent sx={{ py: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								Disabled
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
								{disabledCount}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
				<Grid size={{ xs: 6, md: 3 }}>
					<Card variant="outlined">
						<CardContent sx={{ py: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								Runs (7d)
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
								{totalRuns7d}
							</Typography>
						</CardContent>
					</Card>
				</Grid>
			</Grid>

			<Card variant="outlined" sx={{ mt: 2 }}>
				<CardHeader title="Agents Catalog" subheader="Список профилей, навыков и активности" />
				<Divider />
				<TableContainer component={Paper} square elevation={0}>
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell>Name</TableCell>
								<TableCell>Status</TableCell>
								<TableCell>OpenClaw ID</TableCell>
								<TableCell>Skills</TableCell>
								<TableCell align="right">Assigned</TableCell>
								<TableCell align="right">Runs 7d</TableCell>
								<TableCell>Last used</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{agents.length === 0 ? (
								<TableRow>
									<TableCell colSpan={7}>
										<Typography variant="body2" color="text.secondary">
											Агенты не найдены.
										</Typography>
									</TableCell>
								</TableRow>
							) : (
								agents.map((agent) => (
									<TableRow key={agent.id} hover>
										<TableCell>
											<Stack direction="row" spacing={1} alignItems="center">
												<Typography variant="body2" sx={{ fontWeight: 600 }}>
													{agent.display_name}
												</Typography>
												{agent.emoji ? <Typography variant="body2">{agent.emoji}</Typography> : null}
											</Stack>
										</TableCell>
										<TableCell>
											<Chip size="small" color={agent.enabled ? 'success' : 'default'} label={agent.enabled ? 'Enabled' : 'Disabled'} />
										</TableCell>
										<TableCell>
											<Typography variant="body2" color="text.secondary">
												{agent.openclaw_agent_id}
											</Typography>
										</TableCell>
										<TableCell>
											<Typography variant="body2" color="text.secondary" noWrap>
												{agent.skills.length ? agent.skills.join(', ') : 'No skills'}
											</Typography>
										</TableCell>
										<TableCell align="right">{agent.assigned_task_count ?? 0}</TableCell>
										<TableCell align="right">{agent.run_count_7d ?? 0}</TableCell>
										<TableCell>
											<Typography variant="body2" color="text.secondary">
												{agent.last_used_at ? new Date(agent.last_used_at).toLocaleString() : 'Never'}
											</Typography>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</TableContainer>
			</Card>
		</Box>
	);

	return <Root header={header} content={content} scroll="content" />;
}
