import { requirePageUser } from '@/lib/auth/page-guard';
import { listNotes } from '@/lib/lms/notes';
import NotesBoard from '@/components/learn/NotesBoard';
import { IconStar } from '@/components/cabinet/icons';

/** Заметки и закладки ученика — его личный конспект по всем курсам. Учителю он не виден. */
export default async function NotesPage() {
  const user = await requirePageUser('/learn/notes');
  if (!user) return null;
  const notes = await listNotes(user.id);

  return (
    <div className="learn-page">
      <header className="learn-head">
        <div>
          <h1>Заметки и закладки</h1>
          <p className="muted">Всё, что вы отметили в уроках. Видно только вам — учитель этого не читает.</p>
        </div>
      </header>
      {notes.length === 0
        ? (
          <div className="learn-empty">
            <span className="learn-empty-icon"><IconStar size={26} /></span>
            <h2>Пока пусто</h2>
            <p>В уроке под шагом есть кнопка «Заметка» и звёздочка-закладка. Отмечайте сложные места — сюда они соберутся сами.</p>
          </div>
        )
        : <NotesBoard notes={notes} />}
    </div>
  );
}
