import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Chip, List, ListItem, ListItemText, Paper, Stack, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import useThemeMediaQuery from '@fuse/hooks/useThemeMediaQuery';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { getOpenClawSettingsStatus } from '@/api/queries';

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

function OpenClawHeader() {
	return (
		<div className="container flex w-full border-b">
			<div className="flex flex-auto flex-col p-4 md:px-8">
				<PageBreadcrumb className="mb-2" />
				<div className="flex min-w-0 flex-auto flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<Typography className="truncate text-3xl leading-none font-bold tracking-tight md:text-4xl">
							OpenClaw Settings
						</Typography>
						<Typography
							className="text-md mt-1"
							color="text.secondary"
						>
							Read-only integration status + deep links to OpenClaw control-plane
						</Typography>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function OpenClawSettingsView() {
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));

	const statusQ = useQuery({
		queryKey: ['openclaw-settings-status'],
		queryFn: () => getOpenClawSettingsStatus(),
		refetchInterval: 30_000
	});

	const status = statusQ.data;
	const providers = useMemo(() => status?.models?.providers ?? [], [status?.models?.providers]);
	const models = useMemo(() => status?.models?.models ?? [], [status?.models?.models]);

	const content = (
		<div className="flex w-full flex-col gap-4 p-4 md:p-6">
			<Paper className="rounded-xl p-4 shadow-sm">
				<Stack
					direction={{ xs: 'column', md: 'row' }}
					spacing={2}
					alignItems={{ xs: 'flex-start', md: 'center' }}
					justifyContent="space-between"
				>
					<Stack spacing={0.5}>
						<Typography className="text-lg font-semibold">Integration status</Typography>
						<Typography color="text.secondary">
							{status?.dashboard_url ? `Dashboard: ${status.dashboard_url}` : 'Dashboard URL is not available'}
						</Typography>
					</Stack>
					<Chip
						color={status?.ok ? 'success' : 'error'}
						label={status?.ok ? 'Connected' : 'Degraded'}
					/>
				</Stack>
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					spacing={1}
					className="mt-3"
				>
					<Button
						variant="outlined"
						startIcon={<FuseSvgIcon>lucide:external-link</FuseSvgIcon>}
						component="a"
						href={status?.dashboard_url || '#'}
						target="_blank"
						rel="noreferrer"
						disabled={!status?.dashboard_url}
					>
						Open Dashboard
					</Button>
					<Button
						variant="outlined"
						component="a"
						href={status?.deep_links?.providers || '#'}
						target="_blank"
						rel="noreferrer"
						disabled={!status?.deep_links?.providers}
					>
						Providers
					</Button>
					<Button
						variant="outlined"
						component="a"
						href={status?.deep_links?.agents || '#'}
						target="_blank"
						rel="noreferrer"
						disabled={!status?.deep_links?.agents}
					>
						Agent Files
					</Button>
					<Button
						variant="outlined"
						component="a"
						href={status?.deep_links?.cron || '#'}
						target="_blank"
						rel="noreferrer"
						disabled={!status?.deep_links?.cron}
					>
						Cron
					</Button>
				</Stack>
				{status?.error ? (
					<Alert
						className="mt-3"
						severity="error"
					>
						{status.error}
					</Alert>
				) : null}
			</Paper>

			<Paper className="rounded-xl p-4 shadow-sm">
				<Typography className="text-lg font-semibold">Providers</Typography>
				<List className="mt-2 divide-y py-0">
					{providers.map((provider) => (
						<ListItem key={provider.id}>
							<ListItemText
								primary={`${provider.id} (${provider.kind})`}
								secondary={`Auth: ${provider.auth_state} · Mode: ${provider.auth_mode} · Enabled: ${provider.enabled ? 'yes' : 'no'}`}
							/>
						</ListItem>
					))}
					{providers.length === 0 ? (
						<ListItem>
							<ListItemText primary="No providers found." />
						</ListItem>
					) : null}
				</List>
			</Paper>

			<Paper className="rounded-xl p-4 shadow-sm">
				<Typography className="text-lg font-semibold">Models</Typography>
				<List className="mt-2 divide-y py-0">
					{models.map((model) => (
						<ListItem key={model.id}>
							<ListItemText
								primary={model.display_name || model.id}
								secondary={`${model.id} · provider=${model.provider_id} · ${model.availability}`}
							/>
						</ListItem>
					))}
					{models.length === 0 ? (
						<ListItem>
							<ListItemText primary="No models found." />
						</ListItem>
					) : null}
				</List>
			</Paper>

			<Paper className="rounded-xl p-4 shadow-sm">
				<Typography className="text-lg font-semibold">Cron status (raw)</Typography>
				<pre className="mt-2 max-h-[380px] overflow-auto rounded-lg bg-black/5 p-3 text-xs">
					{JSON.stringify(status?.cron ?? null, null, 2)}
				</pre>
			</Paper>

			{statusQ.isError ? <Alert severity="error">{String(statusQ.error)}</Alert> : null}
		</div>
	);

	return (
		<Root
			header={<OpenClawHeader />}
			content={content}
			scroll={isMobile ? 'page' : 'content'}
		/>
	);
}
