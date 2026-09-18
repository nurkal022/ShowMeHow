import type { StudentBlockBody } from '@/lib/lms/block-schema';
import type { StudentSubmission } from '@/lib/lms/answers';
import { ruPlural } from '@/lib/lms/format';
import Markup from '@/components/lms/Markup';
import SimulationEmbed from '@/components/lms/SimulationEmbed';
import LabEmbed from '@/components/lms/LabEmbed';
import AnswerForm from './AnswerForm';

/** Блок урока глазами ученика. Задание приходит уже без правильных ответов (toStudentBody). */
export default function LessonBlock({ blockId, body, missing, submission, preview }: {
  blockId: string; body: StudentBlockBody; missing: boolean; submission: StudentSubmission | null; preview: boolean;
}) {
  switch (body.kind) {
    case 'text':
      return (
        <article className="lesson-block">
          {body.payload.title && <h2>{body.payload.title}</h2>}
          <Markup text={body.payload.body} />
        </article>
      );
    case 'simulation':
      return (
        <article className="lesson-block">
          <SimulationEmbed simulationId={body.payload.simulationId} missing={missing} caption={body.payload.caption} />
        </article>
      );
    case 'lab':
      return (
        <article className="lesson-block">
          <LabEmbed slug={body.payload.slug} caption={body.payload.caption} />
        </article>
      );
    case 'assignment': {
      const p = body.payload;
      return (
        <article className="lesson-block assignment" id={`block-${blockId}`}>
          <div className="row">
            <h2>Задание</h2>
            <span className="spacer" />
            <span className="muted">{`${p.points} ${ruPlural(p.points, 'балл', 'балла', 'баллов')}`}</span>
          </div>
          <Markup text={p.prompt} />
          {p.stand?.kind === 'simulation' && (
            <SimulationEmbed simulationId={p.stand.simulationId} missing={missing} caption="" />
          )}
          {p.stand?.kind === 'lab' && <LabEmbed slug={p.stand.slug} caption="" />}
          <AnswerForm blockId={blockId} payload={p} initial={submission} preview={preview} />
        </article>
      );
    }
  }
}
