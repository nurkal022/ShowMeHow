import type { StudentBlockBody } from '@/lib/lms/block-schema';
import type { StudentSubmission } from '@/lib/lms/answers';
import { ruPlural } from '@/lib/lms/format';
import Markup from '@/components/lms/Markup';
import SimulationEmbed from '@/components/lms/SimulationEmbed';
import { IconTask } from '@/components/icons';
import LabCard from './LabCard';
import AnswerForm from './AnswerForm';

/** Блок урока глазами ученика. Задание приходит уже без правильных ответов (toStudentBody). */
export default function LessonBlock({ blockId, body, missing, submission, preview }: {
  blockId: string; body: StudentBlockBody; missing: boolean; submission: StudentSubmission | null; preview: boolean;
}) {
  switch (body.kind) {
    case 'text':
      // Пустой текстовый блок (учитель добавил и не заполнил) ученику не показываем.
      if (!body.payload.title.trim() && !body.payload.body.trim()) return null;
      return (
        <article className="learn-block learn-text">
          {body.payload.title && <h2>{body.payload.title}</h2>}
          <Markup text={body.payload.body} />
        </article>
      );
    case 'simulation':
      return (
        <article className="learn-block learn-sim">
          <SimulationEmbed simulationId={body.payload.simulationId} missing={missing} caption={body.payload.caption} />
        </article>
      );
    case 'lab':
      return (
        <article className="learn-block learn-lab-block">
          <LabCard slug={body.payload.slug} caption={body.payload.caption} />
        </article>
      );
    case 'assignment': {
      const p = body.payload;
      const state = submission?.status ?? 'none';
      return (
        <article className={`learn-block learn-task state-${state}`} id={`block-${blockId}`}>
          <header className="learn-task-head">
            <span className="learn-task-icon"><IconTask size={16} /></span>
            <h2>Задание</h2>
            <span className="spacer" />
            <span className="learn-task-chip">{p.allowRetry ? 'можно пересдать' : 'одна попытка'}</span>
            <span className="learn-task-points">{`${p.points} ${ruPlural(p.points, 'балл', 'балла', 'баллов')}`}</span>
          </header>
          <Markup text={p.prompt} />
          {p.stand?.kind === 'simulation' && (
            <div className="learn-sim">
              <SimulationEmbed simulationId={p.stand.simulationId} missing={missing} caption="" />
            </div>
          )}
          {p.stand?.kind === 'lab' && <LabCard slug={p.stand.slug} caption="" />}
          <AnswerForm blockId={blockId} payload={p} initial={submission} preview={preview} />
        </article>
      );
    }
  }
}
