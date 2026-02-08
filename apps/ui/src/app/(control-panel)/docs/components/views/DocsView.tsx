import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	CardHeader,
	Divider,
	Grid,
	Stack,
	TextField,
	Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import FusePageSimple from '@fuse/core/FusePageSimple';
import { getOverviewDoc, updateOverviewDoc } from '@/api/queries';

const Root = styled(FusePageSimple)(({ theme }) => ({
	'& .FusePageSimple-header': {
		borderBottom: `1px solid ${theme.vars.palette.divider}`,
		background: theme.vars.palette.background.paper
	},
	'& .FusePageSimple-content': {
		background: theme.vars.palette.background.default
	}
}));

export default function DocsView() {
	const qc = useQueryClient();
	const [draft, setDraft] = useState('');
	const [isDirty, setIsDirty] = useState(false);

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

	const header = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2 }}>
			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
				<Box>
					<Typography variant="overline" color="text.secondary">
						Fuse Workspace
					</Typography>
					<Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
						Docs
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Каноничный overview-документ платформы.
					</Typography>
				</Box>

				<Stack direction="row" spacing={1.5}>
					<Button
						variant="outlined"
						disabled={!isDirty || saveM.isPending}
						onClick={() => {
							setDraft(docQ.data?.content ?? '');
							setIsDirty(false);
						}}
					>
						Отменить
					</Button>
					<Button variant="contained" disabled={!isDirty || saveM.isPending} onClick={() => saveM.mutate()}>
						{saveM.isPending ? 'Сохранение...' : 'Сохранить'}
					</Button>
				</Stack>
			</Stack>
		</Box>
	);

	const content = (
		<Box sx={{ width: '100%', px: { xs: 2, md: 3 }, py: 2.5 }}>
			<Grid container spacing={2}>
				<Grid size={{ xs: 12, lg: 7 }}>
					<Card variant="outlined" sx={{ height: '100%' }}>
						<CardHeader title="Editor" subheader="Текст хранится в /docs/overview" />
						<Divider />
						<CardContent>
							<TextField
								fullWidth
								multiline
								minRows={22}
								value={draft}
								onChange={(event) => {
									setDraft(event.target.value);
									setIsDirty(true);
								}}
								placeholder="Добавьте обзор продукта, правила и рабочие процессы..."
							/>
						</CardContent>
					</Card>
				</Grid>

				<Grid size={{ xs: 12, lg: 5 }}>
					<Card variant="outlined" sx={{ height: '100%' }}>
						<CardHeader title="Preview" subheader="Быстрый просмотр текущего текста" />
						<Divider />
						<CardContent sx={{ display: 'grid', gap: 1.5 }}>
							<Typography variant="caption" color="text.secondary">
								Символов: {draft.length}
							</Typography>
							<Box
								sx={{
									minHeight: 420,
									maxHeight: 640,
									overflow: 'auto',
									borderRadius: 1,
									border: (theme) => `1px solid ${theme.vars.palette.divider}`,
									p: 1.5,
									whiteSpace: 'pre-wrap'
								}}
							>
								<Typography variant="body2" color={draft.trim() ? 'text.primary' : 'text.secondary'}>
									{draft.trim() ? draft : 'Документ пока пуст.'}
								</Typography>
							</Box>
						</CardContent>
					</Card>
				</Grid>
			</Grid>

			{saveM.isSuccess ? (
				<Alert severity="success" sx={{ mt: 2 }}>
					Документ сохранен.
				</Alert>
			) : null}
			{docQ.isError || saveM.isError ? (
				<Alert severity="error" sx={{ mt: 2 }}>
					{String(docQ.error ?? saveM.error)}
				</Alert>
			) : null}
		</Box>
	);

	return <Root header={header} content={content} scroll="content" />;
}
