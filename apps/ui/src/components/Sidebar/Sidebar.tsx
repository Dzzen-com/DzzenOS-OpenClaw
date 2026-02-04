export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0a1020] sm:block">
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-indigo-400 to-cyan-400 opacity-90" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">DzzenOS</div>
            <div className="text-xs text-slate-400">Workspace</div>
          </div>
        </div>
      </div>

      <nav className="px-2 pb-4">
        <SectionTitle>Boards</SectionTitle>
        <NavItem active>Inbox</NavItem>
        <NavItem>Platform</NavItem>
        <NavItem>Agents</NavItem>

        <div className="mt-6" />
        <SectionTitle>Workspaces</SectionTitle>
        <NavItem>Personal</NavItem>
        <NavItem>Team</NavItem>
      </nav>

      <div className="mt-auto border-t border-white/10 p-3 text-xs text-slate-500">
        UI shell • Linear-like layout
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div className="px-3 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-slate-500">{children}</div>;
}

function NavItem({ children, active }: { children: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5 ' +
        (active ? 'bg-white/10' : '')
      }
    >
      <span className="h-2 w-2 rounded-full bg-white/30" />
      <span className="truncate">{children}</span>
    </button>
  );
}
