'use client';
import { useState } from 'react';
import { callApi } from '@/components/cabinet/api';
import { useT } from '@/i18n/client';
import { community } from '@/i18n/messages/community';

export default function AnnounceForm() {
  const t = useT(community);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="community-announce" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setNote(null);
      const res = await callApi('/api/admin/community', 'POST', { action: 'announce', text });
      setBusy(false);
      if (!res.ok) return setNote({ ok: false, text: res.error });
      setText('');
      setNote({ ok: true, text: t('sent') });
    }}>
      <textarea className="input" rows={4} maxLength={3500} value={text} required onChange={(e) => setText(e.target.value)} />
      <div className="community-announce-foot">
        {note && <span className={note.ok ? 'muted' : 'error-box'}>{note.text}</span>}
        <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>{t('send')}</button>
      </div>
    </form>
  );
}
