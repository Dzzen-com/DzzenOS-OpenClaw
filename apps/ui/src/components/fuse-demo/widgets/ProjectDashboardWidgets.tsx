import { memo, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { Tab, Tabs } from '@mui/material';
import Typography from '@mui/material/Typography';
import { lighten, useTheme } from '@mui/material/styles';
import _ from 'lodash';
import type { ApexOptions } from 'apexcharts';
import ReactApexChart from 'react-apexcharts';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export type RangesMap = Record<string, string>;

export type GithubOverview = {
	'new-issues': number;
	'closed-issues': number;
	fixed: number;
	'wont-fix': number;
	're-opened': number;
	'needs-triage': number;
};

export type ScheduleEntry = {
	title: string;
	time?: string;
	location?: string;
};

function rangeKeys(ranges: RangesMap): string[] {
	return Object.keys(ranges);
}

export const SummaryWidget = memo(function SummaryWidget({
	ranges,
	counts,
	extraCounts,
	name,
	extraName
}: {
	ranges: RangesMap;
	counts: Record<string, number>;
	extraCounts: Record<string, number>;
	name: string;
	extraName: string;
}) {
	const keys = rangeKeys(ranges);
	const [currentRange, setCurrentRange] = useState(keys[0] ?? '');

	useEffect(() => {
		if (!keys.includes(currentRange)) {
			setCurrentRange(keys[0] ?? '');
		}
	}, [currentRange, keys]);

	function handleChangeRange(event: SelectChangeEvent<string>) {
		setCurrentRange(event.target.value);
	}

	return (
		<Paper className="flex flex-auto flex-col overflow-hidden rounded-xl shadow-sm">
			<div className="flex items-center justify-between px-2 pt-2">
				<Select
					classes={{ select: 'py-0 flex items-center' }}
					value={currentRange}
					onChange={handleChangeRange}
					slotProps={{
						input: {
							name: 'currentRange'
						}
					}}
				>
					{keys.map((key) => (
						<MenuItem key={key} value={key}>
							{ranges[key]}
						</MenuItem>
					))}
				</Select>
				<IconButton aria-label="more">
					<FuseSvgIcon>lucide:ellipsis-vertical</FuseSvgIcon>
				</IconButton>
			</div>
			<div className="mt-4 text-center">
				<Typography className="text-7xl leading-none font-bold tracking-tight sm:text-8xl">
					{counts[currentRange] ?? 0}
				</Typography>
				<Typography className="text-lg font-medium" color="text.secondary">
					{name}
				</Typography>
			</div>
			<Typography className="mt-5 mb-6 flex w-full items-baseline justify-center gap-2" color="text.secondary">
				<span className="truncate">{extraName}:</span>
				<b>{extraCounts[currentRange] ?? 0}</b>
			</Typography>
		</Paper>
	);
});

export const MetricWidget = memo(function MetricWidget({
	title,
	value,
	name,
	extraName,
	extraCount
}: {
	title: string;
	value: number;
	name: string;
	extraName: string;
	extraCount: number;
}) {
	return (
		<Paper className="flex flex-auto flex-col overflow-hidden rounded-xl shadow-sm">
			<div className="flex items-center justify-between px-2 pt-2">
				<Typography className="truncate px-3 text-lg leading-6 font-medium tracking-tight" color="text.secondary">
					{title}
				</Typography>
				<IconButton aria-label="more">
					<FuseSvgIcon>lucide:ellipsis-vertical</FuseSvgIcon>
				</IconButton>
			</div>
			<div className="mt-4 text-center">
				<Typography className="text-7xl leading-none font-bold tracking-tight sm:text-8xl">{value}</Typography>
				<Typography className="text-lg font-medium" color="text.secondary">
					{name}
				</Typography>
			</div>
			<Typography className="mt-5 mb-6 flex w-full items-baseline justify-center gap-2" color="text.secondary">
				<span className="truncate">{extraName}:</span>
				<b>{extraCount}</b>
			</Typography>
		</Paper>
	);
});

export const GithubIssuesWidget = memo(function GithubIssuesWidget({
	ranges,
	labels,
	series,
	overview,
	title = 'Github Issues Summary'
}: {
	ranges: RangesMap;
	labels: string[];
	series: Record<string, Array<{ name: string; type?: 'line' | 'bar'; data: number[] }>>;
	overview: Record<string, GithubOverview>;
	title?: string;
}) {
	const theme = useTheme();
	const [awaitRender, setAwaitRender] = useState(true);
	const [tabValue, setTabValue] = useState(0);
	const keys = rangeKeys(ranges);
	const currentRange = keys[tabValue] ?? keys[0] ?? '';
	const currentOverview = overview[currentRange] ?? {
		'new-issues': 0,
		'closed-issues': 0,
		fixed: 0,
		'wont-fix': 0,
		're-opened': 0,
		'needs-triage': 0
	};

	const chartOptions: ApexOptions = useMemo(
		() => ({
			chart: {
				fontFamily: 'inherit',
				foreColor: 'inherit',
				height: '100%',
				type: 'line',
				toolbar: {
					show: false
				},
				zoom: {
					enabled: false
				}
			},
			colors: [theme.palette.primary.main, theme.palette.secondary.main],
			labels,
			dataLabels: {
				enabled: true,
				enabledOnSeries: [0],
				background: {
					borderWidth: 0
				}
			},
			grid: {
				borderColor: theme.palette.divider
			},
			legend: {
				show: false
			},
			plotOptions: {
				bar: {
					columnWidth: '50%'
				}
			},
			states: {
				hover: {
					filter: {
						type: 'darken'
					}
				}
			},
			stroke: {
				width: [3, 0]
			},
			tooltip: {
				followCursor: true,
				theme: theme.palette.mode
			},
			xaxis: {
				axisBorder: {
					show: false
				},
				axisTicks: {
					color: theme.palette.divider
				},
				labels: {
					style: {
						colors: theme.palette.text.secondary
					}
				},
				tooltip: {
					enabled: false
				}
			},
			yaxis: {
				labels: {
					offsetX: -16,
					style: {
						colors: theme.palette.text.secondary
					}
				}
			}
		}),
		[labels, theme.palette.divider, theme.palette.mode, theme.palette.primary.main, theme.palette.secondary.main, theme.palette.text.secondary]
	);

	useEffect(() => {
		setAwaitRender(false);
	}, []);

	if (awaitRender) {
		return null;
	}

	return (
		<Paper className="flex flex-auto flex-col overflow-hidden rounded-xl p-6 shadow-sm">
			<div className="flex flex-col items-start justify-between sm:flex-row">
				<Typography className="truncate text-xl leading-6 font-medium tracking-tight">{title}</Typography>
				<div className="mt-3 sm:mt-0">
					<Tabs value={tabValue} onChange={(_event, value: number) => setTabValue(value)}>
						{keys.map((key, index) => (
							<Tab key={key} value={index} label={ranges[key]} />
						))}
					</Tabs>
				</div>
			</div>
			<div className="mt-8 grid w-full grid-flow-row grid-cols-1 gap-6 sm:mt-4 lg:grid-cols-2">
				<div className="flex flex-auto flex-col">
					<Typography className="font-medium" color="text.secondary">
						New vs. Closed
					</Typography>
					<div className="flex flex-auto flex-col">
						<ReactApexChart className="w-full flex-auto" options={chartOptions} series={_.cloneDeep(series[currentRange] ?? [])} height={320} />
					</div>
				</div>
				<div className="flex flex-col">
					<Typography className="font-medium" color="text.secondary">
						Overview
					</Typography>
					<div className="mt-6 grid flex-auto grid-cols-4 gap-3">
						<Box sx={{ backgroundColor: 'var(--mui-palette-background-default)' }} className="col-span-2 flex flex-col items-center justify-center rounded-xl border px-1 py-8">
							<Typography className="text-5xl leading-none font-semibold tracking-tight sm:text-7xl" color="secondary">
								{currentOverview['new-issues']}
							</Typography>
							<Typography className="mt-1 text-sm font-medium sm:text-lg" color="secondary">New Issues</Typography>
						</Box>
						<Box sx={{ backgroundColor: 'var(--mui-palette-background-default)' }} className="col-span-2 flex flex-col items-center justify-center rounded-xl border px-1 py-8">
							<Typography className="text-5xl leading-none font-semibold tracking-tight sm:text-7xl" color="secondary">
								{currentOverview['closed-issues']}
							</Typography>
							<Typography className="mt-1 text-sm font-medium sm:text-lg" color="secondary">Closed</Typography>
						</Box>
						<Box sx={{ backgroundColor: 'var(--mui-palette-background-default)' }} className="col-span-2 flex flex-col items-center justify-center rounded-xl border px-1 py-8 sm:col-span-1">
							<Typography className="text-5xl leading-none font-semibold tracking-tight" color="text.secondary">{currentOverview.fixed}</Typography>
							<Typography className="mt-1 text-center text-sm font-medium" color="text.secondary">Fixed</Typography>
						</Box>
						<Box sx={{ backgroundColor: 'var(--mui-palette-background-default)' }} className="col-span-2 flex flex-col items-center justify-center rounded-xl border px-1 py-8 sm:col-span-1">
							<Typography className="text-5xl leading-none font-semibold tracking-tight" color="text.secondary">{currentOverview['wont-fix']}</Typography>
							<Typography className="mt-1 text-center text-sm font-medium" color="text.secondary">Won't Fix</Typography>
						</Box>
						<Box sx={{ backgroundColor: 'var(--mui-palette-background-default)' }} className="col-span-2 flex flex-col items-center justify-center rounded-xl border px-1 py-8 sm:col-span-1">
							<Typography className="text-5xl leading-none font-semibold tracking-tight" color="text.secondary">{currentOverview['re-opened']}</Typography>
							<Typography className="mt-1 text-center text-sm font-medium" color="text.secondary">Re-opened</Typography>
						</Box>
						<Box sx={{ backgroundColor: 'var(--mui-palette-background-default)' }} className="col-span-2 flex flex-col items-center justify-center rounded-xl border px-1 py-8 sm:col-span-1">
							<Typography className="text-5xl leading-none font-semibold tracking-tight" color="text.secondary">{currentOverview['needs-triage']}</Typography>
							<Typography className="mt-1 text-center text-sm font-medium" color="text.secondary">Needs Triage</Typography>
						</Box>
					</div>
				</div>
			</div>
		</Paper>
	);
});

export const TaskDistributionWidget = memo(function TaskDistributionWidget({
	ranges,
	labels,
	series,
	overview
}: {
	ranges: RangesMap;
	labels: string[];
	series: Record<string, number[]>;
	overview: Record<string, { new: number; completed: number }>;
}) {
	const theme = useTheme();
	const keys = rangeKeys(ranges);
	const [tabValue, setTabValue] = useState(0);
	const [awaitRender, setAwaitRender] = useState(true);
	const currentRange = keys[tabValue] ?? keys[0] ?? '';
	const currentOverview = overview[currentRange] ?? { new: 0, completed: 0 };

	const chartOptions: ApexOptions = useMemo(
		() => ({
			chart: {
				fontFamily: 'inherit',
				foreColor: 'inherit',
				height: '100%',
				type: 'polarArea',
				toolbar: {
					show: false
				},
				zoom: {
					enabled: false
				}
			},
			labels,
			legend: {
				position: 'bottom'
			},
			plotOptions: {
				polarArea: {
					spokes: {
						connectorColors: theme.palette.divider
					},
					rings: {
						strokeColor: theme.palette.divider
					}
				}
			},
			states: {
				hover: {
					filter: {
						type: 'darken'
					}
				}
			},
			stroke: {
				width: 2
			},
			theme: {
				monochrome: {
					enabled: true,
					color: theme.palette.secondary.main,
					shadeIntensity: 0.75,
					shadeTo: 'dark'
				}
			},
			tooltip: {
				followCursor: true,
				theme: 'dark'
			},
			yaxis: {
				labels: {
					style: {
						colors: theme.palette.text.secondary
					}
				}
			}
		}),
		[labels, theme.palette.divider, theme.palette.secondary.main, theme.palette.text.secondary]
	);

	useEffect(() => {
		setAwaitRender(false);
	}, []);

	if (awaitRender) {
		return null;
	}

	return (
		<Paper className="flex h-full flex-auto flex-col overflow-hidden rounded-xl p-6 shadow-sm">
			<div className="flex flex-col items-start justify-between sm:flex-row">
				<Typography className="truncate text-lg leading-6 font-medium tracking-tight">Task Distribution</Typography>
				<div className="mt-0.75 sm:mt-0">
					<Tabs value={tabValue} onChange={(_event, value: number) => setTabValue(value)}>
						{keys.map((key, index) => (
							<Tab key={key} value={index} label={ranges[key]} />
						))}
					</Tabs>
				</div>
			</div>
			<div className="mt-1.5 flex flex-auto flex-col">
				<ReactApexChart className="w-full flex-auto" options={chartOptions} series={series[currentRange] ?? []} type={chartOptions?.chart?.type} />
			</div>
			<Box
				sx={[
					(_theme) =>
						_theme.palette.mode === 'light'
							? {
									backgroundColor: lighten(theme.palette.background.default, 0.4)
							}
							: {
									backgroundColor: lighten(theme.palette.background.default, 0.02)
							}
				]}
				className="-m-6 mt-4 grid grid-cols-2 divide-x border-t"
			>
				<div className="flex flex-col items-center justify-center p-6 sm:p-8">
					<div className="text-5xl leading-none font-semibold tracking-tighter">{currentOverview.new}</div>
					<Typography className="text-secondary mt-1 text-center">New tasks</Typography>
				</div>
				<div className="flex flex-col items-center justify-center p-1.5 sm:p-2">
					<div className="text-5xl leading-none font-semibold tracking-tighter">{currentOverview.completed}</div>
					<Typography className="text-secondary mt-1 text-center">Completed tasks</Typography>
				</div>
			</Box>
		</Paper>
	);
});

export const ScheduleWidget = memo(function ScheduleWidget({
	ranges,
	series
}: {
	ranges: RangesMap;
	series: Record<string, ScheduleEntry[]>;
}) {
	const keys = rangeKeys(ranges);
	const [tabValue, setTabValue] = useState(0);
	const currentRange = keys[tabValue] ?? keys[0] ?? '';
	const currentSeries = series[currentRange] ?? [];

	return (
		<Paper className="flex h-full flex-auto flex-col overflow-hidden rounded-xl p-6 shadow-sm">
			<div className="flex flex-col items-start justify-between sm:flex-row">
				<Typography className="truncate text-lg leading-6 font-medium tracking-tight">Schedule</Typography>
				<div className="mt-3 sm:mt-0">
					<Tabs value={tabValue} onChange={(_event, value: number) => setTabValue(value)}>
						{keys.map((key, index) => (
							<Tab key={key} value={index} label={ranges[key]} />
						))}
					</Tabs>
				</div>
			</div>
			<List className="mt-2 divide-y py-0">
				{currentSeries.map((entry, index) => (
					<ListItem
						key={index}
						secondaryAction={
							<IconButton aria-label="more">
								<FuseSvgIcon>lucide:chevron-right</FuseSvgIcon>
							</IconButton>
						}
						disableGutters
					>
						<ListItemText
							classes={{ primary: 'font-medium' }}
							primary={entry.title}
							secondary={
								<span className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
									{entry.time ? (
										<span className="flex items-center gap-1">
											<FuseSvgIcon color="disabled">lucide:clock</FuseSvgIcon>
											<Typography component="span" className="text-md" color="text.secondary">
												{entry.time}
											</Typography>
										</span>
									) : null}
									{entry.location ? (
										<span className="flex items-center gap-1">
											<FuseSvgIcon color="disabled">lucide:map-pin</FuseSvgIcon>
											<Typography component="span" className="text-md" color="text.secondary">
												{entry.location}
											</Typography>
										</span>
									) : null}
								</span>
							}
						/>
					</ListItem>
				))}
				{currentSeries.length === 0 ? (
					<ListItem disableGutters>
						<ListItemText primary="No scheduled items for this range" />
					</ListItem>
				) : null}
			</List>
		</Paper>
	);
});
