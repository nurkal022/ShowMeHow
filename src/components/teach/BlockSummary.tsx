import type { Block } from '@/lib/lms/blocks';
import { assignmentTypeLabels, type Stand } from '@/lib/lms/block-schema';
import { LABS } from '@/lib/labs';
import { formatScore } from '@/lib/lms/format';
import type { TFn } from '@/i18n/core';
import { useLocale, useT } from '@/i18n/client';
import { teachEditor } from '@/i18n/messages/teach-editor';
import { parseGaps } from '@/lib/lms/block-schema';
import Markup from '@/components/lms/Markup';
import { CalloutBlock, CodeBlock, FormulaBlock, ImageBlock, SpoilerBlock, VideoBlock } from '@/components/lms/ContentBlocks';

function standText(t: TFn<typeof teachEditor.ru>, stand: Stand, simulationTitle: string | null, missing: boolean): string {
  if (!stand) return t('sNoStand');
  if (stand.kind === 'lab') return t('sStandLab', { title: LABS.find((l) => l.slug === stand.slug)?.title ?? t('sLab') });
  if (missing) return t('sStandSimDeleted');
  return t('sStandSim', { title: simulationTitle ?? t('untitled') });
}

/** Как блок выглядит в редакторе, пока его не правят. Учитель видит и правильные ответы. */
export default function BlockSummary({ block, simulationTitle, missing }: {
  block: Block; simulationTitle: string | null; missing: boolean;
}) {
  const t = useT(teachEditor);
  const locale = useLocale();
  const b = block.body;
  switch (b.kind) {
    case 'text':
      return (
        <div className="cf-summary-text">
          {b.payload.title && <h3>{b.payload.title}</h3>}
          {b.payload.body
            ? <Markup text={b.payload.body} />
            : !b.payload.title && <p className="muted">{t('sTextEmpty')}</p>}
        </div>
      );
    case 'callout':
      return b.payload.title || b.payload.body ? <CalloutBlock payload={b.payload} /> : <p className="muted">{t('sCalloutEmpty')}</p>;
    case 'formula':
      return b.payload.latex.trim() ? <FormulaBlock payload={b.payload} /> : <p className="muted">{t('sFormulaEmpty')}</p>;
    case 'image':
      return b.payload.src ? <ImageBlock payload={b.payload} /> : <p className="muted">{t('sImageEmpty')}</p>;
    case 'video':
      return b.payload.url ? <VideoBlock payload={b.payload} /> : <p className="muted">{t('sVideoEmpty')}</p>;
    case 'spoiler':
      return b.payload.body.trim() ? <SpoilerBlock payload={b.payload} /> : <p className="muted">{t('sSpoilerEmpty')}</p>;
    case 'code':
      return b.payload.code.trim() ? <CodeBlock payload={b.payload} /> : <p className="muted">{t('sCodeEmpty')}</p>;
    case 'divider':
      return <hr className="lb-divider" />;
    case 'simulation': {
      if (!b.payload.simulationId) {
        return <p className="muted">{t('sSimEmpty')}</p>;
      }
      if (missing) return <p className="warn-banner">{t('sSimDeleted')}</p>;
      const caption = b.payload.caption ? ` — ${b.payload.caption}` : '';
      return (
        <div className="cf-summary-media">
          <img src={`/api/simulations/${b.payload.simulationId}/thumbnail`} alt="" loading="lazy" />
          <p>{t('sSim', { title: simulationTitle ?? t('untitled'), caption })}
            {Object.keys(b.payload.preset).length > 0 && <span className="muted">{b.payload.locked.length ? t('sPresetLocked', { n: b.payload.locked.length }) : t('sPreset')}</span>}
          </p>
        </div>
      );
    }
    case 'lab': {
      const lab = LABS.find((l) => l.slug === b.payload.slug);
      const caption = b.payload.caption ? ` — ${b.payload.caption}` : '';
      return (
        <div className="cf-summary-media">
          <img src={`/labs/${b.payload.slug}.png`} alt="" loading="lazy" />
          <p>{t('sLabTitle', { title: lab?.title ?? b.payload.slug, caption })}</p>
        </div>
      );
    }
    case 'assignment': {
      const p = b.payload;
      const meta = [
        assignmentTypeLabels(locale)[p.spec.type],
        t('points', { n: p.points }),
        p.spec.type === 'sim_state'
          ? (missing ? t('sSimStateDeleted') : t('sSimState', { title: simulationTitle ?? t('untitled') }))
          : standText(t, p.stand, simulationTitle, missing),
        p.allowRetry ? t('sRetry') : t('sOneTry'),
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
          {p.spec.type === 'short' && <p className="muted">{t('sAccepted', { list: p.spec.accepted.join(' · ') })}</p>}
          {p.spec.type === 'gaps' && (
            <p className="cf-summary-gaps">
              {parseGaps(p.spec.text).parts.map((part, i, all) => (
                <span key={i}>{part}{i < all.length - 1 && <mark>{parseGaps(p.spec.type === 'gaps' ? p.spec.text : '').answers[i].join(' / ')}</mark>}</span>
              ))}
            </p>
          )}
          {p.spec.type === 'match' && (
            <ul className="cf-summary-options">
              {p.spec.pairs.map((pair) => <li key={pair.id}>{`${pair.left} → ${pair.right}`}</li>)}
            </ul>
          )}
          {p.spec.type === 'order' && (
            <ol className="cf-summary-options cf-summary-order">
              {p.spec.items.map((it) => <li key={it.id}>{it.text}</li>)}
            </ol>
          )}
          {p.spec.type === 'table' && (
            <p className="muted">{t('sColumns', { list: p.spec.columns.map((c) => (c.unit ? `${c.label}, ${c.unit}` : c.label)).join(' · '), n: p.spec.minRows })}</p>
          )}
          {p.explanation && <p className="muted">{t('sExplanation', { text: p.explanation })}</p>}
          {p.spec.type === 'number' && (
            <p className="muted">
              {t('sAnswer', { answer: formatScore(p.spec.answer, locale), tol: formatScore(p.spec.tolerance, locale), unit: p.spec.unit ? ` ${p.spec.unit}` : '' })}
            </p>
          )}
          {p.spec.type === 'sim_state' && (
            <p className="muted">
              {t('sTarget', { list: p.spec.targets.map((x) => `${x.label} = ${formatScore(x.value, locale)} ± ${formatScore(x.tolerance, locale)}`).join('; ') })
                + (p.spec.showHints ? t('sHints') : t('sNoHints'))}
            </p>
          )}
        </>
      );
    }
  }
}
