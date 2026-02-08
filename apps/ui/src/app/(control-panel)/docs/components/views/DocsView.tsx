import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Alert,
	Box,
	Button,
	Chip,
	Divider,
	Paper,
	Stack,
	Tab,
	Tabs,
	TextField,
	Typography
} from '@mui/material';
import { darken, styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { motion } from 'motion/react';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { getOverviewDoc, updateOverviewDoc } from '@/api/queries';

const Root = styled(FusePageSimple)(() => ({
	'& .container': {
		maxWidth: '100%!important'
	}
}));

function DocsHeader({
	isDirty,
	saving,
	onReset,
	onSave,
	wordCount
}: {
	isDirty: boolean;
	saving: boolean;
	onReset: () => void;
	onSave: () => void;
	wordCount: number;
}) {
	return (
		<div className="container flex w-full border-b">
			<div className="flex flex-auto flex-col p-4 md:px-8">
				<PageBreadcrumb className="mb-2" />
				<div className="flex min-w-0 flex-auto flex-col gap-3 md:flex-row md:items-center">
					<div className="flex flex-auto items-center gap-3">
						<Box
							sx={(theme) => ({
								background: darken(theme.palette.background.default, 0.05),
								color: theme.vars.palette.text.secondary
							})}
							className="flex h-12 w-12 items-center justify-center rounded-full"
						>
							<FuseSvgIcon size={20}>lucide:file-text</FuseSvgIcon>
						</Box>
						<div className="min-w-0">
							<Typography className="truncate text-2xl leading-none font-bold tracking-tight md:text-3xl">Docs</Typography>
							<Typography className="text-md mt-1" color="text.secondary">
								Overview documentation editor · {wordCount} words
							</Typography>
						</div>
					</div>

					<Stack direction="row" spacing={1.5}>
						<Button variant="outlined" disabled={!isDirty || saving} onClick={onReset}>Reset</Button>
						<Button variant="contained" disabled={!isDirty || saving} onClick={onSave} startIcon={<FuseSvgIcon>lucide:save</FuseSvgIcon>}>
							{saving ? 'Saving...' : 'Save'}
						</Button>
					</Stack>
				</div>
			</div>
		</div>
	);
}

export default function DocsView() {
	const qc = useQueryClient();
	const [draft, setDraft] = useState('');
	const [isDirty, setIsDirty] = useState(false);
	const [tabValue, setTabValue] = useState('editor');

	const docQ = useQuery({
		queryKey: ['docs', 'overview'],
		queryFn: getOverviewDoc
	});

	useEffect(() => {
		if (!isDirty) {
			setDraft(docQ.data?.content ?? '');
		}
	}, [docQ.data?.content, isDirty]);

	const saveM = useMutation({
		mutationFn: async () => updateOverviewDoc(draft),
		onSuccess: async () => {
			setIsDirty(false);
			await qc.invalidateQueries({ queryKey: ['docs', 'overview'] });
		}
	});

	const wordCount = useMemo(() => {
		const words = draft.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean);
		return words.length;
	}, [draft]);

	const charCount = draft.length;

	const content = (
		<div className="w-full pt-4 sm:pt-6">
			<div className="flex w-full flex-col justify-between gap-2 px-4 sm:flex-row sm:items-center md:px-8">
				<Tabs value={tabValue} onChange={(_event, value: string) => setTabValue(value)}>
					<Tab value="editor" label="Editor" />
					<Tab value="preview" label="Preview" />
				</Tabs>
			</div>

			<div className="grid w-full grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[320px,1fr] md:px-8">
				<Paper className="rounded-xl p-5 shadow-sm">
					<Typography className="text-lg font-semibold">Document Status</Typography>
					<Stack spacing={1.5} className="mt-4">
						<Chip size="small" label={`Words: ${wordCount}`} />
						<Chip size="small" label={`Characters: ${charCount}`} />
						<Chip size="small" color={isDirty ? 'warning' : 'success'} label={isDirty ? 'Unsaved changes' : 'Saved'} />
					</Stack>
					<Divider className="my-4" />
					<Typography className="text-sm" color="text.secondary">
						Use this page as the single source of truth for your product overview, operating rules, and delivery workflow.
					</Typography>
				</Paper>

				<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
					{tabValue === 'editor' ? (
						<Paper className="rounded-xl p-5 shadow-sm">
							<Typography className="text-lg font-semibold">Overview Editor</Typography>
							<TextField
								fullWidth
								multiline
								minRows={22}
								value={draft}
								onChange={(event) => {
									setDraft(event.target.value);
									setIsDirty(true);
								}}
								sx={{ mt: 2 }}
								placeholder="Write your workspace overview, conventions and workflows..."
							/>
						</Paper>
					) : (
						<Paper className="rounded-xl p-5 shadow-sm">
							<Typography className="text-lg font-semibold">Preview</Typography>
							<Divider className="my-4" />
							<Box sx={{ minHeight: 480, whiteSpace: 'pre-wrap' }}>
								<Typography color={draft.trim() ? 'text.primary' : 'text.secondary'}>
									{draft.trim() ? draft : 'Document is empty.'}
								</Typography>
							</Box>
						</Paper>
					)}
				</motion.div>
			</div>

			{saveM.isSuccess ? (
				<Alert severity="success" sx={{ mx: { xs: 2, md: 4 }, mb: 2 }}>
					Overview document saved.
				</Alert>
			) : null}
			{docQ.isError || saveM.isError ? (
				<Alert severity="error" sx={{ mx: { xs: 2, md: 4 }, mb: 2 }}>
					{String(docQ.error ?? saveM.error)}
				</Alert>
			) : null}
		</div>
	);

	return (
		<Root
			header={
				<DocsHeader
					isDirty={isDirty}
					saving={saveM.isPending}
					onReset={() => {
						setDraft(docQ.data?.content ?? '');
						setIsDirty(false);
					}}
					onSave={() => saveM.mutate()}
					wordCount={wordCount}
				/>
			}
			content={content}
			scroll="content"
		/>
	);
}
