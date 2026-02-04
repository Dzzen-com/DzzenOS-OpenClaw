import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task title…" className="w-full" />
      <Button type="submit" disabled={busy || !title.trim()}>
        Add
      </Button>
    </form>
  );
}
