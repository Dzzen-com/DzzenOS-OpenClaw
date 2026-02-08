import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	CardHeader,
	Chip,
	Divider,
	List,
	ListItemButton,
	ListItemText,
	Stack,
	Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { getAutomation, listAutomations, runAutomation } from '@/api/queries';

const Root = styled(FusePageSimple)(({ theme }) => ({
	'& .FusePageSimple-header': {
		borderBottom: `1px solid ${theme.vars.palette.divider}`,
		background: theme.vars.palette.background.paper
	},
	'& .FusePageSimple-content': {
		background: theme.vars.palette.background.default
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

export default function AutomationsView() {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [lastRunId, setLastRunId] = useState<string | null>(null);

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

	const header = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2 }}>
			<Typography variant="overline" color="text.secondary">
				Fuse Workspace
			</Typography>
			<Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
				Automations
			</Typography>
			<Typography variant="body2" color="text.secondary">
				Библиотека автоматизаций и ручной запуск execution-цепочек.
			</Typography>
		</Box>
	);

	const content = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2.5 }}>
			<Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
				<Card variant="outlined" sx={{ width: { xs: '100%', lg: 360 }, flexShrink: 0 }}>
					<CardHeader
						title="Automations"
						subheader={`${listQ.data?.length ?? 0} total`}
						action={<Chip size="small" label={selectedAutomation ? `Selected: ${selectedAutomation.name}` : 'No selection'} />}
					/>
					<Divider />
					<List dense sx={{ maxHeight: { lg: 'calc(100vh - 18rem)' }, overflowY: 'auto' }}>
						{(listQ.data ?? []).length === 0 ? (
							<ListItemText sx={{ px: 2, py: 2 }} primary="Сохраненных автоматизаций пока нет" />
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
				</Card>

				<Card variant="outlined" sx={{ flex: 1, minHeight: 420 }}>
					<CardHeader
						title={selectedAutomation?.name ?? 'Automation details'}
						subheader={selectedAutomation?.description ?? 'Выберите автоматизацию слева'}
						action={
							<Button
								variant="contained"
								disabled={!selectedId || runM.isPending}
								onClick={() => {
									if (!selectedId) return;
									runM.mutate(selectedId);
								}}
							>
								{runM.isPending ? 'Запуск...' : 'Run now'}
							</Button>
						}
					/>
					<Divider />
					<CardContent sx={{ display: 'grid', gap: 2 }}>
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
							<Chip size="small" label={`ID: ${selectedAutomation?.id ?? '-'}`} />
							<Chip
								size="small"
								label={`Created: ${selectedAutomation ? new Date(selectedAutomation.created_at).toLocaleString() : '-'}`}
							/>
							<Chip
								size="small"
								label={`Updated: ${selectedAutomation ? new Date(selectedAutomation.updated_at).toLocaleString() : '-'}`}
							/>
						</Stack>

						<Box
							sx={{
								minHeight: 280,
								borderRadius: 1,
								border: (theme) => `1px solid ${theme.vars.palette.divider}`,
								p: 1.5,
								overflow: 'auto',
								fontFamily: 'monospace',
								fontSize: 12,
								whiteSpace: 'pre-wrap'
							}}
						>
							{prettyGraph(selectedQ.data?.graph_json)}
						</Box>
					</CardContent>
				</Card>
			</Stack>

			{lastRunId ? (
				<Alert severity="success" sx={{ mt: 2 }}>
					Automation run started: {lastRunId}
				</Alert>
			) : null}
			{listQ.isError || selectedQ.isError || runM.isError ? (
				<Alert severity="error" sx={{ mt: 2 }}>
					{String(listQ.error ?? selectedQ.error ?? runM.error)}
				</Alert>
			) : null}
		</Box>
	);

	return <Root header={header} content={content} scroll="content" />;
}
