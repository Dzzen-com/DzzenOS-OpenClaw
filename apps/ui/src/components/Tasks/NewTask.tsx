import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useTranslation } from 'react-i18next';

export function NewTask({ onCreate }: { onCreate: (title: string) => Promise<void> | void }) {
  const { t } = useTranslation();
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
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('New task title…')} className="w-full" />
      <Button type="submit" disabled={busy || !title.trim()}>
        {t('Add')}
      </Button>
    </form>
  );
}
