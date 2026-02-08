import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
	Alert,
	Avatar,
	Box,
	Button,
	Chip,
	Input,
	List,
	ListItem,
	ListItemButton,
	ListItemText,
	Paper,
	Stack,
	Tab,
	Tabs,
	Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import useThemeMediaQuery from '@fuse/hooks/useThemeMediaQuery';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { getAutomation, listAutomations, runAutomation } from '@/api/queries';
import type { Automation } from '@/api/types';

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

const AUTOMATIONS_RUN_ENABLED = false;

function prettyGraph(graphJson: string | undefined): string {
	if (!graphJson) return 'Graph JSON is not available for this automation.';

	try {
		return JSON.stringify(JSON.parse(graphJson), null, 2);
	} catch {
		return graphJson;
	}
}

function AutomationsHeader({
	total,
	selectedName,
	searchText,
	onSearch,
	onRun,
	runDisabled,
	running
}: {
	total: number;
	selectedName: string;
	searchText: string;
	onSearch: (value: string) => void;
	onRun: () => void;
	runDisabled: boolean;
	running: boolean;
}) {
	return (
		<div className="container flex w-full border-b">
			<div className="flex flex-auto flex-col p-4 md:px-8">
				<PageBreadcrumb className="mb-2" />
				<div className="flex min-w-0 flex-auto flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<Typography className="truncate text-3xl leading-none font-bold tracking-tight md:text-4xl">
							Automations
						</Typography>
						<Typography
							className="text-md mt-1"
							color="text.secondary"
						>
							{`${total} workflows · ${selectedName || 'No selection'}`}
						</Typography>
					</div>
					<div className="flex flex-col gap-2 md:flex-row md:items-center">
						<Box className="flex h-10 min-w-56 items-center gap-2 rounded-lg border px-3">
							<FuseSvgIcon color="action">lucide:search</FuseSvgIcon>
							<Input
								placeholder="Search automations"
								className="flex-1"
								disableUnderline
								value={searchText}
								onChange={(event) => onSearch(event.target.value)}
								slotProps={{ input: { 'aria-label': 'Search automations' } }}
							/>
						</Box>
						<Button
							variant="contained"
							startIcon={<FuseSvgIcon>lucide:play</FuseSvgIcon>}
							disabled={runDisabled || running}
							onClick={onRun}
						>
							{running ? 'Starting...' : 'Run now'}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function AutomationSidebarContent({
	automation,
	graphJson,
	tabValue,
	onTabChange,
	onRun,
	runDisabled,
	running,
	lastRunId,
	loading
}: {
	automation: Automation | null;
	graphJson?: string;
	tabValue: 'details' | 'graph';
	onTabChange: (value: 'details' | 'graph') => void;
	onRun: () => void;
	runDisabled: boolean;
	running: boolean;
	lastRunId: string | null;
	loading: boolean;
}) {
	if (!automation) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<Typography color="text.secondary">Select an automation to view details.</Typography>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="border-b p-4">
				<Stack
					direction="row"
					spacing={1.5}
					alignItems="center"
				>
					<Avatar>
						<FuseSvgIcon size={18}>lucide:workflow</FuseSvgIcon>
					</Avatar>
					<div className="min-w-0">
						<Typography className="truncate text-lg font-semibold">{automation.name}</Typography>
						<Typography
							className="truncate text-xs"
							color="text.secondary"
						>
							ID: {automation.id}
						</Typography>
					</div>
				</Stack>
				<Typography
					className="mt-3 text-sm"
					color="text.secondary"
				>
					{automation.description || 'No description provided.'}
				</Typography>
				<Button
					className="mt-3"
					variant="contained"
					startIcon={<FuseSvgIcon>lucide:play</FuseSvgIcon>}
					onClick={onRun}
					disabled={runDisabled || running}
				>
					{running ? 'Starting...' : 'Run now'}
				</Button>
			</div>

			<Tabs
				value={tabValue}
				onChange={(_event, value: 'details' | 'graph') => onTabChange(value)}
			>
				<Tab
					value="details"
					label="Details"
				/>
				<Tab
					value="graph"
					label="Graph JSON"
				/>
			</Tabs>

			<div className="flex-1 overflow-auto p-4">
				{tabValue === 'details' ? (
					<Stack spacing={2}>
						<Paper className="rounded-xl p-4 shadow-sm">
							<Typography
								className="text-sm font-medium"
								color="text.secondary"
							>
								Timestamps
							</Typography>
							<Stack
								direction="row"
								spacing={1}
								className="mt-2"
								useFlexGap
								flexWrap="wrap"
							>
								<Chip
									size="small"
									label={`Created: ${new Date(automation.created_at).toLocaleString()}`}
								/>
								<Chip
									size="small"
									label={`Updated: ${new Date(automation.updated_at).toLocaleString()}`}
								/>
							</Stack>
						</Paper>
						<Paper className="rounded-xl p-4 shadow-sm">
							<Typography
								className="text-sm font-medium"
								color="text.secondary"
							>
								Graph payload
							</Typography>
							<Typography
								className="mt-2 text-sm"
								color="text.secondary"
							>
								{loading
									? 'Loading graph schema...'
									: `${prettyGraph(graphJson).length.toLocaleString()} characters`}
							</Typography>
						</Paper>
					</Stack>
				) : (
					<Box
						sx={{
							minHeight: 520,
							p: 2,
							borderRadius: 1,
							border: (theme) => `1px solid ${theme.vars.palette.divider}`,
							whiteSpace: 'pre-wrap',
							overflow: 'auto',
							fontFamily: 'monospace',
							fontSize: 12
						}}
					>
						{loading ? 'Loading graph schema...' : prettyGraph(graphJson)}
					</Box>
				)}

				{lastRunId ? (
					<Alert
						severity="success"
						sx={{ mt: 2 }}
					>
						Automation run started: {lastRunId}
					</Alert>
				) : null}
			</div>
		</div>
	);
}

export default function AutomationsView() {
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [lastRunId, setLastRunId] = useState<string | null>(null);
	const [tabValue, setTabValue] = useState<'details' | 'graph'>('details');
	const [searchText, setSearchText] = useState('');
	const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

	const listQ = useQuery({
		queryKey: ['automations', 'page'],
		queryFn: listAutomations
	});

	const automations = useMemo(() => {
		const q = searchText.trim().toLowerCase();
		return [...(listQ.data ?? [])]
			.filter((automation) => {
				if (!q) return true;

				return (
					automation.name.toLowerCase().includes(q) ||
					(automation.description ?? '').toLowerCase().includes(q)
				);
			})
			.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
	}, [listQ.data, searchText]);

	useEffect(() => {
		if (!automations.length) {
			setSelectedId(null);
			return;
		}

		if (!selectedId || !automations.some((automation) => automation.id === selectedId)) {
			setSelectedId(automations[0].id);
		}
	}, [automations, selectedId]);

	useEffect(() => {
		setRightSidebarOpen(!isMobile && Boolean(selectedId));
	}, [isMobile, selectedId]);

	const selectedQ = useQuery({
		queryKey: ['automation', selectedId, 'page'],
		queryFn: () => {
			if (!selectedId) return Promise.resolve(null);

			return getAutomation(selectedId);
		},
		enabled: !!selectedId
	});

	const runM = useMutation({
		mutationFn: async (id: string) => runAutomation(id),
		onSuccess: (result) => {
			setLastRunId(result.runId);
		}
	});

	const selectedAutomation = useMemo(
		() => automations.find((automation) => automation.id === selectedId) ?? null,
		[automations, selectedId]
	);
	const runDisabled = !AUTOMATIONS_RUN_ENABLED || !selectedId;

	const content = (
		<div className="flex w-full flex-col p-4 md:p-6">
			<Paper className="overflow-hidden rounded-xl shadow-sm">
				<List className="divide-y py-0">
					{listQ.isLoading ? (
						<ListItem>
							<ListItemText primary="Loading automations..." />
						</ListItem>
					) : null}
					{!listQ.isLoading && automations.length === 0 ? (
						<ListItem>
							<ListItemText
								primary="No automations found"
								secondary="Try a different search query."
							/>
						</ListItem>
					) : null}
					{automations.map((automation) => (
						<ListItemButton
							key={automation.id}
							selected={automation.id === selectedId}
							onClick={() => {
								setSelectedId(automation.id);
								setLastRunId(null);
								setRightSidebarOpen(true);
							}}
						>
							<ListItemText
								primary={automation.name}
								secondary={
									automation.description
										? `${automation.description} · Updated ${new Date(automation.updated_at).toLocaleString()}`
										: `Updated ${new Date(automation.updated_at).toLocaleString()}`
								}
							/>
						</ListItemButton>
					))}
				</List>
			</Paper>
			{listQ.isError || selectedQ.isError || runM.isError ? (
				<Alert
					severity="error"
					sx={{ mt: 2 }}
				>
					{String(listQ.error ?? selectedQ.error ?? runM.error)}
				</Alert>
			) : null}
		</div>
	);

	return (
		<Root
			header={
				<AutomationsHeader
					total={listQ.data?.length ?? 0}
					selectedName={selectedAutomation?.name ?? ''}
					searchText={searchText}
					onSearch={setSearchText}
					onRun={() => {
						if (!AUTOMATIONS_RUN_ENABLED || !selectedId) return;

						runM.mutate(selectedId);
					}}
					runDisabled={runDisabled}
					running={runM.isPending}
				/>
			}
			content={content}
			rightSidebarProps={{
				content: (
					<AutomationSidebarContent
						automation={selectedAutomation}
						graphJson={selectedQ.data?.graph_json}
						tabValue={tabValue}
						onTabChange={setTabValue}
						onRun={() => {
							if (!AUTOMATIONS_RUN_ENABLED || !selectedId) return;

							runM.mutate(selectedId);
						}}
						runDisabled={runDisabled}
						running={runM.isPending}
						lastRunId={lastRunId}
						loading={selectedQ.isLoading}
					/>
				),
				open: rightSidebarOpen,
				onClose: () => setRightSidebarOpen(false),
				width: 460
			}}
			scroll={isMobile ? 'page' : 'content'}
		/>
	);
}
