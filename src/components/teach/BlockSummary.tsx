import type { Block } from '@/lib/lms/blocks';
import { ASSIGNMENT_TYPE_LABELS, type Stand } from '@/lib/lms/block-schema';
import { LABS } from '@/lib/labs';
import { formatScore, ruPlural } from '@/lib/lms/format';
import Markup from '@/components/lms/Markup';

function standText(stand: Stand, simulationTitle: string | null, missing: boolean): string {
  if (!stand) return 'без стенда';
  if (stand.kind === 'lab') return `стенд: ${LABS.find((l) => l.slug === stand.slug)?.title ?? 'лаборатория'}`;
  if (missing) return 'стенд: тренажёр удалён автором';
  return `стенд: тренажёр «${simulationTitle ?? 'без названия'}»`;
}

/** Как блок выглядит в редакторе, пока его не правят. Учитель видит и правильные ответы. */
export default function BlockSummary({ block, simulationTitle, missing }: {
  block: Block; simulationTitle: string | null; missing: boolean;
}) {
  const b = block.body;
  switch (b.kind) {
    case 'text':
      return (
        <div className="cf-summary-text">
          {b.payload.title && <h3>{b.payload.title}</h3>}
          {b.payload.body
            ? <Markup text={b.payload.body} />
            : !b.payload.title && <p className="muted">Текст пока пустой. Нажмите «Изменить».</p>}
        </div>
      );
    case 'simulation': {
      if (!b.payload.simulationId) {
        return <p className="muted">Тренажёр не выбран. Нажмите «Изменить», чтобы выбрать или сгенерировать его.</p>;
      }
      if (missing) return <p className="warn-banner">Тренажёр удалён автором. Выберите другой.</p>;
      const caption = b.payload.caption ? ` — ${b.payload.caption}` : '';
      return (
        <div className="cf-summary-media">
          <img src={`/api/simulations/${b.payload.simulationId}/thumbnail`} alt="" loading="lazy" />
          <p>{`Тренажёр «${simulationTitle ?? 'без названия'}»${caption}`}</p>
        </div>
      );
    }
    case 'lab': {
      const lab = LABS.find((l) => l.slug === b.payload.slug);
      const caption = b.payload.caption ? ` — ${b.payload.caption}` : '';
      return (
        <div className="cf-summary-media">
          <img src={`/labs/${b.payload.slug}.png`} alt="" loading="lazy" />
          <p>{`Лаборатория «${lab?.title ?? b.payload.slug}»${caption}`}</p>
        </div>
      );
    }
    case 'assignment': {
      const p = b.payload;
      const meta = [
        ASSIGNMENT_TYPE_LABELS[p.spec.type],
        `${p.points} ${ruPlural(p.points, 'балл', 'балла', 'баллов')}`,
        standText(p.stand, simulationTitle, missing),
        p.allowRetry ? 'можно сдать повторно' : 'одна попытка',
      ].join(' · ');
      return (
        <>
          <Markup text={p.prompt} />
          <p className="muted">{meta}</p>
          {p.spec.type === 'choice' && (
            <ul className="cf-summary-options">
              {p.spec.options.map((o) => (
                <li key={o.id} className={o.correct ? 'correct' : undefined}>{`${o.correct ? '✓' : '·'} ${o.text}`}</li>
              ))}
            </ul>
          )}
          {p.spec.type === 'number' && (
            <p className="muted">
              {`Правильный ответ: ${formatScore(p.spec.answer)} ± ${formatScore(p.spec.tolerance)}${p.spec.unit ? ` ${p.spec.unit}` : ''}`}
            </p>
          )}
        </>
      );
    }
  }
}
