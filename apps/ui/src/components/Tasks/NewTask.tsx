import { useState } from 'react';

export function NewTask({ onCreate }: { onCreate: (title: string) => Promise<void> | void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        setBusy(true);
        try {
          await onCreate(t);
          setTitle('');
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New task title…"
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-white/20"
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
