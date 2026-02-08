import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Alert,
	Box,
	Button,
	Chip,
	IconButton,
	List,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Paper,
	Stack,
	TextField,
	Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import useThemeMediaQuery from '@fuse/hooks/useThemeMediaQuery';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { getOverviewDoc, updateOverviewDoc } from '@/api/queries';

const Root = styled(FusePageSimple)(({ theme }) => ({
	'& .container': {
		maxWidth: '100%!important'
	},
	'& .FusePageSimple-contentWrapper': {
		paddingTop: 2,
		paddingLeft: 2
	},
	'& .FusePageSimple-content': {
		boxShadow: theme.vars.shadows[2],
		borderRadius: '12px 0 0 0',
		backgroundColor: theme.vars.palette.background.paper,
		[theme.breakpoints.down('md')]: {
			borderRadius: '12px 12px 0 0'
		}
	},
	'& .FusePageSimple-sidebarWrapper': {
		border: 'none'
	},
	'& .FusePageSimple-sidebarContent': {
		backgroundColor: theme.vars.palette.background.default
	}
}));

const DOCS_SECTIONS = [
	{
		id: 'editor',
		title: 'Editor',
		subtitle: 'Edit overview content',
		icon: 'lucide:pen-square'
	},
	{
		id: 'preview',
		title: 'Preview',
		subtitle: 'Read formatted content',
		icon: 'lucide:eye'
	},
	{
		id: 'info',
		title: 'Document Info',
		subtitle: 'Status and metrics',
		icon: 'lucide:info'
	}
] as const;

type DocsSection = (typeof DOCS_SECTIONS)[number]['id'];

function DocsSidebarContent({
	activeSection,
	onSelectSection,
	onSetSidebarOpen
}: {
	activeSection: DocsSection;
	onSelectSection: (section: DocsSection) => void;
	onSetSidebarOpen: (open: boolean) => void;
}) {
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between p-4">
				<Typography className="text-3xl leading-none font-bold tracking-tight">Docs</Typography>
				{isMobile ? (
					<IconButton
						onClick={() => onSetSidebarOpen(false)}
						aria-label="close docs sidebar"
						size="small"
					>
						<FuseSvgIcon size={18}>lucide:x</FuseSvgIcon>
					</IconButton>
				) : null}
			</div>
			<List className="px-2">
				{DOCS_SECTIONS.map((section) => (
					<ListItemButton
						key={section.id}
						selected={activeSection === section.id}
						onClick={() => {
							onSelectSection(section.id);

							if (isMobile) {
								onSetSidebarOpen(false);
							}
						}}
						className="mb-1 rounded-lg"
					>
						<ListItemIcon className="min-w-9">
							<FuseSvgIcon size={18}>{section.icon}</FuseSvgIcon>
						</ListItemIcon>
						<ListItemText
							primary={section.title}
							secondary={section.subtitle}
						/>
					</ListItemButton>
				))}
			</List>
		</div>
	);
}

function DocsContentHeader({
	isMobile,
	activeSection,
	wordCount,
	charCount,
	isDirty,
	isSaving,
	onReset,
	onSave,
	onOpenSidebar
}: {
	isMobile: boolean;
	activeSection: DocsSection;
	wordCount: number;
	charCount: number;
	isDirty: boolean;
	isSaving: boolean;
	onReset: () => void;
	onSave: () => void;
	onOpenSidebar: () => void;
}) {
	const section = DOCS_SECTIONS.find((item) => item.id === activeSection)!;

	return (
		<div className="mb-4 flex flex-col gap-3">
			<PageBreadcrumb className="mb-1" />
			<div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
				<div className="flex items-center gap-2">
					{isMobile ? (
						<IconButton
							className="border-divider border"
							onClick={onOpenSidebar}
							aria-label="open docs sidebar"
						>
							<FuseSvgIcon size={18}>lucide:menu</FuseSvgIcon>
						</IconButton>
					) : null}
					<div className="min-w-0">
						<Typography className="truncate text-3xl leading-none font-bold tracking-tight">
							{section.title}
						</Typography>
						<Typography
							className="mt-1 text-sm"
							color="text.secondary"
						>
							Overview documentation · {wordCount} words · {charCount} chars
						</Typography>
					</div>
				</div>
				<Stack
					direction="row"
					spacing={1.5}
				>
					<Button
						variant="outlined"
						disabled={!isDirty || isSaving}
						onClick={onReset}
					>
						Reset
					</Button>
					<Button
						variant="contained"
						disabled={!isDirty || isSaving}
						onClick={onSave}
						startIcon={<FuseSvgIcon>lucide:save</FuseSvgIcon>}
					>
						{isSaving ? 'Saving...' : 'Save'}
					</Button>
				</Stack>
			</div>
			<Stack
				direction="row"
				spacing={1}
				useFlexGap
				flexWrap="wrap"
			>
				<Chip
					size="small"
					color="info"
					label={section.title}
				/>
				<Chip
					size="small"
					label={`Words: ${wordCount}`}
				/>
				<Chip
					size="small"
					label={`Characters: ${charCount}`}
				/>
				<Chip
					size="small"
					color={isDirty ? 'warning' : 'success'}
					label={isDirty ? 'Unsaved changes' : 'Saved'}
				/>
			</Stack>
		</div>
	);
}

