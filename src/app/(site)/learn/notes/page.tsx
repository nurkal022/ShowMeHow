import { requirePageUser } from '@/lib/auth/page-guard';
import { listNotes } from '@/lib/lms/notes';
import NotesBoard from '@/components/learn/NotesBoard';
import { IconStar } from '@/components/cabinet/icons';
import { getT } from '@/i18n/server';
import { learnMe } from '@/i18n/messages/learn-me';

/** Заметки и закладки ученика — его личный конспект по всем курсам. Учителю он не виден. */
export default async function NotesPage() {
  const user = await requirePageUser('/learn/notes');
  if (!user) return null;
  const notes = await listNotes(user.id);
  const t = await getT(learnMe);

  return (
    <div className="learn-page">
      <header className="learn-head">
        <div>
          <h1>{t('notesTitle')}</h1>
          <p className="muted">{t('notesSub')}</p>
        </div>
      </header>
      {notes.length === 0
        ? (
          <div className="learn-empty">
            <span className="learn-empty-icon"><IconStar size={26} /></span>
            <h2>{t('notesEmpty')}</h2>
            <p>{t('notesEmptyText')}</p>
          </div>
        )
        : <NotesBoard notes={notes} />}
    </div>
  );
}
