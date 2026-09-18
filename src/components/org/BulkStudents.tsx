'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CreatedStudent, RosterPreview } from '@/lib/org/bulk';
import { createStudentsLabel, MAX_ROSTER_LINES } from '@/lib/org/roster';
import { ruPlural } from '@/lib/lms/format';
import { callApi } from '@/components/cabinet/api';
import { IconBack, IconCheck, IconPrint, IconUpload } from '@/components/icons';
import RosterPreviewTable from './RosterPreviewTable';
import RosterGrid, { parsePasted, rosterText, type RosterRow } from './RosterGrid';

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Список' },
  { n: 2, label: 'Проверка' },
  { n: 3, label: 'Готово' },
];

/** Ученики группы в три шага: вставить список или CSV → проверить логины и дубли → лист паролей. */
export default function BulkStudents({ slug, groupId }: { slug: string; groupId: string }) {
  const router = useRouter();
  const endpoint = `/api/org/${slug}/groups/${groupId}/students`;
  const [step, setStep] = useState<Step>(1);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const text = rosterText(rows);
  const setText = (t: string) => setRows(parsePasted(t));
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [created, setCreated] = useState<CreatedStudent[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lines = text.split('\n').filter((l) => l.trim()).length;

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) return setError('Файл слишком большой. Нужен CSV со списком, до 300 строк.');
    setText(await file.text());
    setFileName(file.name);
    setError('');
  }

  async function check() {
    setBusy(true);
    setError('');
    const res = await callApi<RosterPreview>(endpoint, 'POST', { text, dryRun: true });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPreview(res.data);
    setStep(2);
  }

  async function create() {
    setBusy(true);
    setError('');
    const res = await callApi<{ created: CreatedStudent[] }>(endpoint, 'POST', { text, dryRun: false });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setCreated(res.data.created);
    setStep(3);
    router.refresh();
  }

  function restart() {
    setRows([]); setFileName(''); setPreview(null); setCreated([]); setError(''); setStep(1);
  }

  const skipped = preview ? preview.rows.length - preview.creatable : 0;

  return (
    <div className="cf-wizard">
      <ol className="cf-steps-nav" aria-label="Шаги добавления учеников">
        {STEPS.map((s) => (
          <li key={s.n} className={s.n === step ? 'current' : s.n < step ? 'done' : undefined} aria-current={s.n === step ? 'step' : undefined}>
            <span className="cf-step-num" aria-hidden="true">{s.n < step ? <IconCheck size={13} /> : s.n}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="cf-wizard-body">
          <p className="muted">Скопируйте столбцы «Фамилия» и «Имя» из Excel или ведомости и вставьте в первую ячейку (Ctrl+V) — строки разложатся сами. Можно печатать и вручную: Enter — следующая строка.</p>
          <div className={dragging ? 'cf-drop-zone over' : 'cf-drop-zone'}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files[0]); }}>
            <RosterGrid rows={rows} onChange={(next) => { setRows(next); setFileName(''); setError(''); }} />
          </div>
          <div className="cf-inline">
            <label className="btn btn-sm cf-file-btn">
              <IconUpload size={15} />Загрузить CSV
              <input type="file" accept=".csv,.txt,text/csv,text/plain" className="visually-hidden"
                onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <span className="muted">
              {fileName ? `Загружен файл «${fileName}». ` : ''}
              {`CSV: «Фамилия;Имя» или «Фамилия,Имя», кодировка UTF-8, до ${MAX_ROSTER_LINES} строк. Файл можно перетащить на таблицу.`}
            </span>
          </div>
          {error && <p className="error-box" role="alert">{error}</p>}
          <div className="cf-wizard-foot">
            <span className="muted">{lines > 0 ? `Строк в списке: ${lines}` : 'Логины и временные пароли создадутся сами.'}</span>
            <button type="button" className="btn btn-primary" disabled={busy || lines === 0} onClick={check}>
              {busy ? 'Проверяю…' : 'Дальше: проверить список'}
            </button>
          </div>
          <OneStudent endpoint={endpoint} onCreated={(list) => { setCreated(list); setStep(3); router.refresh(); }} />
        </div>
      )}

      {step === 2 && preview && (
        <div className="cf-wizard-body">
          <div className="cf-summary-row" role="status">
            <span className="cf-summary-stat ok"><strong>{preview.creatable}</strong>{ruPlural(preview.creatable, 'будет создан', 'будут созданы', 'будут созданы')}</span>
            <span className={skipped > 0 ? 'cf-summary-stat warn' : 'cf-summary-stat'}><strong>{skipped}</strong>{ruPlural(skipped, 'строка пропущена', 'строки пропущены', 'строк пропущено')}</span>
          </div>
          {skipped > 0 && (
            <p className="muted">Строки с пометками не создадутся: это дубли, ученики, которые уже есть в группе, или неполные имена. Вернитесь к списку, чтобы исправить.</p>
          )}
          <RosterPreviewTable rows={preview.rows} />
          {error && <p className="error-box" role="alert">{error}</p>}
          <div className="cf-wizard-foot">
            <button type="button" className="btn" disabled={busy} onClick={() => { setStep(1); setError(''); }}>
              <IconBack size={15} />Назад к списку
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || preview.creatable === 0} onClick={create}>
              {busy ? 'Создаю…' : createStudentsLabel(preview.creatable)}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="cf-wizard-body cf-wizard-done">
          <span className="cf-hero-icon ok" aria-hidden="true"><IconCheck size={26} /></span>
          <h3>{created.length === 0 ? 'Новых учеников нет' : `Создано учеников: ${created.length}`}</h3>
          {created.length === 0
            ? <p className="muted">Все из списка уже были в группе.</p>
            : <p className="muted">У каждого — логин и временный пароль. Распечатайте лист паролей, разрежьте и раздайте карточки: при первом входе ученик придумает свой пароль.</p>}
          {created.length > 0 && (
            <ul className="cf-created">
              {created.map((c) => <li key={c.userId}><span>{c.displayName}</span><span className="num">{c.login}</span></li>)}
            </ul>
          )}
          <div className="cf-wizard-foot center">
            {created.length > 0 && (
              <Link className="btn btn-primary" href={`/org/groups/${groupId}/credentials`}><IconPrint size={16} />Открыть лист паролей для печати</Link>
            )}
            <button type="button" className="btn" onClick={restart}>Добавить ещё учеников</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Один опоздавший ученик — без списка и проверки. */
function OneStudent({ endpoint, onCreated }: { endpoint: string; onCreated: (created: CreatedStudent[]) => void }) {
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <details className="cf-details">
      <summary>Добавить одного ученика</summary>
      <form className="cf-inline-form" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const res = await callApi<{ created: CreatedStudent[] }>(endpoint, 'POST', { text: `${lastName};${firstName}`, dryRun: false });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setLastName(''); setFirstName('');
        onCreated(res.data.created);
      }}>
        <label className="field"><span>Фамилия</span>
          <input value={lastName} required maxLength={60} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="field"><span>Имя</span>
          <input value={firstName} required maxLength={60} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Добавляю…' : 'Добавить ученика'}</button>
        {error && <p className="error-box cf-full" role="alert">{error}</p>}
      </form>
    </details>
  );
}
