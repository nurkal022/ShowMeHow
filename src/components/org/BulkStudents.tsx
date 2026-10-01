'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CreatedStudent, RosterPreview } from '@/lib/org/bulk';
import { MAX_ROSTER_LINES } from '@/lib/org/roster';
import { callApi } from '@/components/cabinet/api';
import { IconBack, IconCheck, IconPrint, IconUpload } from '@/components/icons';
import RosterPreviewTable from './RosterPreviewTable';
import RosterGrid, { parsePasted, rosterText, type RosterRow } from './RosterGrid';
import { useT } from '@/i18n/client';
import { orgPeople } from '@/i18n/messages/org-people';

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: 'stepList' | 'stepCheck' | 'stepDone' }[] = [
  { n: 1, label: 'stepList' },
  { n: 2, label: 'stepCheck' },
  { n: 3, label: 'stepDone' },
];

/** Ученики группы в три шага: вставить список или CSV → проверить логины и дубли → лист паролей. */
export default function BulkStudents({ slug, groupId }: { slug: string; groupId: string }) {
  const router = useRouter();
  const t = useT(orgPeople);
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
    if (file.size > 1024 * 1024) return setError(t('fileTooBig'));
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
      <ol className="cf-steps-nav" aria-label={t('stepsLabel')}>
        {STEPS.map((s) => (
          <li key={s.n} className={s.n === step ? 'current' : s.n < step ? 'done' : undefined} aria-current={s.n === step ? 'step' : undefined}>
            <span className="cf-step-num" aria-hidden="true">{s.n < step ? <IconCheck size={13} /> : s.n}</span>
            <span>{t(s.label)}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="cf-wizard-body">
          <p className="muted">{t('pasteHint')}</p>
          <div className={dragging ? 'cf-drop-zone over' : 'cf-drop-zone'}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files[0]); }}>
            <RosterGrid rows={rows} onChange={(next) => { setRows(next); setFileName(''); setError(''); }} />
          </div>
          <div className="cf-inline">
            <label className="btn btn-sm cf-file-btn">
              <IconUpload size={15} />{t('uploadCsv')}
              <input type="file" accept=".csv,.txt,text/csv,text/plain" className="visually-hidden"
                onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <span className="muted">
              {fileName ? t('fileLoaded', { name: fileName }) : ''}
              {t('csvHint', { n: MAX_ROSTER_LINES })}
            </span>
          </div>
          {error && <p className="error-box" role="alert">{error}</p>}
          <div className="cf-wizard-foot">
            <span className="muted">{lines > 0 ? t('linesN', { n: lines }) : t('autoCreds')}</span>
            <button type="button" className="btn btn-primary" disabled={busy || lines === 0} onClick={check}>
              {busy ? t('checking') : t('nextCheck')}
            </button>
          </div>
          <OneStudent endpoint={endpoint} onCreated={(list) => { setCreated(list); setStep(3); router.refresh(); }} />
        </div>
      )}

      {step === 2 && preview && (
        <div className="cf-wizard-body">
          <div className="cf-summary-row" role="status">
            <span className="cf-summary-stat ok"><strong>{preview.creatable}</strong>{t('willCreate', { n: preview.creatable })}</span>
            <span className={skipped > 0 ? 'cf-summary-stat warn' : 'cf-summary-stat'}><strong>{skipped}</strong>{t('skipped', { n: skipped })}</span>
          </div>
          {skipped > 0 && (
            <p className="muted">{t('skippedNote')}</p>
          )}
          <RosterPreviewTable rows={preview.rows} />
          {error && <p className="error-box" role="alert">{error}</p>}
          <div className="cf-wizard-foot">
            <button type="button" className="btn" disabled={busy} onClick={() => { setStep(1); setError(''); }}>
              <IconBack size={15} />{t('backToList')}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || preview.creatable === 0} onClick={create}>
              {busy ? t('creating') : t('createN', { n: preview.creatable })}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="cf-wizard-body cf-wizard-done">
          <span className="cf-hero-icon ok" aria-hidden="true"><IconCheck size={26} /></span>
          <h3>{created.length === 0 ? t('noNew') : t('createdN', { n: created.length })}</h3>
          {created.length === 0
            ? <p className="muted">{t('allInGroup')}</p>
            : <p className="muted">{t('createdNote')}</p>}
          {created.length > 0 && (
            <ul className="cf-created">
              {created.map((c) => <li key={c.userId}><span>{c.displayName}</span><span className="num">{c.login}</span></li>)}
            </ul>
          )}
          <div className="cf-wizard-foot center">
            {created.length > 0 && (
              <Link className="btn btn-primary" href={`/org/groups/${groupId}/credentials`}><IconPrint size={16} />{t('openSheetPrint')}</Link>
            )}
            <button type="button" className="btn" onClick={restart}>{t('addMore')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Один опоздавший ученик — без списка и проверки. */
function OneStudent({ endpoint, onCreated }: { endpoint: string; onCreated: (created: CreatedStudent[]) => void }) {
  const t = useT(orgPeople);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <details className="cf-details">
      <summary>{t('addOne')}</summary>
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
        <label className="field"><span>{t('lastName')}</span>
          <input value={lastName} required maxLength={60} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="field"><span>{t('firstName')}</span>
          <input value={firstName} required maxLength={60} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy}>{busy ? t('adding') : t('addStudent')}</button>
        {error && <p className="error-box cf-full" role="alert">{error}</p>}
      </form>
    </details>
  );
}
