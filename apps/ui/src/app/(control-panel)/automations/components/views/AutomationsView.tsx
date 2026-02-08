import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
	Alert,
	Avatar,
	Box,
	Button,
	Chip,
	Divider,
	List,
	ListItemButton,
	ListItemText,
	Paper,
	Stack,
	Tab,
	Tabs,
	Typography
} from '@mui/material';
import { darken, styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { getAutomation, listAutomations, runAutomation } from '@/api/queries';

const Root = styled(FusePageSimple)(() => ({
	'& .container': {
		maxWidth: '100%!important'
	}
}));

function prettyGraph(graphJson: string | undefined): string {
	if (!graphJson) return 'Graph JSON отсутствует для выбранной автоматизации.';
	try {
		return JSON.stringify(JSON.parse(graphJson), null, 2);
	} catch {
		return graphJson;
	}
}

function AutomationsHeader({
	selectedName,
	onRun,
	disabled,
	running,
	total
}: {
	selectedName: string;
	onRun: () => void;
	disabled: boolean;
	running: boolean;
	total: number;
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
							<FuseSvgIcon size={20}>lucide:workflow</FuseSvgIcon>
						</Avatar>
						<div className="min-w-0">
							<Typography className="truncate text-2xl leading-none font-bold tracking-tight md:text-3xl">Automations</Typography>
							<Typography className="text-md mt-1" color="text.secondary">
								{total} saved workflows · {selectedName || 'No selection'}
							</Typography>
						</div>
					</div>
					<Button variant="contained" startIcon={<FuseSvgIcon>lucide:play</FuseSvgIcon>} disabled={disabled || running} onClick={onRun}>
						{running ? 'Starting...' : 'Run now'}
					</Button>
				</div>
			</div>
		</div>
	);
}

export default function AutomationsView() {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [lastRunId, setLastRunId] = useState<string | null>(null);
	const [tabValue, setTabValue] = useState('details');

	const listQ = useQuery({
		queryKey: ['automations', 'page'],
		queryFn: listAutomations
	});

	useEffect(() => {
		if (!selectedId && listQ.data?.length) {
			setSelectedId(listQ.data[0].id);
		}
	}, [listQ.data, selectedId]);

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
		() => (listQ.data ?? []).find((automation) => automation.id === selectedId) ?? null,
		[listQ.data, selectedId]
	);

	const content = (
		<div className="w-full pt-4 sm:pt-6">
			<div className="flex w-full flex-col justify-between gap-2 px-4 sm:flex-row sm:items-center md:px-8">
				<Tabs value={tabValue} onChange={(_event, value: string) => setTabValue(value)}>
					<Tab value="details" label="Details" />
					<Tab value="graph" label="Graph JSON" />
				</Tabs>
			</div>

			<div className="grid w-full grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[320px,1fr] md:px-8">
				<Paper className="overflow-hidden rounded-xl shadow-sm">
					<Typography className="px-5 pt-5 text-lg font-semibold">Library</Typography>
					<Divider className="mt-4" />
					<List className="divide-y py-0">
						{(listQ.data ?? []).length === 0 ? (
							<ListItemText className="px-5 py-5" primary="No saved automations" />
						) : (
							(listQ.data ?? []).map((automation) => (
								<ListItemButton
									key={automation.id}
									selected={automation.id === selectedId}
									onClick={() => {
										setSelectedId(automation.id);
										setLastRunId(null);
									}}
								>
									<ListItemText
										primary={automation.name}
										secondary={`Updated ${new Date(automation.updated_at).toLocaleString()}`}
									/>
								</ListItemButton>
							))
						)}
					</List>
				</Paper>

				<Paper className="rounded-xl p-5 shadow-sm">
					{tabValue === 'details' ? (
						<>
							<Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
								<Typography className="text-xl font-semibold">{selectedAutomation?.name ?? 'Automation details'}</Typography>
								<Chip size="small" label={selectedAutomation ? `ID: ${selectedAutomation.id}` : 'No selection'} />
							</Stack>
							<Typography className="mt-2" color="text.secondary">
								{selectedAutomation?.description || 'Select an automation from the left list to inspect details.'}
							</Typography>

							<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} className="mt-4" useFlexGap flexWrap="wrap">
								<Chip size="small" label={`Created: ${selectedAutomation ? new Date(selectedAutomation.created_at).toLocaleString() : '-'}`} />
								<Chip size="small" label={`Updated: ${selectedAutomation ? new Date(selectedAutomation.updated_at).toLocaleString() : '-'}`} />
							</Stack>

							<Divider className="my-4" />
							<Typography className="text-sm font-medium" color="text.secondary">Automation payload</Typography>
							<Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, border: (theme) => `1px solid ${theme.vars.palette.divider}`, whiteSpace: 'pre-wrap', maxHeight: 420, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
								{prettyGraph(selectedQ.data?.graph_json)}
							</Box>
						</>
					) : (
						<>
							<Typography className="text-xl font-semibold">Graph JSON</Typography>
							<Typography className="mt-1" color="text.secondary">Raw graph schema for the selected automation.</Typography>
							<Box sx={{ mt: 2, minHeight: 520, p: 2, borderRadius: 1, border: (theme) => `1px solid ${theme.vars.palette.divider}`, whiteSpace: 'pre-wrap', overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
								{prettyGraph(selectedQ.data?.graph_json)}
							</Box>
						</>
					)}
				</Paper>
			</div>

			{lastRunId ? (
				<Alert severity="success" sx={{ mx: { xs: 2, md: 4 }, mb: 2 }}>
					Automation run started: {lastRunId}
				</Alert>
			) : null}
			{listQ.isError || selectedQ.isError || runM.isError ? (
				<Alert severity="error" sx={{ mx: { xs: 2, md: 4 }, mb: 2 }}>
					{String(listQ.error ?? selectedQ.error ?? runM.error)}
				</Alert>
			) : null}
		</div>
	);

	return (
		<Root
			header={
				<AutomationsHeader
					selectedName={selectedAutomation?.name ?? ''}
					onRun={() => selectedId && runM.mutate(selectedId)}
					disabled={!selectedId}
					running={runM.isPending}
					total={listQ.data?.length ?? 0}
				/>
			}
			content={content}
			scroll="content"
		/>
	);
}
