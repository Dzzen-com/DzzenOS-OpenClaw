import { Skeleton } from '../ui/Skeleton';

export function TaskBoardSkeleton() {
  const cols = Array.from({ length: 3 });
  const cards = Array.from({ length: 4 });
  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-3">
      {cols.map((_, i) => (
        <div key={i} className="w-[240px] shrink-0 sm:w-[280px]">
          <div className="rounded-xl border border-border/70 bg-surface-1/70 p-3 shadow-panel">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-8" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {cards.map((_, idx) => (
                <Skeleton key={idx} className="h-16 w-full" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
