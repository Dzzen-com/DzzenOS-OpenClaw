import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listBoards, getOverviewDoc, updateOverviewDoc, getBoardDoc, updateBoardDoc, getBoardChangelog } from '../../api/queries';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { Skeleton } from '../ui/Skeleton';
import { PageHeader } from '../Layout/PageHeader';

export function DocsPage() {
  const qc = useQueryClient();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [overviewDraft, setOverviewDraft] = useState('');
  const [boardDraft, setBoardDraft] = useState('');

  const boardsQ = useQuery({ queryKey: ['boards'], queryFn: listBoards });

  useEffect(() => {
    if (selectedBoardId) return;
    const first = boardsQ.data?.[0];
    if (first) setSelectedBoardId(first.id);
  }, [boardsQ.data, selectedBoardId]);

  const overviewQ = useQuery({ queryKey: ['docs', 'overview'], queryFn: getOverviewDoc });
  const boardDocQ = useQuery({
    queryKey: ['docs', 'board', selectedBoardId],
    queryFn: () => (selectedBoardId ? getBoardDoc(selectedBoardId) : Promise.resolve({ content: '' })),
    enabled: !!selectedBoardId,
  });
  const changelogQ = useQuery({
    queryKey: ['docs', 'changelog', selectedBoardId],
    queryFn: () => (selectedBoardId ? getBoardChangelog(selectedBoardId) : Promise.resolve({ content: '' })),
    enabled: !!selectedBoardId,
  });

  const saveOverviewM = useMutation({
    mutationFn: async () => updateOverviewDoc(overviewDraft),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['docs', 'overview'] });
    },
  });

  const saveBoardM = useMutation({
    mutationFn: async () => {
      if (!selectedBoardId) return;
      return updateBoardDoc(selectedBoardId, boardDraft);
    },
    onSuccess: async () => {
      if (!selectedBoardId) return;
      await qc.invalidateQueries({ queryKey: ['docs', 'board', selectedBoardId] });
    },
  });

  useEffect(() => {
    setOverviewDraft(overviewQ.data?.content ?? '');
  }, [overviewQ.data?.content]);

  useEffect(() => {
    setBoardDraft(boardDocQ.data?.content ?? '');
  }, [boardDocQ.data?.content]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Docs" subtitle="Workspace and board memory." />
      <div className="grid w-full gap-4 lg:grid-cols-[280px,1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Boards</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {boardsQ.isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-12 w-full" />
                ))}
              </div>
            ) : boardsQ.isError ? (
              <InlineAlert>{String(boardsQ.error)}</InlineAlert>
            ) : (
              <div className="flex flex-col gap-2">
                {(boardsQ.data ?? []).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBoardId(b.id)}
                    className={
                      'rounded-md border px-3 py-2 text-left text-sm transition ' +
                      (b.id === selectedBoardId ? 'border-primary/50 bg-surface-2/60' : 'border-border/70 hover:bg-surface-2/50')
                    }
                  >
                    <div className="text-foreground">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{b.description ?? 'No description'}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Overview</CardTitle>
              <Button size="sm" variant="secondary" onClick={() => saveOverviewM.mutate()} disabled={saveOverviewM.isPending}>
                {saveOverviewM.isPending ? 'Saving…' : 'Save'}
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {overviewQ.isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <textarea
                  className="min-h-[200px] w-full resize-none rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none"
                  value={overviewDraft}
                  onChange={(e) => setOverviewDraft(e.target.value)}
                  placeholder="Write the project overview here…"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Board Doc</CardTitle>
              <Button size="sm" variant="secondary" onClick={() => saveBoardM.mutate()} disabled={saveBoardM.isPending || !selectedBoardId}>
                {saveBoardM.isPending ? 'Saving…' : 'Save'}
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {boardDocQ.isLoading ? (
                <Skeleton className="h-[220px] w-full" />
              ) : (
                <textarea
                  className="min-h-[220px] w-full resize-none rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none"
                  value={boardDraft}
                  onChange={(e) => setBoardDraft(e.target.value)}
                  placeholder="Board context and notes…"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Changelog</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {changelogQ.isLoading ? (
                <Skeleton className="h-[160px] w-full" />
              ) : (
                <textarea
                  readOnly
                  className="min-h-[160px] w-full resize-none rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-muted-foreground outline-none"
                  value={changelogQ.data?.content ?? ''}
                  placeholder="No changelog entries yet."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
