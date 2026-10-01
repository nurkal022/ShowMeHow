'use client';
import { useState } from 'react';
import type { Comment } from '@/lib/lms/discussion-types';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import { learnDate } from './format';
import { callApi } from '@/components/cabinet/api';
import { Avatar } from '@/components/cabinet/viz';
import { IconSend, IconTeach, IconTrash } from '@/components/icons';

/**
 * Обсуждение под уроком: вопросы одноклассников и ответы учителя. Ветка одного уровня —
 * вопрос и ответы на него. Своё сообщение удаляет автор, любое — учитель курса.
 */
export default function Discussion({ topicId, initial, canDeleteAny, me }: {
  topicId: string; initial: Comment[]; canDeleteAny: boolean; me: string;
}) {
  const t = useT(learnLesson);
  const f = useFormat();
  const locale = useLocale();
  // «5 мин назад», «вчера» — как formatAgo, но на языке интерфейса.
  const ago = (iso: string | null, now = Date.now()): string => {
    if (!iso) return t('agoNever');
    const min = Math.round((now - new Date(iso).getTime()) / 60_000);
    if (min < 1) return t('agoNow');
    if (min < 60) return t('agoMin', { n: min });
    const h = Math.round(min / 60);
    if (h < 24) return t('agoHour', { n: h });
    const d = Math.round(h / 24);
    if (d === 1) return t('agoYesterday');
    if (d < 30) return t('agoDays', { n: d });
    return learnDate(iso, locale);
  };
  const [items, setItems] = useState<Comment[]>(initial);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roots = items.filter((c) => !c.parentId);
  const kids = (id: string) => items.filter((c) => c.parentId === id);

  async function send(body: string, parentId: string | null) {
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    const res = await callApi<{ comment: Comment }>('/api/learn/comments', 'POST', { topicId, body, parentId });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setItems((x) => [...x, res.data.comment]);
    if (parentId) { setReplyText(''); setReplyTo(null); } else setText('');
  }

  async function remove(id: string) {
    const res = await callApi('/api/learn/comments', 'DELETE', { topicId, id });
    if (!res.ok) return setError(res.error);
    setItems((x) => x.map((c) => (c.id === id ? { ...c, deleted: true, body: '' } : c)));
  }

  const row = (c: Comment, reply: boolean) => (
    <li key={c.id} className={`dsc-item${reply ? ' reply' : ''}${c.role === 'teacher' ? ' teacher' : ''}`}>
      <Avatar name={c.author} size={reply ? 28 : 34} />
      <div className="dsc-body">
        <div className="dsc-meta">
          <b>{c.author}</b>
          {c.role === 'teacher' && <span className="dsc-badge"><IconTeach size={12} />{t('teacherBadge')}</span>}
          <time dateTime={c.createdAt}>{ago(c.createdAt)}</time>
          {!c.deleted && (canDeleteAny || c.authorId === me) && (
            <button type="button" className="dsc-del" aria-label={t('deleteMsg')} title={t('delete')} onClick={() => remove(c.id)}><IconTrash size={13} /></button>
          )}
        </div>
        {c.deleted ? <p className="muted dsc-deleted">{t('msgDeleted')}</p> : <p>{c.body}</p>}
        {!reply && !c.deleted && (
          <button type="button" className="dsc-reply" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }}>{t('reply')}</button>
        )}
        {replyTo === c.id && (
          <form className="dsc-form small" onSubmit={(e) => { e.preventDefault(); void send(replyText, c.id); }}>
            <textarea rows={2} value={replyText} maxLength={2000} autoFocus placeholder={t('replyPlaceholder')} aria-label={t('replyAria')}
              onChange={(e) => setReplyText(e.target.value)} />
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !replyText.trim()}>{t('reply')}</button>
          </form>
        )}
      </div>
    </li>
  );

  return (
    <section className="dsc" id="discussion">
      <header className="dsc-head">
        <h2>{t('discussion')}</h2>
        <span className="muted">{roots.length ? t('messagesN', { n: items.filter((c) => !c.deleted).length }) : t('noQuestions')}</span>
      </header>
      <form className="dsc-form" onSubmit={(e) => { e.preventDefault(); void send(text, null); }}>
        <textarea rows={2} value={text} maxLength={2000} placeholder={t('askPlaceholder')}
          aria-label={t('askAria')} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}><IconSend size={15} />{t('send')}</button>
      </form>
      {error && <p className="error-box" role="alert">{f.message(error)}</p>}
      <ul className="dsc-list">
        {roots.map((c) => (
          <li key={c.id} className="dsc-thread">
            <ul>{row(c, false)}{kids(c.id).map((k) => row(k, true))}</ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