function DocsSectionContent({
	activeSection,
	draft,
	onChangeDraft
}: {
	activeSection: DocsSection;
	draft: string;
	onChangeDraft: (value: string) => void;
}) {
	if (activeSection === 'preview') {
		return (
			<Paper className="rounded-xl p-5 shadow-sm">
				<Typography className="text-lg font-semibold">Preview</Typography>
				<Box sx={{ mt: 2, minHeight: 520, whiteSpace: 'pre-wrap' }}>
					<Typography color={draft.trim() ? 'text.primary' : 'text.secondary'}>
						{draft.trim() ? draft : 'Document is empty.'}
					</Typography>
				</Box>
			</Paper>
		);
	}

	if (activeSection === 'info') {
		return (
			<Paper className="rounded-xl p-5 shadow-sm">
				<Typography className="text-lg font-semibold">Document Guidance</Typography>
				<Typography
					className="mt-3 text-sm"
					color="text.secondary"
				>
					Keep this page as the single source of truth for workspace context, team conventions, and operating
					rules for agents.
				</Typography>
				<div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
					<Paper className="rounded-lg border p-4 shadow-none">
						<Typography className="text-sm font-semibold">Product goals</Typography>
						<Typography
							className="mt-1 text-xs"
							color="text.secondary"
						>
							What success looks like in this workspace.
						</Typography>
					</Paper>
					<Paper className="rounded-lg border p-4 shadow-none">
						<Typography className="text-sm font-semibold">Team responsibilities</Typography>
						<Typography
							className="mt-1 text-xs"
							color="text.secondary"
						>
							Who owns what and escalation contacts.
						</Typography>
					</Paper>
					<Paper className="rounded-lg border p-4 shadow-none">
						<Typography className="text-sm font-semibold">Delivery workflow</Typography>
						<Typography
							className="mt-1 text-xs"
							color="text.secondary"
						>
							From idea to done, with review gates.
						</Typography>
					</Paper>
					<Paper className="rounded-lg border p-4 shadow-none">
						<Typography className="text-sm font-semibold">Escalation rules</Typography>
						<Typography
							className="mt-1 text-xs"
							color="text.secondary"
						>
							When agents should ask for human input.
						</Typography>
					</Paper>
				</div>
			</Paper>
		);
	}

	return (
		<Paper className="rounded-xl p-5 shadow-sm">
			<Typography className="text-lg font-semibold">Overview Editor</Typography>
			<TextField
				fullWidth
				multiline
				minRows={22}
				value={draft}
				onChange={(event) => onChangeDraft(event.target.value)}
				sx={{ mt: 2 }}
				placeholder="Write your workspace overview, conventions and workflows..."
			/>
		</Paper>
	);
}

export default function DocsView() {
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));
	const qc = useQueryClient();
	const [draft, setDraft] = useState('');
	const [isDirty, setIsDirty] = useState(false);
	const [activeSection, setActiveSection] = useState<DocsSection>('editor');
	const [leftSidebarOpen, setLeftSidebarOpen] = useState(!isMobile);

	const docQ = useQuery({
		queryKey: ['docs', 'overview'],
		queryFn: getOverviewDoc
	});

	useEffect(() => {
		if (!isDirty) {
			setDraft(docQ.data?.content ?? '');
		}
	}, [docQ.data?.content, isDirty]);

	useEffect(() => {
		setLeftSidebarOpen(!isMobile);
	}, [isMobile]);

	const saveM = useMutation({
		mutationFn: async () => updateOverviewDoc(draft),
		onSuccess: async () => {
			setIsDirty(false);
			await qc.invalidateQueries({ queryKey: ['docs', 'overview'] });
		}
	});

	const wordCount = useMemo(() => {
		const words = draft
			.replace(/<[^>]*>/g, ' ')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		return words.length;
	}, [draft]);

	const charCount = draft.length;

	return (
		<Root
			content={
				<div className="flex w-full flex-col p-4 md:p-6">
					<div className="max-w-4xl">
						<DocsContentHeader
							isMobile={isMobile}
							activeSection={activeSection}
							wordCount={wordCount}
							charCount={charCount}
							isDirty={isDirty}
							isSaving={saveM.isPending}
							onReset={() => {
								setDraft(docQ.data?.content ?? '');
								setIsDirty(false);
							}}
							onSave={() => saveM.mutate()}
							onOpenSidebar={() => setLeftSidebarOpen(true)}
						/>

						<DocsSectionContent
							activeSection={activeSection}
							draft={draft}
							onChangeDraft={(value) => {
								setDraft(value);
								setIsDirty(true);
							}}
						/>

						{saveM.isSuccess ? (
							<Alert
								severity="success"
								sx={{ mt: 2 }}
							>
								Overview document saved.
							</Alert>
						) : null}
						{docQ.isError || saveM.isError ? (
							<Alert
								severity="error"
								sx={{ mt: 2 }}
							>
								{String(docQ.error ?? saveM.error)}
							</Alert>
						) : null}
					</div>
				</div>
			}
			leftSidebarProps={{
				open: leftSidebarOpen,
				onClose: () => setLeftSidebarOpen(false),
				content: (
					<DocsSidebarContent
						activeSection={activeSection}
						onSelectSection={setActiveSection}
						onSetSidebarOpen={setLeftSidebarOpen}
					/>
				),
				width: 300
			}}
			scroll={isMobile ? 'page' : 'content'}
		/>
	);
}
