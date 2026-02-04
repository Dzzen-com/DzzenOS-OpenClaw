export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-white/10 bg-[#0b1220]/70 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="sm:hidden">
          <div className="h-8 w-8 rounded-lg bg-white/5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-200">Inbox</div>
          <div className="truncate text-xs text-slate-500">All tasks</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          placeholder="Search (placeholder)"
          className="hidden w-64 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 sm:block"
        />
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
        >
          New
        </button>
      </div>
    </header>
  );
}
