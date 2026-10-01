'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { autoScore, emptyAnswer, isAnswerComplete, type Answer } from '@/lib/lms/answers';
import { toStudentBody, type AssignmentPayload } from '@/lib/lms/block-schema';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { learn } from '@/i18n/messages/learn';
import { learnLesson } from '@/i18n/messages/learn-lesson';
import { learnScore } from './format';
import type { RemedialStatus } from '@/lib/lms/remedial';
import { callApi } from '@/components/cabinet/api';
import type { CaptureSimState } from '@/components/lms/SimStateFrame';
import Markup from '@/components/lms/Markup';
import AnswerView from '@/components/lms/AnswerView';
import { IconBulb, IconCheck, IconTask } from '@/components/icons';
import AnswerInputs from './AnswerInputs';
import { scoreTone } from './SubmissionStatus';

/**
 * Мини-задания разбора. Баллы за них никуда не идут, учитель их не видит, поэтому
 * проверка целиком клиентская — тем же autoScore, что и на сервере, и переспросить
 * можно сколько угодно раз. Поля ответа — общие с обычным уроком (AnswerInputs).
 */

function TaskCard({ payload, index }: { payload: AssignmentPayload; index: number }) {
  const t = useT(learnLesson);
  const tl = useT(learn);
  const locale = useLocale();
  const [answer, setAnswer] = useState<Answer>(emptyAnswer(payload.spec));
  const [score, setScore] = useState<number | null>(null);
  const [hint, setHint] = useState('');
  // Состояния тренажёра в разборе не бывает (см. SELF_CHECKED), но AnswerInputs просит ссылку.
  const captureRef = useRef<CaptureSimState | null>(null);
  // Тот же вид задания, что в уроке: варианты перемешаны, ключа в схеме нет.
  const spec = useMemo(() => {
    const student = toStudentBody({ kind: 'assignment', payload });
    // Задание остаётся заданием — ветка нужна только для сужения типа.
    return student.kind === 'assignment' ? student.payload.spec : { type: 'text' as const };
  }, [payload]);

  function check() {
    if (!isAnswerComplete(answer)) {
      setHint(payload.spec.type === 'gaps' ? t('fillGaps') : t('answerFirst'));
      return;
    }
    setHint('');
    setScore(autoScore(payload, answer));
  }

  const tone = score === null ? null : scoreTone(score, payload.points);

  return (
    <article className={`rm-task${tone ? ` ${tone}` : ''}`}>
      <header className="rm-task-head">
        <span className="rm-task-num" aria-hidden="true">{index + 1}</span>
        <Markup text={payload.prompt} />
      </header>
      {tone === 'full'
        ? <AnswerView spec={payload.spec} answer={answer} />
        : (
          <AnswerInputs name={`rm-${index}`} spec={spec} answer={answer} disabled={false}
            onChange={(a) => { setAnswer(a); setScore(null); setHint(''); }} captureRef={captureRef} />
        )}
      <div className="row rm-task-foot">
        <button type="button" className="btn btn-sm btn-primary" onClick={check}>
          {score === null ? t('check') : t('checkAgain')}
        </button>
        {tone && (
          <span className={`rm-verdict ${tone}`} role="status">
            {tone === 'full' ? <><IconCheck size={14} />{t('correct')}</> : tone === 'part'
              ? t('almost', { score: learnScore(score, locale), points: tl('pointsN', { n: payload.points }) })
              : t('notYet')}
          </span>
        )}
        {hint && <span className="rm-verdict zero" role="status">{hint}</span>}
      </div>
      {tone === 'full' && payload.explanation && (
        <div className="learn-explain"><IconBulb size={18} /><Markup text={payload.explanation} /></div>
      )}
    </article>
  );
}

export default function RemedialTasks({ id, tasks, status }: {
  id: string; tasks: AssignmentPayload[]; status: RemedialStatus;
}) {
  const t = useT(learnLesson);
  const f = useFormat();
  const router = useRouter();
  const [done, setDone] = useState(status === 'done');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function finish() {
    setBusy(true);
    setError('');
    const res = await callApi(`/api/learn/remedial/${id}`, 'PATCH', { status: 'done' });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
    // Список разборов на /learn/mistakes закэширован сервером — обновляем его статус там же.
    router.refresh();
  }

  return (
    <section className="rm-tasks" aria-label={t('tasksAria')}>
      <h2 className="learn-section-title"><IconTask size={17} />{t('trySelf')}</h2>
      {tasks.map((t, i) => <TaskCard key={i} payload={t} index={i} />)}
      <div className="row rm-finish">
        {done
          ? <span className="rm-verdict full"><IconCheck size={15} />{t('closed')}</span>
          : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void finish()}>
              {busy ? t('marking') : t('understood')}
            </button>
          )}
      </div>
      {error && <p className="error-box" role="alert">{f.message(error)}</p>}
    </section>
  );
}
